import assert from 'node:assert/strict';
import fs, { mkdtemp, readFile, readdir, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { GeneratedMapStore } from '../generated_map_store.js';
import { HttpError } from '../server_policy.js';

const metadata = { map_revision: '1'.repeat(64), generated_at: '2026-09-03T12:00:00.000Z' };
const filename = (index: number) => `period_map_${index.toString(16).padStart(32, '0')}.png`;
const statusError = (status: number) => (error: unknown) => error instanceof HttpError && error.status === status;

test('existing map reads complete while a write quota scan is stalled, without bypassing expiry checks', async context => {
  const dir = await mkdtemp(join(tmpdir(), 'gunnmap-independent-read-'));
  const name = filename(1), expired = filename(2);
  const store = new GeneratedMapStore(dir, 100_000, 4096, 60_000);
  let releaseScan!: () => void;
  let enteredScan!: () => void;
  const scanGate = new Promise<void>(resolve => { releaseScan = resolve; });
  const entered = new Promise<void>(resolve => { enteredScan = resolve; });
  let write: Promise<string> | undefined;
  try {
    await writeFile(join(dir, name), 'complete png');
    await writeFile(join(dir, name + '.json'), JSON.stringify(metadata));
    await writeFile(join(dir, expired), 'old png');
    await store.cleanup();
    const reservation = await store.reserve();
    const old = new Date(Date.now() - 120_000);
    await utimes(join(dir, expired), old, old);
    const original = fs.lstat;
    context.mock.method(fs, 'lstat', async (...args: unknown[]) => {
      if (String(args[0]) === join(dir, name)) { enteredScan(); await scanGate; }
      return Reflect.apply(original, fs, args);
    });
    syncBuiltinESMExports();
    write = reservation.write(Buffer.from('new png'), undefined, metadata);
    await entered;
    const reads = Promise.all(Array.from({ length: 8 }, async () => {
      const image = await store.openImage(name);
      try {
        assert.deepEqual(image.metadata, metadata);
        assert.equal(await image.handle.readFile('utf8'), 'complete png');
      } finally { await image.handle.close(); }
    }));
    // A timeout only detects a deadlock with the deliberately held scan, rather
    // than asserting machine-specific filesystem throughput.
    const timeout = new AbortController();
    try {
      await Promise.race([reads, delay(2000, undefined, { signal: timeout.signal }).then(() => assert.fail('read waited behind the quota scan'))]);
    } finally { timeout.abort(); }
    await assert.rejects(store.openImage(expired), statusError(404));
    releaseScan();
    const created = await write;
    assert.deepEqual((await readdir(dir)).sort(), [name, name + '.json', created, created + '.json'].sort());
  } finally {
    releaseScan();
    await write?.catch(() => {});
    context.mock.restoreAll(); syncBuiltinESMExports();
    store.close(); await rm(dir, { recursive: true, force: true });
  }
});

test('bounded inventory scans retain exact sidecar accounting and detect immediate external growth', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gunnmap-parallel-quota-'));
  const bytes = Buffer.byteLength(JSON.stringify(metadata));
  const count = 48;
  const store = new GeneratedMapStore(dir, count * (3 + bytes) + 5, 4, 60_000);
  try {
    await Promise.all(Array.from({ length: count }, async (_, index) => {
      const name = filename(index);
      await writeFile(join(dir, name), 'png');
      await writeFile(join(dir, name + '.json'), JSON.stringify(metadata));
    }));
    const admitted = await store.reserve();
    await writeFile(join(dir, filename(count - 1) + '.json'), 'x'.repeat(bytes + 2));
    await assert.rejects(admitted.write(Buffer.from('png')), statusError(503), 'sidecar growth must be measured before publication');
    admitted.release();
    await writeFile(join(dir, filename(count - 1) + '.json'), JSON.stringify(metadata));
    // This starts an independent growth scenario; watch notifications can lag
    // after the operator restores a file without changing directory membership.
    await store.cleanup();
    const second = await store.reserve();
    await writeFile(join(dir, filename(count - 1)), '123456');
    await assert.rejects(second.write(Buffer.from('png')), statusError(503), 'in-place PNG growth must still consume the quota');
    second.release();
    await rm(join(dir, filename(count - 1)));
    await rm(join(dir, filename(count - 1) + '.json'));
    const recovered = await store.reserve();
    const created = await recovered.write(Buffer.from('png'), undefined, metadata);
    const image = await store.openImage(created);
    assert.deepEqual(image.metadata, metadata);
    await image.handle.close();
    assert.equal(await readFile(join(dir, created), 'utf8'), 'png');
  } finally { store.close(); await rm(dir, { recursive: true, force: true }); }
});

