import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { rooms, roomData, ROOT } from './project.js';
import { evacuationForRoom } from './evacuation.js';
import { findRoomMatches } from './src/domain/room-matching.js';
import { PERSONAL_CACHE, PERSONAL_IMAGE_KEY, PERSONAL_SOURCE_HEADER, PUBLIC_CACHE_PREFIX } from './web/offline/policy.js';

const origin = 'https://gunnmap.test';
const shell = '<!doctype html><div id="root">installed app shell</div>';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=', 'base64');
const imagePath = `/output/period_map_${'a'.repeat(32)}.png`;
const otherImagePath = `/output/period_map_${'b'.repeat(32)}.png`;
const locatedRooms = rooms.map(room => ({
  id: room.id, label: room.label, building: room.building, floor: room.floor ?? 1,
  aliases: room.aliases ?? [], polygon: room.polygon,
  marker: [(room.label_box[0] + room.label_box[2]) / 2, (room.label_box[1] + room.label_box[3]) / 2],
  evacuation: evacuationForRoom(room),
}));
const directory = { rooms: locatedRooms, map_size: roomData.image_size };
const workerCode = readFileSync(join(ROOT, 'dist', 'web', 'sw.js'), 'utf8');

class BrowserRequest extends Request {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(typeof input === 'string' ? new URL(input, origin) : input, init);
  }
}

type CacheKey = Request | string | URL;
const keyFor = (key: CacheKey) => new URL(key instanceof Request ? key.url : String(key), origin).href;
type Network = (request: Request) => Promise<Response>;

function defaultNetwork(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/') return Promise.resolve(new Response(shell, { headers: { 'Content-Type': 'text/html' } }));
  if (url.pathname === '/api/offline-rooms') return Promise.resolve(Response.json(directory));
  if (url.pathname === '/api/rooms') return Promise.resolve(Response.json({ rooms }));
  if (url.pathname === '/api/room-lookup') {
    return Promise.resolve(Response.json({ rooms: findRoomMatches(locatedRooms, url.searchParams.get('q') ?? ''), map_size: roomData.image_size }));
  }
  if (url.pathname === '/api/render') return Promise.resolve(Response.json({ image_url: imagePath }));
  if (url.pathname.endsWith('.png')) return Promise.resolve(new Response(png, { headers: { 'Content-Type': 'image/png' } }));
  return Promise.resolve(new Response(`public asset: ${url.pathname}`));
}

