/// <reference lib="webworker" />
import { findRoomMatches } from '../../src/domain/room-matching.js';
import { appRoute, GENERATED_IMAGE, isValidPng, PERSONAL_CACHE, PERSONAL_IMAGE_KEY, PERSONAL_SOURCE_HEADER, PUBLIC_CACHE_PREFIX } from './policy.js';

declare const __OFFLINE_VERSION__: string;
declare const __OFFLINE_ASSETS__: string[];
const worker = self as unknown as ServiceWorkerGlobalScope;
const publicCache = PUBLIC_CACHE_PREFIX + __OFFLINE_VERSION__;
const publicPaths = new Set(__OFFLINE_ASSETS__);

worker.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(publicCache);
    // A failed download keeps the previous working worker and cache in place.
    await cache.addAll(__OFFLINE_ASSETS__.map(path => new Request(path, {cache: 'reload', credentials: 'omit'})));
  })());
});

worker.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(PUBLIC_CACHE_PREFIX) && name !== publicCache).map(name => caches.delete(name)));
    await worker.clients.claim();
  })());
});

worker.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(worker.skipWaiting());
});

function unavailable(message: string): Response {
  return Response.json({error: message}, {status: 503, headers: {'Cache-Control': 'no-store'}});
}

async function reportOffline(): Promise<void> {
  await reportConnection('GUNNMAP_OFFLINE');
}

async function reportConnection(type: 'GUNNMAP_OFFLINE' | 'GUNNMAP_ONLINE'): Promise<void> {
  try {
    for (const client of await worker.clients.matchAll({type: 'window'})) client.postMessage({type});
  } catch {
    // A closed client must not prevent a valid network or cached response.
  }
}

async function networkFetch(request: Request): Promise<Response> {
  const response = await fetch(request);
  if (response.ok) await reportConnection('GUNNMAP_ONLINE');
  return response;
}

async function savedImage(path: string): Promise<Response | undefined> {
  try {
    const cache = await caches.open(PERSONAL_CACHE);
    const response = await cache.match(PERSONAL_IMAGE_KEY);
    if (!response || response.headers.get(PERSONAL_SOURCE_HEADER) !== path) return;
    if (await isValidPng(response.clone())) return response;
    await cache.delete(PERSONAL_IMAGE_KEY);
  } catch {
    // Unavailable browser storage is handled like an unavailable saved image.
  }
  return undefined;
}

interface OfflineRoom {
  id: string; label: string; building: string; aliases?: string[];
}
interface OfflineDirectory { rooms: OfflineRoom[]; map_size: [number, number] }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const string = (value: unknown): value is string => typeof value === 'string';
const nullableString = (value: unknown) => value === null || string(value);
const point = (value: unknown): value is [number, number] => Array.isArray(value) && value.length === 2 && value.every(n => typeof n === 'number' && Number.isFinite(n));

/** Validate the fields used by matching, room details and map overlays. */
function validDirectory(value: unknown): value is OfflineDirectory {
  if (!record(value) || !point(value.map_size) || !value.map_size.every(n => Number.isInteger(n) && n > 0)
    || !Array.isArray(value.rooms) || !value.rooms.length) return false;
  const ids = new Set<string>();
  return value.rooms.every(room => {
    if (!record(room) || !string(room.id) || !room.id || ids.has(room.id) || !string(room.label) || !room.label
      || !string(room.building) || !room.building || (room.aliases !== undefined && (!Array.isArray(room.aliases) || !room.aliases.every(string)))
      || typeof room.floor !== 'number' || !Number.isInteger(room.floor) || room.floor < 1
      || !point(room.marker) || !Array.isArray(room.polygon) || room.polygon.length < 3 || !room.polygon.every(point)) return false;
    const evacuation = room.evacuation;
    if (!record(evacuation) || (evacuation.status !== 'mapped' && evacuation.status !== 'unconfirmed')
      || !nullableString(evacuation.group) || !nullableString(evacuation.color)
      || !string(evacuation.destination) || !string(evacuation.note)
      || !nullableString(evacuation.short_destination) || !nullableString(evacuation.reference_label)) return false;
    ids.add(room.id);
    return true;
  });
}

async function readDirectory(response: Response | undefined): Promise<OfflineDirectory | null> {
  if (!response?.ok) return null;
  try {
    const data: unknown = await response.clone().json();
    return validDirectory(data) ? data : null;
  } catch { return null; }
}

async function cachedDirectory(cache: Cache): Promise<OfflineDirectory | null> {
  const response = await cache.match('/api/offline-rooms');
  const data = await readDirectory(response);
  if (response && !data) await cache.delete('/api/offline-rooms');
  return data;
}

async function restoreDirectory(): Promise<void> {
  try {
    const cache = await caches.open(publicCache);
    if (await cachedDirectory(cache)) return;
    const request = new Request(new URL('/api/offline-rooms', worker.location.origin), {cache: 'reload', credentials: 'omit'});
    const response = await networkFetch(request);
    if (await readDirectory(response)) await cache.put('/api/offline-rooms', response);
  } catch {
    // The successful room lookup remains useful even if storage or refresh fails.
  }
}

async function offlineLookup(url: URL): Promise<Response> {
  const input = url.searchParams.get('q')?.trim() ?? '';
  if (!input) return Response.json({error: 'Enter a room number or room alias.'}, {status: 400});
  let data: OfflineDirectory | null = null;
  try { data = await cachedDirectory(await caches.open(publicCache)); }
  catch { /* Missing or inaccessible storage uses the same recovery message. */ }
  if (!data) return unavailable('The offline classroom directory is unavailable. Reconnect to download it again.');
  return Response.json({rooms: findRoomMatches(data.rooms, input), map_size: data.map_size}, {
    headers: {'Cache-Control': 'no-store', 'X-GunnMap-Offline': '1'},
  });
}

async function handle(request: Request, event: FetchEvent): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'POST' && url.pathname === '/api/render') {
    try { return await networkFetch(request); }
    catch {
      await reportOffline();
      return unavailable('Map generation needs a connection. You can still view maps saved offline.');
    }
  }
  if (request.method !== 'GET') return networkFetch(request);
  if (GENERATED_IMAGE.test(url.pathname)) {
    // Personal images enter this cache only after the user presses Save offline.
    try {
      const response = await networkFetch(request);
      if (response.ok) return response;
      return await savedImage(url.pathname) ?? response;
    } catch {
      await reportOffline();
      return await savedImage(url.pathname)
        ?? unavailable('This map was not saved offline. Reconnect to download it.');
    }
  }
  if (url.pathname === '/api/room-lookup') {
    try {
      const response = await networkFetch(request);
      if (response.ok) event.waitUntil(restoreDirectory());
      return response;
    }
    catch { await reportOffline(); return offlineLookup(url); }
  }
  const cache = await caches.open(publicCache);
  if (request.mode === 'navigate' && appRoute(url.pathname)) {
    // Serve a shell and scripts from the same build until an update is activated.
    const shell = await cache.match('/');
    if (shell) return shell;
  }
  if (publicPaths.has(url.pathname) && !url.search) {
    const cached = await cache.match(url.pathname);
    if (cached) return cached;
  }
  try { return await networkFetch(request); }
  catch { await reportOffline(); return unavailable('This page is unavailable offline.'); }
}

worker.addEventListener('fetch', event => {
  if (new URL(event.request.url).origin !== worker.location.origin) return;
  event.respondWith(handle(event.request, event));
});
