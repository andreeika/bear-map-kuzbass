// Скачивает точную границу Кемеровской области из OpenStreetMap (через Nominatim)
// и создаёт два файла: public/kuzbass.geojson (для карты) и sql/boundary.sql (для базы).
// Запуск: node scripts/fetch-boundary.mjs
import { mkdirSync, writeFileSync } from 'node:fs';

const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
  q: 'Кемеровская область', countrycodes: 'ru', format: 'jsonv2', limit: '5',
  polygon_geojson: '1', polygon_threshold: '0.003', 'accept-language': 'ru',
});

const res = await fetch(url, { headers: { 'User-Agent': 'bear-map-kuzbass/1.0' } });
if (!res.ok) { console.error('Ошибка запроса:', res.status); process.exit(1); }
const items = await res.json();

const item = items.find(
  (i) => i.geojson && /Polygon/.test(i.geojson.type) && (i.name ?? '').startsWith('Кемеровская')
);
if (!item) { console.error('Граница не найдена. Попробуйте позже.'); process.exit(1); }

const geom = item.geojson.type === 'Polygon'
  ? { type: 'MultiPolygon', coordinates: [item.geojson.coordinates] }
  : item.geojson;

mkdirSync('public', { recursive: true });
mkdirSync('sql', { recursive: true });
writeFileSync('public/kuzbass.geojson', JSON.stringify(geom));

const json = JSON.stringify(geom).replace(/'/g, "''");
writeFileSync(
  'sql/boundary.sql',
  `insert into region (id, geom)\nvalues (1, st_multi(st_setsrid(st_geomfromgeojson('${json}'), 4326))::geography)\n` +
  `on conflict (id) do update set geom = excluded.geom;\n`
);
console.log('Готово: public/kuzbass.geojson и sql/boundary.sql');
