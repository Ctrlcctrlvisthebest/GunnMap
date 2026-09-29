import { copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT } from './project.js';

// The September 2026 district map already includes the N-building second floor.
const folder = resolve(ROOT, 'src/map');
const sourceMap = resolve(folder, 'gunn_site_map_page1.png');
const outputPath = process.argv[2] ?? resolve(folder, 'gunn_site_map.png');

await copyFile(sourceMap, outputPath);
console.log(outputPath);
