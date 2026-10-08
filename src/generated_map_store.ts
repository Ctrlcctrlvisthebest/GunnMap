import { randomUUID } from 'node:crypto';
import { constants, watch, type FSWatcher } from 'node:fs';
import { lstat, mkdir, open, readdir, rename, rm, writeFile, type FileHandle } from 'node:fs/promises';
import { resolve } from 'node:path';
import { GENERATED_MAP_FILENAME, removeExpiredMap } from './output_retention.js';
import { HttpError } from './server_policy.js';

export const DEFAULT_MAP_STORAGE_BYTES = 512 * 1024 * 1024;
export const DEFAULT_MAP_MAX_BYTES = 16 * 1024 * 1024;
const STORED_FILE = /^period_map_[0-9a-f]{32}\.png(?:\.json)?$/;
const MAX_METADATA_BYTES = 1024;
const STAT_CONCURRENCY = 16;
export interface GeneratedMapMetadata { map_revision: string; generated_at: string }

/** Completed PNGs are immutable. Track owned writes/deletes incrementally and
 * watch operator changes; the server also reconciles periodically. If watching
 * fails, conservatively rescan before admission/writes rather than trust a stale
 * count. Reservations and all accounting changes share the same critical section. */
export class GeneratedMapStore {
  private reserved = 0;
  private used = 0;
  private pending: Promise<unknown> = Promise.resolve();
  private inventory = new Map<string, number>();
  private changed = new Set<string>();
  private watcher?: FSWatcher;
  private directoryStamp = '';
  private initialized = false;
  private rescan = false;
  private closed = false;
  constructor(private readonly dir: string, private readonly budget: number, private readonly maxImageBytes: number, private readonly retentionMs: number) {}

  private async exclusive<T>(run: () => Promise<T>): Promise<T> {
    const previous = this.pending;
    let release!: () => void;
    this.pending = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try { return await run(); }
    finally { release(); }
  }

  private async stamp(): Promise<string> {
    const info = await lstat(this.dir, { bigint: true });
    if (!info.isDirectory()) throw new Error('Generated map output must be a directory');
    return `${info.dev}:${info.ino}:${info.mtimeNs}:${info.ctimeNs}`;
  }

  private account(filename: string, bytes: number | undefined) {
    this.used -= this.inventory.get(filename) ?? 0;
    if (bytes === undefined) this.inventory.delete(filename);
    else { this.inventory.set(filename, bytes); this.used += bytes; }
  }

  private async syncFile(filename: string, expire = false, now = Date.now()): Promise<void> {
    try {
      const info = await lstat(resolve(this.dir, filename));
      if (!info.isFile()) { this.account(filename, undefined); return; }
      if (expire && GENERATED_MAP_FILENAME.test(filename) && now - info.mtimeMs >= this.retentionMs) {
        await removeExpiredMap(this.dir, filename, this.retentionMs, now);
        // The retention helper removes the matching metadata as well.
        await this.syncFile(filename);
        await this.syncFile(filename + '.json');
        return;
      }
      if (expire && filename.endsWith('.json') && now - info.mtimeMs >= this.retentionMs) {
        try { await lstat(resolve(this.dir, filename.slice(0, -5))); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          await rm(resolve(this.dir, filename));
          this.account(filename, undefined);
          return;
        }
      }
      this.account(filename, info.size);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.account(filename, undefined);
    }
  }

  /** Bound filesystem work without leaving unfinished workers outside the
   * accounting lock on failure. Process PNGs before their sidecars because image
   * expiry can remove both; all accounting mutations remain in one transaction. */
  private async syncFiles(names: string[], now = Date.now()): Promise<void> {
    for (const sidecars of [false, true]) {
      const phase = names.filter(name => name.endsWith('.json') === sidecars);
      let next = 0;
      const workers = Array.from({ length: Math.min(STAT_CONCURRENCY, phase.length) }, async () => {
        while (next < phase.length) await this.syncFile(phase[next++], true, now);
      });
      const settled = await Promise.allSettled(workers);
      const failure = settled.find(result => result.status === 'rejected');
      if (failure?.status === 'rejected') {
        // A failed reconciliation may have replaced only part of the inventory.
        // Never allow an unchanged directory stamp to certify that partial count.
        this.rescan = true;
        throw failure.reason;
      }
    }
  }