function workerHarness() {
  let network: Network = defaultNetwork;
  const networkRequests: Request[] = [];
  const messages: string[] = [];
  const writes: { name: string; key: string }[] = [];
  let claims = 0, skips = 0;
  const fetchFromNetwork = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request && !init ? input : new BrowserRequest(input, init);
    networkRequests.push(request);
    return network(request);
  };
  class MemoryCache {
    private entries = new Map<string, Response>();
    constructor(readonly name: string) {}
    async match(key: CacheKey) { return this.entries.get(keyFor(key))?.clone(); }
    async put(key: CacheKey, response: Response) {
      writes.push({ name: this.name, key: keyFor(key) });
      this.entries.set(keyFor(key), response.clone());
    }
    async delete(key: CacheKey) { return this.entries.delete(keyFor(key)); }
    async keys() { return [...this.entries.keys()].map(key => new BrowserRequest(key)); }
    async addAll(requests: Request[]) {
      // Cache.addAll is atomic: a failed precache must not partially replace entries.
      const responses = await Promise.all(requests.map(request => fetchFromNetwork(request)));
      if (responses.some(response => !response.ok)) throw new TypeError('Precache download failed');
      await Promise.all(requests.map((request, index) => this.put(request, responses[index])));
    }
  }
  const stores = new Map<string, MemoryCache>();
  const caches = {
    async open(name: string) {
      let cache = stores.get(name);
      if (!cache) { cache = new MemoryCache(name); stores.set(name, cache); }
      return cache;
    },
    async keys() { return [...stores.keys()]; },
    async delete(name: string) { return stores.delete(name); },
  };
  interface WorkerEvent {
    data?: unknown;
    request?: Request;
    waitUntil(promise: Promise<unknown>): void;
    respondWith?(promise: Promise<Response> | Response): void;
  }
  const listeners = new Map<string, (event: WorkerEvent) => void>();
  const worker = {
    location: new URL(origin),
    addEventListener(type: string, listener: (event: WorkerEvent) => void) { listeners.set(type, listener); },
    async skipWaiting() { skips++; },
    clients: {
      async claim() { claims++; },
      async matchAll() { return [{ postMessage(message: { type: string }) { messages.push(message.type); } }]; },
    },
  };
  vm.runInNewContext(workerCode, {
    self: worker, caches, fetch: fetchFromNetwork,
    Request: BrowserRequest, Response, Headers, URL, console,
  }, { filename: 'dist/web/sw.js' });

  async function lifecycle(type: 'install' | 'activate' | 'message', data?: unknown) {
    const pending: Promise<unknown>[] = [];
    const listener = listeners.get(type);
    assert.ok(listener, `worker must register ${type}`);
    listener({ data, waitUntil: promise => { pending.push(Promise.resolve(promise)); } });
    await Promise.all(pending);
  }
  async function dispatchFetch(path: string, init: RequestInit = {}) {
    const request = new BrowserRequest(path, init.mode === 'navigate' ? { ...init, mode: 'same-origin' } : init);
    // Browsers create navigate requests internally; Node's Request constructor rejects that mode.
    if (init.mode === 'navigate') Object.defineProperty(request, 'mode', { value: 'navigate' });
    let response: Promise<Response> | undefined;
    const pending: Promise<unknown>[] = [];
    const listener = listeners.get('fetch');
    assert.ok(listener, 'worker must register fetch');
    listener({
      request,
      respondWith: promise => { assert.equal(response, undefined); response = Promise.resolve(promise); },
      waitUntil: promise => { pending.push(Promise.resolve(promise)); },
    });
    if (!response) return undefined;
    const result = await response;
    await Promise.all(pending);
    return result;
  }
  return {
    caches, networkRequests, messages, writes, lifecycle, dispatchFetch,
    setNetwork(handler: Network) { network = handler; },
    offline() { network = async () => { throw new TypeError('Failed to fetch'); }; },
    online() { network = defaultNetwork; },
    get claims() { return claims; },
    get skips() { return skips; },
    async fetch(path: string, init?: RequestInit) {
      const response = await dispatchFetch(path, init);
      assert.ok(response, `worker did not handle ${path}`);
      return response;
    },
    async publicCache() {
      const names = (await caches.keys()).filter(name => name.startsWith(PUBLIC_CACHE_PREFIX));
      assert.equal(names.length, 1, 'one active public cache should remain');
      return caches.open(names[0]);
    },
  };
}

async function installedWorker() {
  const harness = workerHarness();
  await harness.lifecycle('install');
  await harness.lifecycle('activate');
  return harness;
}

test('worker installation caches public resources and activation preserves personal and unrelated caches', async () => {
  const h = workerHarness();
  const oldName = PUBLIC_CACHE_PREFIX + 'previous-release';
  await (await h.caches.open(oldName)).put('/', new Response('old shell'));
  await (await h.caches.open(PERSONAL_CACHE)).put(PERSONAL_IMAGE_KEY, new Response(png, {
    headers: { 'Content-Type': 'image/png', [PERSONAL_SOURCE_HEADER]: imagePath },
  }));
  await (await h.caches.open('another-application')).put('/other', new Response('unrelated data'));
  await h.lifecycle('install');
  assert.ok((await h.caches.keys()).includes(oldName), 'install must preserve the active version');
  assert.equal(h.skips, 0, 'new versions must wait for the user to activate them');
  assert.ok(h.networkRequests.some(request => new URL(request.url).pathname === '/api/offline-rooms'));
  for (const request of h.networkRequests) {
    assert.equal(request.method, 'GET');
    assert.equal(request.credentials, 'omit');
    assert.equal(request.cache, 'reload');
    assert.ok(!new URL(request.url).pathname.startsWith('/output/'));
  }
  await h.lifecycle('activate');
  assert.equal(h.claims, 1);
  assert.ok(!(await h.caches.keys()).includes(oldName));
  assert.equal(await (await (await h.caches.open('another-application')).match('/other'))?.text(), 'unrelated data');
  const saved = await (await h.caches.open(PERSONAL_CACHE)).match(PERSONAL_IMAGE_KEY);
  assert.equal(saved?.headers.get(PERSONAL_SOURCE_HEADER), imagePath);
  assert.deepEqual(Buffer.from(await saved!.arrayBuffer()), png);
  const publicCache = await h.publicCache();
  assert.equal(await (await publicCache.match('/'))?.text(), shell);
  assert.deepEqual(await (await publicCache.match('/api/offline-rooms'))?.json(), directory);
  await h.lifecycle('message', { type: 'ACTIVATE_UPDATE' });
  assert.equal(h.skips, 1);
});

