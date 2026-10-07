import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './project.js';

/** Both the picture and selectable room identities belong to a map revision. */
export function mapRevisionFor(image: Uint8Array, inventory: Uint8Array): string {
  return createHash('sha256').update('gunnmap-map-v1\0')
    .update(image).update('\0').update(inventory).digest('hex');
}

export const MAP_REVISION = mapRevisionFor(
  readFileSync(resolve(ROOT, 'src/map/gunn_site_map.png')),
  readFileSync(resolve(ROOT, 'src/data/room_regions.json')),
);
export const MAP_REVISION_DATE = '2026-09-03';