test('failed parallel scans finish outstanding accounting work before releasing the transaction', async context => {
  const dir = await mkdtemp(join(tmpdir(), 'gunnmap-scan-failure-'));
  const first = filename(1), second = filename(2);
  const store = new GeneratedMapStore(dir, 9, 4, 60_000);
  let releaseScan!: () => void;
  let enteredScan!: () => void;
  const gate = new Promise<void>(resolve => { releaseScan = resolve; });
  const entered = new Promise<void>(resolve => { enteredScan = resolve; });
  let scan: Promise<void> | undefined;
  try {
    await writeFile(join(dir, first), 'png'); await writeFile(join(dir, second), 'png');
    await store.cleanup();
    const original = fs.lstat;
    let fail = true;
    context.mock.method(fs, 'lstat', async (...args: unknown[]) => {
      if (String(args[0]) === join(dir, first)) { enteredScan(); await gate; }
      if (fail && String(args[0]) === join(dir, second)) throw Object.assign(new Error('stat failed'), { code: 'EIO' });
      return Reflect.apply(original, fs, args);
    });
    syncBuiltinESMExports();
    let settled = false;
    scan = store.cleanup();
    const outcome = scan.then(() => { settled = true; }, () => { settled = true; });
    await entered;
    await delay(20);
    assert.equal(settled, false, 'a failed worker must not release the lock while another worker can still mutate accounting');
    releaseScan();
    await assert.rejects(scan, /stat failed/);
    await outcome;
    fail = false;
    await assert.rejects(store.reserve(), statusError(503), 'retry must reconcile the unchanged directory instead of admitting from a partial count');
  } finally {
    releaseScan(); await scan?.catch(() => {});
    context.mock.restoreAll(); syncBuiltinESMExports();
    store.close(); await rm(dir, { recursive: true, force: true });
  }
});

test('an opened image stays bound to its regular file when its path is replaced by a link', async context => {
  const dir = await mkdtemp(join(tmpdir(), 'gunnmap-read-replacement-'));
  const name = filename(1), imagePath = join(dir, name), privatePath = join(dir, 'operator-private.txt');
  const store = new GeneratedMapStore(dir, 1000, 4096, 60_000);
  try {
    await writeFile(imagePath, 'original png'); await writeFile(privatePath, 'private content');
    const original = fs.open;
    let replaced = false;
    context.mock.method(fs, 'open', async (...args: unknown[]) => {
      const handle = await Reflect.apply(original, fs, args);
      if (!replaced && String(args[0]) === imagePath) {
        replaced = true;
        await rm(imagePath);
        await symlink(privatePath, imagePath);
      }
      return handle;
    });
    syncBuiltinESMExports();
    const image = await store.openImage(name);
    try {
      assert.equal(image.size, Buffer.byteLength('original png'));
      assert.equal(await image.handle.readFile('utf8'), 'original png', 'replacement cannot redirect an already-validated descriptor');
    } finally { await image.handle.close(); }
    await assert.rejects(store.openImage(name), statusError(404));
  } finally {
    context.mock.restoreAll(); syncBuiltinESMExports();
    store.close(); await rm(dir, { recursive: true, force: true });
  }
});