test('a failed precache leaves the previous worker resources available', async () => {
  const h = workerHarness();
  const oldName = PUBLIC_CACHE_PREFIX + 'working-release';
  await (await h.caches.open(oldName)).put('/', new Response('working shell'));
  h.setNetwork(async request => new URL(request.url).pathname === '/main.js'
    ? new Response('Unavailable', { status: 503 }) : defaultNetwork(request));
  await assert.rejects(h.lifecycle('install'), /Precache download failed/);
  assert.equal(await (await (await h.caches.open(oldName)).match('/'))?.text(), 'working shell');
  assert.equal(h.claims, 0);
  assert.equal(h.skips, 0);
});

test('offline navigation, public assets and room lookup preserve geometry and evacuation details', async () => {
  const h = await installedWorker();
  h.offline();
  const writesBefore = h.writes.length;
  for (const path of ['/', '/evacuation', '/evacuation/', '/find-room', '/generate-map/?preview=1']) {
    const response = await h.fetch(path, { mode: 'navigate' });
    assert.equal(response.status, 200, path);
    assert.equal(await response.text(), shell);
  }
  assert.deepEqual(await (await h.fetch('/api/offline-rooms')).json(), directory);
  assert.deepEqual(Buffer.from(await (await h.fetch('/map.png')).arrayBuffer()), png);
  for (const query of ['n—214', 'Ｎ－２１４', 'R 148', 'library', 'K6', 'E01', 'unknown']) {
    const response = await h.fetch(`/api/room-lookup?q=${encodeURIComponent(query)}`);
    assert.equal(response.status, 200, query);
    assert.equal(response.headers.get('X-GunnMap-Offline'), '1');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const result = await response.json();
    assert.deepEqual(result, { rooms: findRoomMatches(locatedRooms, query), map_size: roomData.image_size });
    if (query === 'n—214') {
      assert.equal(result.rooms[0].id, 'R148');
      assert.equal(result.rooms[0].floor, 2);
      assert.ok(result.rooms[0].polygon.length >= 3);
      assert.equal(result.rooms[0].marker.length, 2);
      assert.equal(result.rooms[0].evacuation.group, 'black');
    }
    if (query === 'K6') assert.equal(result.rooms.length, 2);
    if (query === 'E01') assert.equal(result.rooms[0].evacuation.status, 'unconfirmed');
  }
  assert.equal((await h.fetch('/api/room-lookup?q=%20')).status, 400);
  assert.equal(h.writes.length, writesBefore, 'lookup responses and navigation must not create new caches');
  assert.ok(h.messages.includes('GUNNMAP_OFFLINE'));
  assert.equal(await h.dispatchFetch('https://another.example/map.png'), undefined);
});

test('render POSTs return a useful offline error and never enter CacheStorage', async () => {
  const h = await installedWorker();
  const writesBefore = h.writes.length;
  h.offline();
  const response = await h.fetch('/api/render', { method: 'POST', body: JSON.stringify({ periods: [{ room: 'N214' }] }) });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.match((await response.json()).error, /connection/i);
  h.online();
  assert.deepEqual(await (await h.fetch('/api/render', { method: 'POST', body: '{}' })).json(), { image_url: imagePath });
  assert.equal(h.writes.length, writesBefore);
  assert.ok(!h.writes.some(write => new URL(write.key).pathname === '/api/render'));
});