  private async reconcile(): Promise<void> {
    this.rescan = false;
    this.changed.clear();
    const before = await this.stamp();
    const names = (await readdir(this.dir)).filter(name => STORED_FILE.test(name));
    this.inventory.clear(); this.used = 0;
    await this.syncFiles(names);
    this.directoryStamp = await this.stamp();
    // Do not certify a directory changed during enumeration. The next operation
    // repeats reconciliation, including changes whose watch delivery is delayed.
    if (before !== this.directoryStamp) this.rescan = true;
  }

  private async refresh(): Promise<void> {
    if (this.closed) throw new Error('Generated map store is closed');
    if (!this.initialized) {
      await mkdir(this.dir, { recursive: true });
      // Start watching before the initial scan so changes during it are retained.
      try {
        this.watcher = watch(this.dir, { persistent: false }, (_event, filename) => {
          if (filename === null) this.rescan = true;
          else if (STORED_FILE.test(filename.toString())) this.changed.add(filename.toString());
        });
        this.watcher.on('error', () => { this.watcher?.close(); this.watcher = undefined; this.rescan = true; });
      } catch { this.rescan = true; }
      await this.reconcile();
      this.initialized = true;
      return;
    }
    // New/deleted entries change directory metadata even before watch callbacks
    // arrive. In-place external edits are checked from their named watch events.
    if (!this.watcher || this.rescan || await this.stamp() !== this.directoryStamp) {
      await this.reconcile();
      return;
    }
    const changes = [...this.changed];
    for (const filename of changes) this.changed.delete(filename);
    await this.syncFiles(changes);
    if (changes.length) this.directoryStamp = await this.stamp();
  }

  /** Full reconciliation/expiry runs at startup and on the server's timer. */
  async cleanup(): Promise<void> {
    await this.exclusive(async () => {
      if (this.closed) return;
      if (!this.initialized) await this.refresh();
      else { await this.reconcile(); }
    });
  }

  close(): void { this.closed = true; this.watcher?.close(); this.watcher = undefined; }

  async reserve(): Promise<{ write: (bytes: Buffer, signal?: AbortSignal, metadata?: GeneratedMapMetadata) => Promise<string>; release: () => void }> {
    await this.exclusive(async () => {
      await this.refresh();
      if (this.rescan) await this.refresh();
      if (this.rescan) throw new HttpError(503, 'Map storage is changing. Please try again later.', 1);
      if (this.used + this.reserved + this.maxImageBytes > this.budget) {
        throw new HttpError(503, 'Map storage is full. Please try again later.', 60);
      }
      this.reserved += this.maxImageBytes;
    });
    let released = false;
    let written = false;
    const release = () => { if (!released) { released = true; this.reserved -= this.maxImageBytes; } };
    return {
      release,
      write: async (bytes, signal, metadata) => this.exclusive(async () => {
        if (released || written) throw new Error('Map reservation is no longer available');
        if (signal?.aborted) throw new HttpError(503, 'Map request was cancelled');
        if (bytes.length > this.maxImageBytes) throw new HttpError(503, 'Generated map exceeds the image size limit');
        const metadataBytes = metadata ? Buffer.from(JSON.stringify(validateMetadata(metadata))) : undefined;
        if (metadataBytes && metadataBytes.length > MAX_METADATA_BYTES) throw new Error('Invalid generated map metadata');
        await this.refresh();
        // Expiry or external edits during a reconciliation can change directory
        // membership. Refresh it once more before committing, then fail closed if
        // it still cannot be stabilized rather than accept uncertain accounting.
        if (this.rescan) await this.refresh();
        if (this.rescan) throw new HttpError(503, 'Map storage is changing. Please try again later.', 1);
        // Watch delivery can lag (notably macOS): verify known files once before
        // commit to catch immediate external in-place growth. This safety pass
        // does not enumerate the directory or recount it several times per render.
        await this.syncFiles([...this.inventory.keys()]);
        if (this.used + this.reserved + (metadataBytes?.length ?? 0) > this.budget) throw new HttpError(503, 'Map storage is full. Please try again later.', 60);
        const filename = `period_map_${randomUUID().replaceAll('-', '')}.png`;
        const temporary = resolve(this.dir, `.${filename}.tmp`);
        const metadataName = filename + '.json';
        const metadataTemporary = resolve(this.dir, `.${metadataName}.tmp`);
        const metadataPath = resolve(this.dir, metadataName);
        let publishedMetadata = false;
        try {
          await writeFile(temporary, bytes, { flag: 'wx' });
          if (metadataBytes) {
            await writeFile(metadataTemporary, metadataBytes, { flag: 'wx' });
            await rename(metadataTemporary, metadataPath);
            publishedMetadata = true;
          }
          if (signal?.aborted) throw new HttpError(503, 'Map request was cancelled');
          // Metadata is durable before the image URL becomes available.
          await rename(temporary, resolve(this.dir, filename));
          this.account(filename, bytes.length);
          if (metadataBytes) this.account(metadataName, metadataBytes.length);
          this.directoryStamp = await this.stamp();
          written = true;
          release();
          return filename;
        } finally {
          await rm(temporary, { force: true });
          await rm(metadataTemporary, { force: true });
          if (!written && publishedMetadata) await rm(metadataPath, { force: true });
        }
      }),
    };
  }

