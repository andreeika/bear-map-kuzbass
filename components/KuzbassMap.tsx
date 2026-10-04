'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import MapGL, { Layer, Marker, Popup, Source, type MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { setWorkerUrl } from 'maplibre-gl';
import type { Sighting } from '@/lib/supabase';
import { AGE_META, RADIUS_M, ageClass, ago, circlePolygon, type AgeClass } from '@/lib/zones';
import { insideRegion, type RegionGeometry } from '@/lib/region';

// Worker карты отдаётся файлом из public/maplibre (копируется скриптом перед запуском)
if (typeof window !== 'undefined') {
  setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
}

// [запад, юг, восток, север] — примерные границы для первоначального вида
const BOUNDS: [[number, number], [number, number]] = [[83.3, 52.1], [89.9, 56.9]];

export type FlyTarget = { lat: number; lng: number; key: number; zoom?: number; padBottom?: number };

type Props = {
  sightings: Sighting[];
  picked: { lat: number; lng: number } | null;
  onPick: (p: { lat: number; lng: number }) => void;
  selected: Sighting | null;
  flyTarget: FlyTarget | null;
  onSelect: (s: Sighting | null) => void;
  onConfirm: (s: Sighting) => void;
  confirmed: Set<string>;
  region: RegionGeometry;
  onNotice?: (text: string) => void;
};

type OrientationEvt = DeviceOrientationEvent & { webkitCompassHeading?: number };
type OrientationStatic = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

function Zones({ id, features, color, dashed = false }: {
  id: string; features: GeoJSON.Feature<GeoJSON.Polygon>[]; color: string; dashed?: boolean;
}) {
  if (features.length === 0) return null;
  const data: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features };
  return (
    <Source id={id} type="geojson" data={data}>
      {!dashed && <Layer id={`${id}-fill`} type="fill" paint={{ 'fill-color': color, 'fill-opacity': 0.16 }} />}
      <Layer
        id={`${id}-line`} type="line"
        paint={{ 'line-color': color, 'line-width': 2, 'line-opacity': 0.85, ...(dashed ? { 'line-dasharray': [2, 2] } : {}) }}
      />
    </Source>
  );
}

// Простое объединение близких меток в кластеры (по сетке, зависящей от масштаба)
function cluster(points: Sighting[], zoom: number) {
  if (zoom >= 11) return points.map((p) => ({ items: [p], lng: p.lng, lat: p.lat }));
  const cell = 80 / Math.pow(2, zoom);
  const cells: Record<string, Sighting[]> = {};
  points.forEach((p) => {
    const k = `${Math.floor(p.lng / cell)}:${Math.floor(p.lat / cell)}`;
    (cells[k] ??= []).push(p);
  });
  return Object.values(cells).map((items) => ({
    items,
    lng: items.reduce((a, p) => a + p.lng, 0) / items.length,
    lat: items.reduce((a, p) => a + p.lat, 0) / items.length,
  }));
}

