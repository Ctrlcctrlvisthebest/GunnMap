import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';

const compressGzip = promisify(gzip);
const isCompressible = (type: string) => /^(?:text\/|application\/(?:json|javascript|manifest\+json)|image\/svg\+xml)/.test(type);
const etag = (bytes: Buffer) => `"${createHash('sha256').update(bytes).digest('base64url')}"`;
interface Representation { bytes: Buffer; etag: string }
interface Entry {
  version: string | Buffer;
  plain: Representation;
  compressed?: Promise<Representation>;
  size: number;
}

/** Public representations only. Private maps must never enter this cache. Each
 * filesystem hit checks metadata; unchanged validators need no reads or gzip. */
export class PublicResponseCache {
  private readonly entries = new Map<string, Entry>();
  private readonly loading = new Map<string, Promise<Entry>>();
  private size = 0;
  constructor(private readonly maxBytes = 32 * 1024 * 1024, private readonly maxEntries = 256) {}

  private makeEntry(version: string | Buffer, bytes: Buffer): Entry {
    return { version, plain: { bytes, etag: etag(bytes) }, size: bytes.length };
  }
  private remove(key: string): void {
    const existing = this.entries.get(key);
    if (existing) { this.size -= existing.size; this.entries.delete(key); }
  }
  private remember(key: string, entry: Entry): Entry {
    this.remove(key);
    if (entry.size > this.maxBytes) return entry;
    this.entries.set(key, entry);
    this.size += entry.size;
    this.trim();
    return entry;
  }
  private trim(): void {
    while (this.size > this.maxBytes || this.entries.size > this.maxEntries) this.remove(this.entries.keys().next().value!);
  }
  private reuse(key: string, version: string | Buffer): Entry | undefined {
    const entry = this.entries.get(key);
    if (entry?.version !== version) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry;
  }
  buffer(key: string, bytes: Buffer): Entry {
    const id = `buffer:${key}`;
    return this.reuse(id, bytes) ?? this.remember(id, this.makeEntry(bytes, bytes));
  }
  async file(path: string): Promise<Entry> {
    const id = `file:${path}`;
    let info;
    try { info = await stat(path); }
    catch (error) { this.remove(id); throw error; }
    if (!info.isFile()) throw Object.assign(new Error('Not a file'), { code: 'ENOENT' });
    const version = `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
    const existing = this.reuse(id, version);
    if (existing) return existing;
    // Concurrent first requests share both disk IO and compression. In-flight
    // reads are also bounded to avoid a separate unbounded pending cache.
    const pendingKey = `${id}:${version}`;
    const pending = this.loading.get(pendingKey);
    if (pending) return pending;
    const read = readFile(path).then(bytes => this.remember(id, this.makeEntry(version, bytes)));
    if (this.loading.size < this.maxEntries) this.loading.set(pendingKey, read);
    try { return await read; }
    finally { this.loading.delete(pendingKey); }
  }
  private async compressed(entry: Entry): Promise<Representation> {
    if (!entry.compressed) {
      entry.compressed = compressGzip(entry.plain.bytes).then(bytes => {
        const result = { bytes, etag: etag(bytes) };
        // An eviction during gzip must not inflate accounting for removed data.
        if ([...this.entries.values()].includes(entry)) {
          entry.size += bytes.length;
          this.size += bytes.length;
          this.trim();
        }
        return result;
      }).catch(error => { entry.compressed = undefined; throw error; });
    }
    return entry.compressed;
  }
  async send(req: IncomingMessage, res: ServerResponse, entry: Entry, type: string, cacheControl = 'no-cache', extraHeaders: Record<string, string> = {}): Promise<void> {
    const text = isCompressible(type);
    const quality = encodingQualities(req.headers['accept-encoding']);
    const useGzip = text && quality.gzip > 0 && quality.gzip >= quality.identity && (entry.plain.bytes.length >= 1024 || quality.identity === 0);
    if (!useGzip && quality.identity === 0) {
      const body = JSON.stringify({ error: 'No acceptable content encoding' });
      res.writeHead(406, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Accept-Encoding', 'Content-Length': Buffer.byteLength(body) });
      res.end(body);
      return;
    }
    const representation = useGzip ? await this.compressed(entry) : entry.plain;
    const headers = {
      'Content-Type': type, 'Cache-Control': cacheControl, ETag: representation.etag,
      ...(text ? { Vary: 'Accept-Encoding' } : {}), ...(useGzip ? { 'Content-Encoding': 'gzip' } : {}), ...extraHeaders,
    };
    const validators = req.headers['if-none-match']?.split(',').map(value => value.trim().replace(/^W\//, ''));
    if (validators?.some(value => value === '*' || value === representation.etag)) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Length': representation.bytes.length });
    res.end(representation.bytes);
  }
}

function encodingQualities(header: string | undefined) {
  const encodings = new Map<string, number>();
  for (const token of header?.split(',') ?? []) {
    const [name, ...parameters] = token.trim().toLowerCase().split(';');
    const qualityParameter = parameters.map(value => value.trim()).find(value => value.startsWith('q='));
    const quality = qualityParameter === undefined ? 1 : Number(qualityParameter.slice(2));
    encodings.set(name, Number.isFinite(quality) && quality >= 0 && quality <= 1 ? quality : 0);
  }
  return {
    gzip: encodings.get('gzip') ?? encodings.get('*') ?? 0,
    identity: encodings.get('identity') ?? (encodings.get('*') === 0 ? 0 : 1),
  };
}
