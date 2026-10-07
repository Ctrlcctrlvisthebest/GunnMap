import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAP_REVISION, mapRevisionFor } from '../map_revision.js';

test('a map revision binds both the map pixels and selectable inventory', () => {
  assert.match(MAP_REVISION, /^[a-f0-9]{64}$/);
  const image = Buffer.from('source-map');
  const inventory = Buffer.from('stable-room-ids-and-polygons');
  const revision = mapRevisionFor(image, inventory);
  assert.equal(mapRevisionFor(image, inventory), revision);
  assert.notEqual(mapRevisionFor(Buffer.from('updated-map'), inventory), revision);
  assert.notEqual(mapRevisionFor(image, Buffer.from('renumbered-rooms')), revision);
});
