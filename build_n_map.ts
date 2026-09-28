import sharp from 'sharp';
import { resolve } from 'node:path';
import { ROOT } from './project.js';
import { saveImage } from './map_highlighter.js';

const folder = resolve(ROOT, 'src/map');
const sourceMap = resolve(folder, 'gunn_site_map_page1.png');
const referenceCrop = resolve(folder, 'n_second_floor_reference.png');
const buildingOverlay = resolve(folder, 'n-building-overlay.svg');

const reference = await sharp(referenceCrop)
  .greyscale()
  .raw()
  .toBuffer({ resolveWithObject: true });
const alphaMask = Buffer.alloc(reference.info.width * reference.info.height * 4);

for (let y = 23; y < reference.info.height; y += 1) {
  for (let x = 190; x <= 420; x += 1) {
    const pixelIndex = y * reference.info.width + x;
    const alphaIndex = pixelIndex * 4 + 3;
    const inkStrength = 190 - reference.data[pixelIndex];
    const alpha = Math.round((inkStrength * 255) / 160);

    alphaMask[alphaIndex] = Math.max(0, Math.min(255, alpha));
  }
}

const referenceInk = await sharp(alphaMask, {
  raw: {
    width: reference.info.width,
    height: reference.info.height,
    channels: 4,
  },
})
  .resize(
    Math.round(reference.info.width * 1.22645),
    Math.round(reference.info.height * 1.2267),
  )
  .png()
  .toBuffer();

const map = await sharp(sourceMap).metadata();
if (!map.width || !map.height) {
  throw new Error('Campus map dimensions are missing');
}

const referencePlacement = {
  left: Math.round(1500 * 1.22645 - 622.744),
  top: Math.round(420 * 1.2267 - 320.161),
};
const outputPath = process.argv[2] ?? resolve(folder, 'gunn_site_map.png');

const output = sharp(sourceMap)
  .composite([
    {
      input: referenceInk,
      ...referencePlacement,
    },
    {
      input: buildingOverlay,
    },
  ])
  .removeAlpha();

console.log(await saveImage(output, outputPath));
