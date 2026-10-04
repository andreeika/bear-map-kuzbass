'use client';

import MapGL, { Marker } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { setWorkerUrl } from 'maplibre-gl';

if (typeof window !== 'undefined') {
  setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
}

type Point = { lat: number; lng: number };

// Небольшая карта: клик ставит метку
export default function LocationPicker({ value, onChange }: { value: Point | null; onChange: (p: Point) => void }) {
  return (
    <div className="h-60 overflow-hidden rounded-xl border border-forest-100">
      <MapGL
        mapStyle="https://tiles.openfreemap.org/styles/liberty"
        initialViewState={
          value
            ? { longitude: value.lng, latitude: value.lat, zoom: 10 }
            : { bounds: [[83.3, 52.1], [89.9, 56.9]], fitBoundsOptions: { padding: 20 } }
        }
        maxPitch={0}
        onClick={(e) => onChange({ lat: e.lngLat.lat, lng: e.lngLat.lng })}
        style={{ width: '100%', height: '100%' }}
      >
        {value && <Marker longitude={value.lng} latitude={value.lat} color="#24422f" />}
      </MapGL>
    </div>
  );
}