export default function KuzbassMap({
  sightings, picked, onPick, selected, flyTarget, onSelect, onConfirm, confirmed, region, onNotice,
}: Props) {
  const mapRef = useRef<MapRef>(null);
  const [zoom, setZoom] = useState(6);
  const [bearing, setBearing] = useState(0);   // поворот карты в градусах
  const [follow, setFollow] = useState(false); // карта поворачивается вслед за компасом телефона
  const lastTick = useRef(0);
  const lastHeading = useRef(0);

  // Поворот карты по компасу телефона
  useEffect(() => {
    if (!follow) return;
    const handler = (e: Event) => {
      const ev = e as OrientationEvt;
      let heading: number | null = null;
      if (typeof ev.webkitCompassHeading === 'number') heading = ev.webkitCompassHeading; // iPhone
      else if (ev.absolute && ev.alpha !== null) heading = (360 - ev.alpha) % 360;          // Android
      if (heading === null) return;
      const now = Date.now();
      if (now - lastTick.current < 100) return;
      let diff = Math.abs(heading - lastHeading.current);
      diff = Math.min(diff, 360 - diff);
      if (diff < 2) return; // игнорируем дрожание датчика
      lastTick.current = now;
      lastHeading.current = heading;
      mapRef.current?.rotateTo(heading, { duration: 0 });
    };
    const name = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(name, handler, true);
    return () => window.removeEventListener(name, handler, true);
  }, [follow]);

  async function toggleFollow() {
    if (follow) { setFollow(false); return; }
    if (!window.isSecureContext) { onNotice?.('Компас телефона работает только на https-адресе.'); return; }
    const DOE = window.DeviceOrientationEvent as OrientationStatic | undefined;
    if (!DOE) { onNotice?.('Датчик компаса недоступен на этом устройстве.'); return; }
    if (typeof DOE.requestPermission === 'function') {
      try {
        if ((await DOE.requestPermission()) !== 'granted') { onNotice?.('Доступ к компасу запрещён.'); return; }
      } catch { onNotice?.('Не удалось получить доступ к компасу.'); return; }
    }
    setFollow(true);
  }
  const open = selected ? sightings.find((s) => s.id === selected.id) ?? selected : null;

  // Плавный перелёт к выбранной точке
  useEffect(() => {
    if (!flyTarget) return;
    const map = mapRef.current;
    if (!map) return;
    const desktop = window.innerWidth >= 768;
    map.flyTo({
      center: [flyTarget.lng, flyTarget.lat],
      zoom: Math.max(map.getZoom(), flyTarget.zoom ?? 11),
      duration: 1200,
      padding: { top: 0, right: 0, bottom: flyTarget.padBottom ?? 0, left: desktop ? 420 : 0 },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTarget?.key]);

  const zones = useMemo(() => {
    const g: Record<AgeClass, GeoJSON.Feature<GeoJSON.Polygon>[]> = { fresh: [], recent: [], old: [] };
    sightings.forEach((s) => g[ageClass(s.seen_at)].push(circlePolygon(s.lng, s.lat)));
    return g;
  }, [sightings]);

  const groups = useMemo(() => cluster(sightings, zoom), [sightings, zoom]);

  // Весь мир с «дырой» по форме региона: всё, что вне Кузбасса, слегка затемняется
  const mask = useMemo<GeoJSON.Feature<GeoJSON.Polygon> | null>(() => {
    if (!region) return null;
    return {
      type: 'Feature', properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]],
          ...region.coordinates.map((poly) => poly[0]),
        ],
      },
    };
  }, [region]);

  return (
    <div className="relative h-full w-full">
    <MapGL
      ref={mapRef}
      mapStyle="https://tiles.openfreemap.org/styles/liberty"
      initialViewState={{ bounds: BOUNDS, fitBoundsOptions: { padding: 30 } }}
      maxBounds={[[82.5, 51.5], [90.7, 57.5]] as never} // as never: обход несовпадения типов библиотек
      minZoom={5}
      maxPitch={0}
      dragRotate
      touchZoomRotate
      onRotate={(e) => setBearing(e.viewState.bearing)}
      onRotateStart={(e) => { if (e.originalEvent) setFollow(false); }}
      onLoad={(e) => setZoom(e.target.getZoom())}
      onZoomEnd={(e) => setZoom(e.viewState.zoom)}
      onClick={(e) => {
        const { lat, lng } = e.lngLat;
        if (insideRegion(lng, lat, region)) { onSelect(null); onPick({ lat, lng }); }
      }}
      style={{ width: '100%', height: '100%' }}
    >

      {/* Точная граница региона: затемнение снаружи и обводка */}
      {region && mask && (
        <>
          <Source id="region-mask" type="geojson" data={mask}>
            <Layer id="region-mask-fill" type="fill" paint={{ 'fill-color': '#14261b', 'fill-opacity': 0.3 }} />
          </Source>
          <Source id="region" type="geojson" data={{ type: 'Feature', properties: {}, geometry: region } as GeoJSON.Feature}>
            <Layer id="region-glow" type="line" paint={{ 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.7, 'line-blur': 2 }} />
            <Layer id="region-line" type="line" paint={{ 'line-color': '#24422f', 'line-width': 3 }} />
          </Source>
        </>
      )}

      <>
          <Zones id="zone-old" features={zones.old} color={AGE_META.old.color} />
          <Zones id="zone-recent" features={zones.recent} color={AGE_META.recent.color} />
          <Zones id="zone-fresh" features={zones.fresh} color={AGE_META.fresh.color} />

          {groups.map((g) =>
            g.items.length > 1 ? (
              <Marker key={`c-${g.lng}-${g.lat}`} longitude={g.lng} latitude={g.lat} anchor="center">
                <button
                  className="grid h-11 w-11 place-items-center rounded-full border-4 border-white bg-forest-800 text-sm font-bold text-white shadow-lg"
                  aria-label={`Наблюдений: ${g.items.length}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    mapRef.current?.flyTo({ center: [g.lng, g.lat], zoom: zoom + 2, duration: 800 });
                  }}
                >{g.items.length}</button>
              </Marker>
            ) : (
              (() => {
                const s = g.items[0];
                const age = ageClass(s.seen_at);
                return (
                  <Marker key={s.id} longitude={s.lng} latitude={s.lat} anchor="center">
                    <button
                      className={`bear-marker ${age === 'fresh' ? 'bear-pulse' : ''}`}
                      style={{
                        borderColor: AGE_META[age].color,
                        transform: open?.id === s.id ? 'scale(1.3)' : undefined,
                      }}
                      onClick={(e) => { e.stopPropagation(); onSelect(s); }}
                      aria-label="Наблюдение медведя"
                    >🐻</button>
                  </Marker>
                );
              })()
            )
          )}
      </>

      {picked && <Zones id="zone-picked" features={[circlePolygon(picked.lng, picked.lat)]} color="#24422f" dashed />}
      {picked && <Marker longitude={picked.lng} latitude={picked.lat} color="#24422f" />}

      {open && (
        <Popup
          longitude={open.lng} latitude={open.lat} anchor="top" offset={22}
          onClose={() => onSelect(null)} closeOnClick={false} maxWidth="270px"
        >
          <div className="text-sm text-forest-900">
            <div className="font-semibold">{ago(open.seen_at)}</div>
            <div className="text-xs text-gray-500">{new Date(open.seen_at).toLocaleString('ru-RU')}</div>
            {open.place && <div className="mt-1">📍 {open.place}</div>}
            <div className="mt-1">Медведей: <b>{open.bears_count}</b></div>
            <div className="mt-1 text-gray-700">{open.description || 'Без комментария'}</div>
            <div className="mt-2 text-xs text-gray-500">Зона осторожности: около {RADIUS_M / 1000} км</div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-xs text-gray-500">Подтвердили: {open.confirms}</span>
              <button
                disabled={confirmed.has(open.id)}
                onClick={() => onConfirm(open)}
                className="rounded-full bg-forest-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >{confirmed.has(open.id) ? '✓ Вы подтвердили' : '👍 И я видел'}</button>
            </div>
          </div>
        </Popup>
      )}
    </MapGL>

      {/* Кнопки управления: на телефоне ниже строки поиска и фильтров */}
      <div className="absolute right-3 top-[116px] z-10 flex flex-col gap-2 md:top-4">
        {([['+', 'Приблизить', () => mapRef.current?.zoomIn()], ['−', 'Отдалить', () => mapRef.current?.zoomOut()]] as const).map(
          ([sign, label, action]) => (
            <button
              key={label} aria-label={label} onClick={action}
              className="grid h-11 w-11 place-items-center rounded-full bg-white text-2xl font-bold leading-none text-forest-900 shadow-lg active:bg-forest-50"
            >{sign}</button>
          )
        )}

        {/* Компас: появляется, когда карта повёрнута; нажатие возвращает север вверх */}
        {Math.abs(bearing) > 1 && (
          <button
            aria-label="Повернуть карту на север"
            onClick={() => { setFollow(false); mapRef.current?.resetNorth({ duration: 400 }); }}
            className="grid h-11 w-11 place-items-center rounded-full bg-white shadow-lg active:bg-forest-50"
          >
            <svg width="26" height="26" viewBox="0 0 26 26" style={{ transform: `rotate(${-bearing}deg)` }}>
              <polygon points="13,2 18,13 8,13" fill="#dc2626" />
              <polygon points="13,24 18,13 8,13" fill="#9ca3af" />
            </svg>
          </button>
        )}

        {/* Поворот карты по компасу телефона */}
        <button
          aria-label="Поворачивать карту по компасу телефона"
          aria-pressed={follow}
          onClick={toggleFollow}
          className={`grid h-11 w-11 place-items-center rounded-full text-xl shadow-lg ${follow ? 'bg-forest-800' : 'bg-white active:bg-forest-50'}`}
        >🧭</button>
      </div>
    </div>
  );
}