  /** Open one regular image without following links. A file handle keeps the
   * streamed bytes bound to the validated file, even if the pathname changes.
   * Reads do not change storage accounting and must not wait behind a quota scan
   * or PNG write. Expired files are refused here and removed by reconciliation. */
  async openImage(filename: string): Promise<{ handle: FileHandle; size: number; metadata?: GeneratedMapMetadata }> {
    if (!GENERATED_MAP_FILENAME.test(filename)) throw new HttpError(404, 'Not found');
    if (this.closed) throw new Error('Generated map store is closed');
    const handle = await openRegular(resolve(this.dir, filename));
    try {
      if (this.closed) throw new Error('Generated map store is closed');
      const info = await handle.stat();
      if (Date.now() - info.mtimeMs >= this.retentionMs) throw new HttpError(404, 'Not found');
      let metadata: GeneratedMapMetadata | undefined;
      let metadataHandle: FileHandle | undefined;
      try {
        metadataHandle = await openRegular(resolve(this.dir, filename + '.json'));
        if ((await metadataHandle.stat()).size <= MAX_METADATA_BYTES) {
          // Bound the read even if an operator grows the sidecar after stat.
          const bytes = Buffer.alloc(MAX_METADATA_BYTES + 1);
          const { bytesRead } = await metadataHandle.read(bytes, 0, bytes.length, 0);
          if (bytesRead <= MAX_METADATA_BYTES) metadata = validateMetadata(JSON.parse(bytes.subarray(0, bytesRead).toString('utf8')));
        }
      } catch (error) {
        // Legacy PNGs or invalid/unavailable sidecars have unknown provenance.
        if (!(error instanceof HttpError) && !(error instanceof SyntaxError) && (error as NodeJS.ErrnoException).code !== 'ENOENT' && (error as NodeJS.ErrnoException).code !== 'ELOOP') throw error;
      } finally { await metadataHandle?.close(); }
      return { handle, size: info.size, metadata };
    } catch (error) { await handle.close(); throw error; }
  }
}

function validateMetadata(value: unknown): GeneratedMapMetadata {
  if (!value || typeof value !== 'object') throw new HttpError(404, 'Invalid generated map metadata');
  const data = value as Partial<GeneratedMapMetadata>;
  if (typeof data.map_revision !== 'string' || !/^[a-f0-9]{64}$/.test(data.map_revision)
    || typeof data.generated_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(data.generated_at)
    || !Number.isFinite(Date.parse(data.generated_at))
    || new Date(data.generated_at).toISOString() !== data.generated_at) throw new HttpError(404, 'Invalid generated map metadata');
  return { map_revision: data.map_revision, generated_at: data.generated_at };
}

async function openRegular(path: string): Promise<FileHandle> {
  let handle: FileHandle;
  try { handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
  catch (error) {
    if (['ENOENT', 'ELOOP', 'EISDIR', 'ENXIO'].includes((error as NodeJS.ErrnoException).code ?? '')) throw new HttpError(404, 'Not found');
    throw error;
  }
  if (!(await handle.stat()).isFile()) { await handle.close(); throw new HttpError(404, 'Not found'); }
  return handle;
}
