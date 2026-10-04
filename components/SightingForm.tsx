'use client';

import { useState } from 'react';
import LocationPicker from './LocationPicker';
import { reverseGeocode } from '@/lib/geocode';

export type FormValues = {
  lat: number; lng: number; seenAt: string; bears: number;
  place: string; description: string; status: 'approved' | 'pending';
};

type Initial = {
  lat: number; lng: number; seen_at: string; bears_count: number;
  place: string | null; description: string | null;
};

const field =
  'w-full rounded-xl border border-forest-100 bg-forest-50 px-3 py-3 text-base outline-none ' +
  'focus:border-forest-600 focus:bg-white focus:ring-2 focus:ring-forest-600/20 md:text-sm';
const label = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500';

function toLocal(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function SightingForm({ initial, submitLabel, withStatus = false, onSubmit, onCancel }: {
  initial?: Initial;
  submitLabel: string;
  withStatus?: boolean;
  onSubmit: (v: FormValues) => Promise<void> | void;
  onCancel?: () => void;
}) {
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(
    initial ? { lat: initial.lat, lng: initial.lng } : null
  );
  const [seenAt, setSeenAt] = useState(toLocal(initial?.seen_at));
  const [bears, setBears] = useState(initial?.bears_count ?? 1);
  const [place, setPlace] = useState(initial?.place ?? '');
  const [placeTouched, setPlaceTouched] = useState(!!initial?.place);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [status, setStatus] = useState<'approved' | 'pending'>('approved');
  const [busy, setBusy] = useState(false);

  function pick(p: { lat: number; lng: number }) {
    setPoint(p);
    // название места подставляем автоматически, пока вы не вписали своё
    if (!placeTouched) reverseGeocode(p.lat, p.lng).then((r) => { if (r) setPlace(r); });
  }

  async function submit() {
    if (!point) return;
    setBusy(true);
    await onSubmit({
      lat: point.lat, lng: point.lng, seenAt, bears,
      place: place.trim(), description: description.trim(), status,
    });
    setBusy(false);
  }

  return (
    <div className="space-y-3 text-sm">
      <div>
        <span className={label}>Место (нажмите на карту)</span>
        <LocationPicker value={point} onChange={pick} />
        <div className="mt-1 text-xs text-gray-500">
          {point ? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` : 'Место не выбрано'}
        </div>
      </div>

      <div>
        <span className={label}>Название места</span>
        <input value={place} maxLength={120} className={field}
          onChange={(e) => { setPlace(e.target.value); setPlaceTouched(true); }} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className={label}>Когда видели</span>
          <input type="datetime-local" value={seenAt} onChange={(e) => setSeenAt(e.target.value)} className={field} />
        </div>
        <div>
          <span className={label}>Медведей</span>
          <input type="number" min={1} max={10} value={bears}
            onChange={(e) => setBears(Number(e.target.value) || 1)} className={field} />
        </div>
      </div>

      <div>
        <span className={label}>Комментарий</span>
        <textarea value={description} rows={3} maxLength={500} className={field}
          onChange={(e) => setDescription(e.target.value)} />
      </div>

      {withStatus && (
        <div>
          <span className={label}>Статус</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as 'approved' | 'pending')} className={field}>
            <option value="approved">Опубликовать сразу</option>
            <option value="pending">Оставить на проверку</option>
          </select>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button onClick={submit} disabled={busy || !point}
          className="rounded-xl bg-forest-800 px-5 py-2.5 font-semibold text-white disabled:opacity-50">
          {busy ? 'Сохранение…' : submitLabel}
        </button>
        {onCancel && (
          <button onClick={onCancel} className="rounded-xl border border-forest-100 px-5 py-2.5">Отмена</button>
        )}
      </div>
    </div>
  );
}
