import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, roomData, rooms } from '../project.js';
import { MAP_REVISION, MAP_REVISION_DATE } from '../map_revision.js';
import { evacuationForRoom, evacuationOverview, type EvacuationData } from '../evacuation.js';
import { validateMapData } from '../validate_map_data.js';

const data = JSON.parse(readFileSync(resolve(ROOT, 'src/data/evacuation_data.json'), 'utf8')) as EvacuationData;
const csv = readFileSync(resolve(ROOT, 'src/data/room_index.csv'), 'utf8');
const current = {
  mapRevision: MAP_REVISION,
  mapRevisionDate: MAP_REVISION_DATE,
  inventorySha256: createHash('sha256').update(readFileSync(resolve(ROOT, 'src/data/room_regions.json'))).digest('hex'),
  mapImageSha256: createHash('sha256').update(readFileSync(resolve(ROOT, 'src/map/gunn_site_map.png'))).digest('hex'),
};
// Synthetic proof for validation tests only. This is never written to repository data.
function plan(): EvacuationData {
  const value = structuredClone(data);
  value.routesAvailable = true;
  value.provenance = {
    ...value.provenance, sourceKind: 'official_evacuation_plan', originalFilename: 'synthetic-school-plan.png',
    sourceFile: 'synthetic-school-plan.png', sourceImageSha256: 'a'.repeat(64), verifiedOn: '2026-10-03',
  };
  value.review = {
    ...value.review, status: 'verified_school_plan', verifiedBy: 'Synthetic school contact',
    missingEvidence: [], note: 'Synthetic verified-plan fixture; not a real school instruction.',
  };
  value.groups = Object.fromEntries(['red', 'blue', 'green', 'black'].map(group => [group, {
    title: 'Synthetic group', color: '#123456', destination: 'Synthetic assembly area',
    shortDestination: 'Synthetic area', labels: ['A134'],
  }])) as EvacuationData['groups'];
  value.exact = {A134: ['green', 'A134', [100, 100, 200, 200]]};
  return value;
}
const validate = (value: EvacuationData) => validateMapData(roomData, csv, value, current).errors.join('\n');

test('the current evidence review is pending and every selectable room remains unconfirmed', () => {
  const overview = evacuationOverview();
  assert.equal(overview.review.status, 'pending_school_plan');
  assert.equal(overview.review.mapRevision, MAP_REVISION);
  assert.equal(overview.review.checkedOn, '2026-10-03');
  assert.ok(overview.review.missingEvidence.length > 0);
  assert.equal(overview.provenance.verifiedOn, null);
  assert.equal(overview.routesAvailable, false);
  assert.equal(validate(data), '');
  for (const room of rooms) {
    assert.equal(evacuationForRoom(room).status, 'unconfirmed', room.label);
    assert.equal(evacuationForRoom(room).focus, null, room.label);
  }
});

test('enabling assignments requires school-plan evidence, verifier and real review dates', () => {
  assert.equal(validate(plan()), '');
  const pending = plan();
  pending.review = {...data.review};
  pending.provenance.verifiedOn = null;
  assert.match(validate(pending), /requires a verified current school evacuation plan/);
  const siteMap = plan();
  siteMap.provenance.sourceKind = 'official_site_map';
  assert.match(validate(siteMap), /school-issued evacuation plan/);
  const unverified = plan();
  unverified.review.verifiedBy = null;
  unverified.provenance.verifiedOn = null;
  assert.match(validate(unverified), /verification date/);
  assert.match(validate(unverified), /who confirmed the plan/);
  const missing = plan();
  missing.review.missingEvidence = ['School confirmation has not been obtained.'];
  assert.match(validate(missing), /must be empty before a plan can be verified/);
  const date = plan();
  date.provenance.sourceRevisionDate = null;
  assert.match(validate(date), /requires its revision date/);
  date.provenance.verifiedOn = '2026-02-30';
  assert.match(validate(date), /real YYYY-MM-DD/);
});

test('school-plan reviews must match the current map and inventory and cannot reuse the site map as evidence', () => {
  const changedMap = plan();
  changedMap.review.mapRevision = 'b'.repeat(64);
  assert.match(validate(changedMap), /review.mapRevision.*current campus map and inventory/);
  const changedInventory = plan();
  changedInventory.review.inventorySha256 = 'b'.repeat(64);
  assert.match(validate(changedInventory), /review.inventorySha256.*current room inventory/);
  const copiedSiteMap = plan();
  copiedSiteMap.provenance.sourceFile = roomData.base_image;
  assert.match(validate(copiedSiteMap), /site map is not school evacuation-plan evidence/);
  copiedSiteMap.provenance.sourceFile = 'renamed-site-map.png';
  copiedSiteMap.provenance.sourceImageSha256 = current.mapImageSha256;
  assert.match(validate(copiedSiteMap), /site map is not school evacuation-plan evidence/);
});

test('plan verification cannot precede the plan or map revision and reviews cannot precede verification', () => {
  const old = plan();
  old.provenance.verifiedOn = '2026-09-02';
  assert.match(validate(old), /cannot precede the plan revision date/);
  assert.match(validate(old), /cannot precede the current campus map revision/);
  const review = plan();
  review.review.checkedOn = '2026-10-02';
  assert.match(validate(review), /cannot precede school-plan verification/);
});