test('personal images are never cached automatically and only the explicitly saved URL can fall back', async () => {
  const h = await installedWorker();
  const writesBefore = h.writes.length;
  assert.deepEqual(Buffer.from(await (await h.fetch(imagePath)).arrayBuffer()), png);
  assert.equal(h.writes.length, writesBefore);
  h.offline();
  assert.equal((await h.fetch(imagePath)).status, 503);
  const personalCache = await h.caches.open(PERSONAL_CACHE);
  assert.equal((await personalCache.keys()).length, 0);
  await personalCache.put(PERSONAL_IMAGE_KEY, new Response(png, {
    headers: { 'Content-Type': 'image/png', [PERSONAL_SOURCE_HEADER]: imagePath },
  }));
  const savedWrites = h.writes.length;
  assert.equal((await h.fetch(otherImagePath)).status, 503);
  const restored = await h.fetch(imagePath);
  assert.equal(restored.status, 200);
  assert.deepEqual(Buffer.from(await restored.arrayBuffer()), png);
  h.setNetwork(async () => new Response('Expired', { status: 404 }));
  assert.equal((await h.fetch(imagePath)).status, 200, 'an explicit offline copy remains available after server expiry');
  assert.equal((await h.fetch(otherImagePath)).status, 404);
  assert.equal(h.writes.length, savedWrites, 'viewing maps must not replace or expand the saved personal entry');
  assert.ok(!h.writes.some(write => write.name.startsWith(PUBLIC_CACHE_PREFIX) && new URL(write.key).pathname.startsWith('/output/')));
});

test('a corrupt saved image is removed instead of being shown as a successful offline map', async () => {
  const h = await installedWorker();
  const personalCache = await h.caches.open(PERSONAL_CACHE);
  await personalCache.put(PERSONAL_IMAGE_KEY, new Response('<html>broken download</html>', {
    headers: { 'Content-Type': 'image/png', [PERSONAL_SOURCE_HEADER]: imagePath },
  }));
  h.offline();
  assert.equal((await h.fetch(imagePath)).status, 503);
  assert.equal(await personalCache.match(PERSONAL_IMAGE_KEY), undefined);
});

test('broken offline directories return 503, are discarded, and recover when a lookup reconnects', async () => {
  const malformed = [
    '{broken JSON',
    JSON.stringify({ rooms: 'not an array', map_size: roomData.image_size }),
    JSON.stringify({ rooms: [{ id: 'R148', label: 'N214', building: 'N' }], map_size: roomData.image_size }),
    JSON.stringify({ rooms: [locatedRooms[0], locatedRooms[0]], map_size: roomData.image_size }),
    JSON.stringify({ rooms: locatedRooms, map_size: [0, 1584] }),
  ];
  for (const body of malformed) {
    const h = await installedWorker();
    const cache = await h.publicCache();
    await cache.put('/api/offline-rooms', new Response(body, { headers: { 'Content-Type': 'application/json' } }));
    h.offline();
    const broken = await h.fetch('/api/room-lookup?q=N214');
    assert.equal(broken.status, 503);
    assert.equal(broken.headers.get('Cache-Control'), 'no-store');
    assert.match((await broken.json()).error, /directory.*Reconnect/i);
    assert.equal(await cache.match('/api/offline-rooms'), undefined);
    assert.equal((await h.fetch('/api/room-lookup?q=N214')).status, 503);
    h.online();
    assert.equal((await h.fetch('/api/room-lookup?q=N214')).status, 200);
    assert.deepEqual(await (await cache.match('/api/offline-rooms'))?.json(), directory);
    const restoredRequest = h.networkRequests.filter(request => new URL(request.url).pathname === '/api/offline-rooms').at(-1);
    assert.equal(restoredRequest?.cache, 'reload');
    assert.equal(restoredRequest?.credentials, 'omit');
    h.offline();
    const recovered = await h.fetch('/api/room-lookup?q=N214');
    assert.equal(recovered.status, 200);
    assert.equal((await recovered.json()).rooms[0].evacuation.group, 'black');
  }
});

test('a real successful network request sends ONLINE after an earlier connection failure', async () => {
  const h = await installedWorker();
  h.offline();
  assert.equal((await h.fetch('/api/room-lookup?q=N214')).status, 200);
  assert.equal(h.messages.at(-1), 'GUNNMAP_OFFLINE');
  const messagesBeforeCacheHit = h.messages.length;
  await h.fetch('/find-room', { mode: 'navigate' });
  assert.equal(h.messages.length, messagesBeforeCacheHit, 'a cached page does not prove that the network recovered');
  h.online();
  assert.equal((await h.fetch('/api/room-lookup?q=N214')).status, 200);
  assert.equal(h.messages.at(-1), 'GUNNMAP_ONLINE');
});
