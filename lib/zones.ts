// Радиус зоны повышенной осторожности вокруг наблюдения (в метрах).
// Это условная величина, а не точная граница обитания.
export const RADIUS_M = 1000;

export type AgeClass = 'fresh' | 'recent' | 'old';

export const AGE_META: Record<AgeClass, { label: string; color: string }> = {
  fresh:  { label: 'до 24 часов',  color: '#dc2626' },
  recent: { label: 'до 7 дней',    color: '#f97316' },
  old:    { label: 'до 30 дней',   color: '#ca8a04' },
};

export function ageClass(iso: string): AgeClass {
  const hours = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (hours < 24) return 'fresh';
  if (hours < 24 * 7) return 'recent';
  return 'old';
}

export function ago(iso: string): string {
  const hours = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 3600000));
  if (hours < 1) return 'только что';
  if (hours < 24) return `${hours} ч назад`;
  return `${Math.floor(hours / 24)} дн. назад`;
}

// Многоугольник-круг заданного радиуса вокруг точки
export function circlePolygon(
  lng: number, lat: number, radius = RADIUS_M, steps = 64
): GeoJSON.Feature<GeoJSON.Polygon> {
  const dLat = radius / 111320;
  const dLng = radius / (111320 * Math.cos((lat * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let i = 0; i < steps; i++) {
    const a = (2 * Math.PI * i) / steps;
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  ring.push(ring[0]);
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
}