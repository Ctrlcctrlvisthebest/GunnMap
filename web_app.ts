import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import sharp from 'sharp';
import { ROOT, rooms, buildings, roomData, resolveRoom } from './project.js';
import { findRoomMatches } from './src/domain/room-matching.js';
import { evacuationDataIssues, evacuationForRoom, evacuationOverview } from './evacuation.js';
import { renderRooms, xml } from './map_highlighter.js';
import { cleanupGeneratedMaps, configuredRetentionMs, DEFAULT_CLEANUP_INTERVAL_MS, removeExpiredMap, validateRetentionMs } from './output_retention.js';
export { resolveRoom } from './project.js';
class InputError extends Error {}
interface LegendItem { period: number; label: string; floor: number; color: string }
const REVALIDATE_STATIC = 'no-cache';
const compressGzip = promisify(gzip);

const evacuationIssues = evacuationDataIssues();
if (evacuationIssues.length) {
  console.error('Evacuation data needs review:', evacuationIssues.join(' '));
}

async function addScheduleLegend(image: Buffer, selected: LegendItem[]): Promise<Buffer> {
  if (!selected.length) return image;
  const { width, height } = await sharp(image).metadata();
  if (!width || !height) throw new Error('Map dimensions are missing');
  const padding = 24;
  const rowHeight = 34;
  const legendWidth = 420;
  const legendHeight = 90 + rowHeight * selected.length;
  const left = Math.max(padding, Math.min(420, width - legendWidth - padding));
  const top = height - legendHeight - padding;
  const replacements: Record<string, string> = { HEIGHT: String(legendHeight) };

  for (let index = 0; index < 7; index += 1) {
    const item = selected[index];
    const row = index + 1;
    replacements[`ROW_${row}_DISPLAY`] = item ? 'inline' : 'none';
    replacements[`ROW_${row}_COLOR`] = item ? xml(item.color) : '#000000';
    replacements[`ROW_${row}_LABEL`] = item
      ? xml(`Period ${item.period} · ${item.label}${item.floor === 2 ? ' (2F)' : ''}`)
      : '';
  }

  const assetPath = resolve(ROOT, 'src/map/schedule-legend.svg');
  const asset = await readFile(assetPath, 'utf8');
  const legend = asset.replace(/__([A-Z0-9_]+)__/g, (_, name: string) => replacements[name] ?? '');
  return sharp(image)
    .composite([{ input: Buffer.from(legend), left, top }])
    .removeAlpha()
    .png()
    .toBuffer();
}

export async function renderPeriods(periods: unknown, outputDir = resolve(ROOT,'output')) {
  if (!Array.isArray(periods) || periods.length !== 7) throw new InputError('Please submit all seven period slots');
  const colors: Record<string, string[]> = {};
  const selected = [];
  const warnings: string[] = [];

  for (const [slot, value] of periods.entries()) {
    const index = slot + 1;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new InputError(`Period ${index} has invalid data`);
    }

    const period = value as Record<string, unknown>;
    const building = String(period.building ?? '').trim().toUpperCase();
    const roomName = String(period.room ?? '').trim();
    const color = String(period.color ?? '').trim();
    if (!roomName) continue;
    if (!building) throw new InputError(`Period ${index}: choose a building for ${roomName}`);
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new InputError(`Period ${index}: invalid color`);

    let room;
    try {
      room = resolveRoom(building, roomName);
    } catch (error) {
      throw new InputError(`Period ${index}: ${(error as Error).message}`);
    }

    (colors[room.id] ??= []).push(color);
    selected.push({
      period: index,
      id: room.id,
      label: room.label,
      building: room.building,
      floor: room.floor ?? 1,
      color,
      polygon: room.polygon,
      evacuation: evacuationForRoom(room),
      marker: [
        (room.label_box[0] + room.label_box[2]) / 2,
        (room.label_box[1] + room.label_box[3]) / 2,
      ],
    });
  }

  for (const id of Object.keys(colors)) {
    const shared = selected.filter(item => item.id === id);
    if (shared.length > 1) {
      warnings.push(`Periods ${shared.map(item => item.period).join(', ')} share ${shared[0].label}; its map highlight is split into each period's color.`);
    }
  }

  const highlighted = await renderRooms(colors, { opacity: 0.55 });
  const bytes = await addScheduleLegend(highlighted, selected);
  await mkdir(outputDir, { recursive: true });
  const id = randomUUID().replaceAll('-', '');
  const filename = `period_map_${id}.png`;
  const temporary = resolve(outputDir, `.${filename}.tmp`);
  try {
    await writeFile(temporary, bytes, { flag: 'wx' });
    await rename(temporary, resolve(outputDir, filename));
  } finally {
    await rm(temporary, { force: true });
  }

  return { image_url: `/output/${filename}`, selected, warnings, map_size: roomData.image_size };
}

