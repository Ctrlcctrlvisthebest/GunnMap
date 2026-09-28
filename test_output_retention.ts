import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupGeneratedMaps, configuredRetentionMs, DEFAULT_MAP_RETENTION_MS } from './output_retention.js';

test('retention removes only expired complete personal maps', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gunnmap-retention-'));
  const now = Date.now();
  const stale = `period_map_${'a'.repeat(32)}.png`;
  const fresh = `period_map_${'b'.repeat(32)}.png`;
  const preserved = ['period_map.png', 'demo_schedule.png', 'period_map_bad.png', `.period_map_${'c'.repeat(32)}.png.tmp`, `.latest_map_${'d'.repeat(32)}.png`];
  try {
    for (const filename of [stale, fresh, ...preserved]) {
      const path = join(dir, filename);
      await writeFile(path, 'image');
      const timestamp = new Date(now - (filename === fresh ? 500 : 2000));
      await utimes(path, timestamp, timestamp);
    }
    const directory = `period_map_${'e'.repeat(32)}.png`;
    const link = `period_map_${'f'.repeat(32)}.png`;
    await mkdir(join(dir, directory));
    await symlink(join(dir, 'period_map.png'), join(dir, link));
    assert.equal(await cleanupGeneratedMaps(dir, 1000, now), 1);
    assert.deepEqual((await readdir(dir)).sort(), [fresh, ...preserved, directory, link].sort());
    assert.equal(await cleanupGeneratedMaps(dir, 1000, now), 0);
    assert.equal(await cleanupGeneratedMaps(join(dir, 'missing'), 1000, now), 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('retention does not evict valid maps when more than 100 people render', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gunnmap-retention-volume-'));
  try {
    const filenames = Array.from({ length: 105 }, (_, index) => `period_map_${index.toString(16).padStart(32, '0')}.png`);
    await Promise.all(filenames.map(filename => writeFile(join(dir, filename), 'image')));
    assert.equal(await cleanupGeneratedMaps(dir), 0);
    assert.deepEqual((await readdir(dir)).sort(), filenames.sort());
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('TTL boundaries, concurrent cleanup, and configuration are predictable', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gunnmap-retention-boundary-'));
  const now = Date.now();
  try {
    const path = join(dir, `period_map_${'a'.repeat(32)}.png`);
    await writeFile(path, 'image');
    const age = new Date(now - 1000);
    await utimes(path, age, age);
    const boundary = (await stat(path)).mtimeMs + 1000;
    const results = await Promise.all([cleanupGeneratedMaps(dir, 1000, boundary), cleanupGeneratedMaps(dir, 1000, boundary)]);
    assert.ok(results.some(count => count === 1));
    assert.deepEqual(await readdir(dir), []);
    assert.equal(configuredRetentionMs('7'), DEFAULT_MAP_RETENTION_MS);
    assert.equal(configuredRetentionMs('0.5'), 12 * 60 * 60 * 1000);
    for (const value of ['', '0', '-1', 'invalid', 'Infinity', '1e309']) assert.throws(() => configuredRetentionMs(value), /positive/);
    await assert.rejects(cleanupGeneratedMaps(dir, 0), /positive/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
