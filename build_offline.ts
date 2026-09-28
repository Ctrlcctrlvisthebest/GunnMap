import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'vite';

const root = process.cwd();
const assets = ['/', '/main.js', '/ui.css', '/style.css', '/map.png', '/evacuation-map.png',
  '/api/rooms', '/api/offline-rooms', '/api/evacuation-data', '/manifest.webmanifest',
  '/icon.svg', '/apple-touch-icon.png', '/pwa-icon-192.png', '/pwa-icon-512.png'];
const version = createHash('sha256');
for (const name of (await readdir(resolve(root, 'dist/web/assets'))).sort()) {
  if (!/\.(?:js|css|woff2?|svg|png)$/.test(name)) continue;
  assets.push(`/assets/${name}`);
  version.update(name).update(await readFile(resolve(root, 'dist/web/assets', name)));
}
for (const path of ['dist/web/main.js', 'dist/web/ui.css', 'web/index.html', 'web/style.css',
  'room_regions.json', 'evacuation_data.json', 'evacuation.ts', 'web_app.ts',
  'src/map/gunn_site_map.png', 'src/map/gunn_evacuation_map.png', 'web/manifest.webmanifest',
  'web/icon.svg', 'web/apple-touch-icon.png', 'web/pwa-icon-192.png', 'web/pwa-icon-512.png',
  'web/offline/sw.ts', 'web/offline/policy.ts', 'src/domain/room-matching.ts']) {
  version.update(path).update(await readFile(resolve(root, path)));
}
await build({
  configFile: false,
  publicDir: false,
  define: {__OFFLINE_VERSION__: JSON.stringify(version.digest('hex').slice(0, 16)), __OFFLINE_ASSETS__: JSON.stringify(assets)},
  build: {
    outDir: 'dist/web', emptyOutDir: false,
    rollupOptions: {input: resolve(root, 'web/offline/sw.ts'), output: {entryFileNames: 'sw.js'}},
  },
});
