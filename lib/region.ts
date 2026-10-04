// Точная граница региона.
// Порядок загрузки: файл public/kuzbass.geojson → сохранённая копия в браузере →
// однократный запрос к OpenStreetMap (Nominatim) с сохранением результата.
export type RegionGeometry = GeoJSON.MultiPolygon | null;

const LS_KEY = 'bmk_region_v1';
let cache: Promise<RegionGeometry> | null = null;

type NominatimItem = { name?: string; geojson?: GeoJSON.Polygon | GeoJSON.MultiPolygon };

function toMulti(g: GeoJSON.Polygon | GeoJSON.MultiPolygon): GeoJSON.MultiPolygon {
  return g.type === 'Polygon' ? { type: 'MultiPolygon', coordinates: [g.coordinates] } : g;
}

async function fromNominatim(): Promise<RegionGeometry> {
  const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
    q: 'Кемеровская область', countrycodes: 'ru', format: 'jsonv2', limit: '5',
    polygon_geojson: '1', polygon_threshold: '0.003', 'accept-language': 'ru',
  });
  const items: NominatimItem[] = await (await fetch(url)).json();
  const item = items.find(
    (i) => i.geojson && /Polygon/.test(i.geojson.type) && (i.name ?? '').startsWith('Кемеровская')
  );
  return item?.geojson ? toMulti(item.geojson) : null;
}

export function loadRegion(): Promise<RegionGeometry> {
  if (!cache) {
    cache = (async () => {
      try {
        const r = await fetch('/kuzbass.geojson');
        if (r.ok) {
          const g = await r.json();
          if (g?.coordinates) return g as GeoJSON.MultiPolygon;
        }
      } catch { /* файла нет — идём дальше */ }

      try {
        const saved = localStorage.getItem(LS_KEY);
        if (saved) return JSON.parse(saved) as GeoJSON.MultiPolygon;
      } catch { /* нет сохранённой копии */ }

      try {
        const g = await fromNominatim();
        if (g) {
          try { localStorage.setItem(LS_KEY, JSON.stringify(g)); } catch { /* не страшно */ }
          return g;
        }
      } catch { /* сервис недоступен */ }
      return null;
    })();
  }
  return cache;
}

function inRing(x: number, y: number, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Если границы нет, проверяем по прямоугольнику
export function insideRegion(lng: number, lat: number, g: RegionGeometry): boolean {
  if (!g) return lng >= 83.3 && lng <= 89.9 && lat >= 52.1 && lat <= 56.9;
  return g.coordinates.some(
    (poly) => inRing(lng, lat, poly[0]) && !poly.slice(1).some((hole) => inRing(lng, lat, hole))
  );
}