function send(
  res: ServerResponse,
  status: number,
  body: string | Buffer,
  type = 'application/json; charset=utf-8',
) {
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
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

async function sendCached(
  req: IncomingMessage,
  res: ServerResponse,
  body: Buffer,
  type: string,
  cacheControl = REVALIDATE_STATIC,
  extraHeaders: Record<string, string> = {},
) {
  const text = /^(?:text\/|application\/(?:json|javascript|manifest\+json)|image\/svg\+xml)/.test(type);
  const quality = encodingQualities(req.headers['accept-encoding']);
  const useGzip = text && quality.gzip > 0 && quality.gzip >= quality.identity && (body.length >= 1024 || quality.identity === 0);
  if (!useGzip && quality.identity === 0) {
    res.setHeader('Vary', 'Accept-Encoding');
    return send(res, 406, JSON.stringify({ error: 'No acceptable content encoding' }));
  }
  const representation = useGzip ? await compressGzip(body) : body;
  const etag = `"${createHash('sha256').update(representation).digest('base64url')}"`;
  const headers = {
    'Content-Type': type,
    'Cache-Control': cacheControl,
    ETag: etag,
    ...(text ? { Vary: 'Accept-Encoding' } : {}),
    ...(useGzip ? { 'Content-Encoding': 'gzip' } : {}),
    ...extraHeaders,
  };
  const validators = req.headers['if-none-match']?.split(',').map(value => value.trim().replace(/^W\//, ''));
  if (validators?.some(value => value === '*' || value === etag)) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  res.writeHead(200, {
    ...headers,
    'Content-Length': representation.length,
  });
  res.end(representation);
}
async function payload(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16000) throw new InputError('Request is empty or too large');
    chunks.push(chunk);
  }
  if (!size) {
    throw new InputError('Request is empty or too large');
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new InputError('Invalid JSON request');
  }
}

export interface AppOptions { retentionMs?: number; cleanupIntervalMs?: number }
export function createApp(outputDir = resolve(ROOT, 'output'), options: AppOptions = {}) {
  const retentionMs = validateRetentionMs(options.retentionMs ?? configuredRetentionMs());
  const cleanupIntervalMs = options.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS;
  if (!Number.isFinite(cleanupIntervalMs) || cleanupIntervalMs <= 0 || cleanupIntervalMs > 2 ** 31 - 1) {
    throw new Error('Cleanup interval must be between 1 and 2147483647 milliseconds');
  }
  const roomList = rooms.map(({ id, label, building, floor, aliases }) => ({
    id, label, building, floor: floor ?? 1, aliases: aliases ?? [],
  }));
  const roomDirectory = Buffer.from(JSON.stringify({ buildings, rooms: roomList }));
  const locatedRooms = rooms.map(room => ({
    id: room.id,
    label: room.label,
    building: room.building,
    floor: room.floor ?? 1,
    aliases: room.aliases ?? [],
    polygon: room.polygon,
    marker: [
      (room.label_box[0] + room.label_box[2]) / 2,
      (room.label_box[1] + room.label_box[3]) / 2,
    ],
    evacuation: evacuationForRoom(room),
  }));
  const offlineRoomDirectory = Buffer.from(JSON.stringify({ rooms: locatedRooms, map_size: roomData.image_size }));
  // Inventory and assignments are loaded once at startup. Avoid repeating the
  // synchronous image provenance check on every public API request.
  const evacuationDirectory = Buffer.from(JSON.stringify(evacuationOverview()));
  const server = createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url ?? '/', 'http://localhost');
      const pathname = requestUrl.pathname;

      if (req.method === 'POST' && pathname === '/api/render') {
        const body = await payload(req);
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          throw new InputError('Invalid request object');
        }
        const result = await renderPeriods(
          (body as { periods?: unknown }).periods,
          outputDir,
        );
        return send(res, 200, JSON.stringify(result));
      }
      if (req.method !== 'GET') {
        const status = req.method === 'POST' ? 404 : 405;
        return send(res, status, JSON.stringify({ error: 'Not found' }));
      }
      if (pathname === '/api/rooms') {
        return await sendCached(req, res, roomDirectory, 'application/json; charset=utf-8');
      }
      if (pathname === '/api/offline-rooms') {
        return await sendCached(req, res, offlineRoomDirectory, 'application/json; charset=utf-8');
      }
      if (pathname === '/api/room-lookup') {
        const query = requestUrl.searchParams.get('q')?.trim() ?? '';
        if (!query) throw new InputError('Enter a room number or room alias.');
        const matches = findRoomMatches(locatedRooms, query);
        return send(res, 200, JSON.stringify({ rooms: matches, map_size: roomData.image_size }));
      }
      if (pathname === '/api/evacuation-data') {
        return await sendCached(req, res, evacuationDirectory, 'application/json; charset=utf-8');
      }
      if (pathname === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }

      const files: Record<string, [string, string]> = {
        '/': ['web/index.html', 'text/html; charset=utf-8'],
        '/evacuation': ['web/index.html', 'text/html; charset=utf-8'],
        '/evacuation/': ['web/index.html', 'text/html; charset=utf-8'],
        '/find-room': ['web/index.html', 'text/html; charset=utf-8'],
        '/find-room/': ['web/index.html', 'text/html; charset=utf-8'],
        '/generate-map': ['web/index.html', 'text/html; charset=utf-8'],
        '/generate-map/': ['web/index.html', 'text/html; charset=utf-8'],
        '/main.js': ['dist/web/main.js', 'text/javascript; charset=utf-8'],
        '/sw.js': ['dist/web/sw.js', 'text/javascript; charset=utf-8'],
        '/style.css': ['web/style.css', 'text/css; charset=utf-8'],
        '/ui.css': ['dist/web/ui.css', 'text/css; charset=utf-8'],
        '/manifest.webmanifest': ['web/manifest.webmanifest', 'application/manifest+json; charset=utf-8'],
        '/icon.svg': ['web/icon.svg', 'image/svg+xml'],
        '/apple-touch-icon.png': ['web/apple-touch-icon.png', 'image/png'],
        '/pwa-icon-192.png': ['web/pwa-icon-192.png', 'image/png'],
        '/pwa-icon-512.png': ['web/pwa-icon-512.png', 'image/png'],
        '/map.png': ['src/map/gunn_site_map.png', 'image/png'],
        '/evacuation-map.png': ['src/map/gunn_evacuation_map.png', 'image/png'],
      };

      let file = files[pathname];
      let cacheControl = REVALIDATE_STATIC;
      const generatedMap = pathname.match(/^\/output\/(period_map_[0-9a-f]{32}\.png)$/);
      if (generatedMap) {
        await removeExpiredMap(outputDir, generatedMap[1], retentionMs);
        file = [resolve(outputDir, generatedMap[1]), 'image/png'];
      }

      const assetPath = pathname.match(/^\/assets\/[A-Za-z0-9_-][A-Za-z0-9._-]*\.(?:js|css|woff2|woff|svg|png)$/);
      if (assetPath) {
        const extension = pathname.slice(pathname.lastIndexOf('.') + 1);
        const contentTypes: Record<string, string> = {
          js: 'text/javascript; charset=utf-8',
          css: 'text/css; charset=utf-8',
          woff2: 'font/woff2',
          woff: 'font/woff',
          svg: 'image/svg+xml',
          png: 'image/png',
        };
        file = [`dist/web/${pathname.slice(1)}`, contentTypes[extension]];
        if (/-[A-Za-z0-9_-]{8,}\./.test(pathname)) {
          cacheControl = 'public, max-age=31536000, immutable';
        }
      }

      if (!file) {
        return send(res, 404, JSON.stringify({ error: 'Not found' }));
      }
      try {
        const bytes = await readFile(resolve(ROOT, file[0]));
        if (generatedMap) return send(res, 200, bytes, file[1]);
        const extraHeaders: Record<string, string> = pathname === '/sw.js' ? { 'Service-Worker-Allowed': '/' } : {};
        return await sendCached(req, res, bytes, file[1], cacheControl, extraHeaders);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return send(res, 404, JSON.stringify({ error: 'Not found' }));
        }
        throw error;
      }
    } catch (error) {
      if (!res.headersSent) {
        const status = error instanceof InputError ? 400 : 500;
        const message = error instanceof InputError ? error.message : 'Unable to generate map';
        send(res, status, JSON.stringify({ error: message }));
      }
      else res.end();
      if (!(error instanceof InputError)) console.error(error);
    }
  });
  let timer: NodeJS.Timeout | undefined;
  let cleaning: Promise<unknown> | undefined;
  const cleanup = () => {
    if (cleaning) return;
    cleaning = cleanupGeneratedMaps(outputDir, retentionMs)
      .catch(error => console.error('Unable to clean up expired maps', error))
      .finally(() => { cleaning = undefined; });
  };
  server.on('listening', () => {
    cleanup();
    timer = setInterval(cleanup, cleanupIntervalMs);
    timer.unref();
  });
  server.on('close', () => { if (timer) clearInterval(timer); timer = undefined; });
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const portIndex = process.argv.indexOf('--port');
  const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT ?? 8000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('Invalid port');
  }
  const host = process.env.HOST ?? '127.0.0.1';
  createApp().listen(port, host, () => console.log(`Open http://${host}:${port}/`));
}
