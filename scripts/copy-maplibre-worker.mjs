// Копирует файлы worker'а MapLibre в public/maplibre.
// Запускается автоматически перед `npm run dev` и `npm run build`.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const dist = path.join(
  path.dirname(createRequire(import.meta.url).resolve('maplibre-gl/package.json')),
  'dist'
);
const dest = path.join(process.cwd(), 'public', 'maplibre');

mkdirSync(dest, { recursive: true });
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  copyFileSync(path.join(dist, file), path.join(dest, file));
}
console.log('MapLibre worker copied to public/maplibre');
