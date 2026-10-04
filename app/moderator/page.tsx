'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AuthForm from '@/components/AuthForm';
import SightingForm, { type FormValues } from '@/components/SightingForm';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/lib/useUser';

type Row = {
  id: string; lat: number; lng: number; seen_at: string; created_at: string;
  description: string | null; bears_count: number; place: string | null; status: string;
};

type Stats = {
  total: number; pending: number; approved: number; rejected: number;
  last24h: number; last7d: number; bears_approved: number; reporters: number;
  visitors_today: number; visitors_7d: number; visitors_total: number;
  per_day: { day: string; sightings: number; visitors: number }[];
  top_places: { place: string; n: number }[];
};

const TABS = [
  ['pending', 'Ожидают'],
  ['approved', 'Подтверждены'],
  ['rejected', 'Отклонены'],
] as const;

function Card({ label, value, accent = false }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${accent ? 'border-bear-600 bg-bear-100' : 'border-forest-100 bg-white'}`}>
      <div className={`text-2xl font-extrabold ${accent ? 'text-bear-600' : 'text-forest-900'}`}>{value}</div>
      <div className="mt-1 text-xs text-gray-500">{label}</div>
    </div>
  );
}

function Chart({ days }: { days: Stats['per_day'] }) {
  const max = Math.max(1, ...days.flatMap((d) => [d.sightings, d.visitors]));
  const h = (n: number) => ({ height: `${(n / max) * 100}%`, minHeight: n ? 3 : 0 });
  return (
    <div>
      <div className="flex h-28 items-end gap-1">
        {days.map((d) => (
          <div key={d.day} className="flex h-full flex-1 items-end justify-center gap-0.5"
            title={`${d.day}: посетителей ${d.visitors}, заявок ${d.sightings}`}>
            <div className="w-1/2 rounded-t bg-forest-600" style={h(d.visitors)} />
            <div className="w-1/2 rounded-t bg-bear-600" style={h(d.sightings)} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1 text-[10px] text-gray-400">
        {days.map((d) => <div key={d.day} className="flex-1 text-center">{d.day.slice(8)}</div>)}
      </div>
      <div className="mt-2 flex gap-4 text-xs text-gray-600">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-forest-600" />посетители</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-bear-600" />заявки</span>
      </div>
    </div>
  );
}

export default function ModeratorPage() {
  const { user, isModerator, loading } = useUser();
  const [view, setView] = useState<'stats' | 'queue' | 'new'>('stats');
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<string>('pending');
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');

  const loadStats = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_stats');
    if (error) setError('Не удалось загрузить статистику. Выполнен ли sql/anonymous.sql?');
    else { setError(''); setStats(data as Stats); }
  }, []);

  const loadQueue = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_moderation_queue', { p_status: tab });
    if (error) setError('Не удалось загрузить список.');
    else { setError(''); setRows((data ?? []) as Row[]); }
  }, [tab]);

  useEffect(() => { if (isModerator) loadStats(); }, [isModerator, loadStats]);
  useEffect(() => { if (isModerator && view === 'queue') loadQueue(); }, [isModerator, view, loadQueue]);

  async function setStatus(id: string, status: string) {
    const { error } = await supabase.rpc('moderate_sighting', { p_id: id, p_status: status });
    if (error) setError('Не удалось изменить статус.');
    else { loadQueue(); loadStats(); }
  }

  async function saveEdit(id: string, v: FormValues) {
    const { error } = await supabase.rpc('update_sighting', {
      p_id: id, p_lat: v.lat, p_lng: v.lng,
      p_seen_at: new Date(v.seenAt).toISOString(),
      p_description: v.description, p_bears: v.bears, p_place: v.place || null,
    });
    if (error) { setError('Не удалось сохранить изменения. Выполнен ли sql/moderator-edit.sql?'); return; }
    setError(''); setNotice('Изменения сохранены.'); setEditing(null); loadQueue();
  }

  async function createNew(v: FormValues) {
    const { error } = await supabase.rpc('create_sighting_mod', {
      p_lat: v.lat, p_lng: v.lng,
      p_seen_at: new Date(v.seenAt).toISOString(),
      p_description: v.description, p_bears: v.bears, p_place: v.place || null,
      p_status: v.status,
    });
    if (error) { setError('Не удалось создать сообщение. Выполнен ли sql/moderator-edit.sql?'); return; }
    setError(''); setNotice(v.status === 'approved' ? 'Сообщение опубликовано на карте.' : 'Сообщение сохранено на проверку.');
    setTab(v.status); setView('queue'); loadStats();
  }

  if (loading) return <main className="p-6">Загрузка…</main>;

  if (!user) return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="mb-3 text-xl font-extrabold text-forest-900">Вход для модератора</h1>
      <AuthForm />
    </main>
  );

  if (!isModerator) return (
    <main className="p-6">
      <p>У вас нет доступа к этой странице.</p>
      <Link href="/" className="text-forest-600 underline">На главную</Link>
    </main>
  );

  return (
    <main className="mx-auto max-w-2xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-forest-900">Панель модератора</h1>
        <div className="flex gap-4 text-sm">
          <Link href="/" className="text-forest-600 underline">К карте</Link>
          <button onClick={() => supabase.auth.signOut()} className="text-gray-500 underline">Выйти</button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 rounded-2xl bg-forest-50 p-1 text-sm font-semibold">
        <button onClick={() => setView('stats')}
          className={`rounded-xl py-2.5 ${view === 'stats' ? 'bg-white text-forest-900 shadow' : 'text-gray-500'}`}>
          Статистика
        </button>
        <button onClick={() => setView('queue')}
          className={`rounded-xl py-2.5 ${view === 'queue' ? 'bg-white text-forest-900 shadow' : 'text-gray-500'}`}>
          Заявки{stats && stats.pending > 0 ? ` (${stats.pending})` : ''}
        </button>
        <button onClick={() => { setView('new'); setNotice(''); }}
          className={`rounded-xl py-2.5 ${view === 'new' ? 'bg-white text-forest-900 shadow' : 'text-gray-500'}`}>
          + Создать
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="mb-3 text-sm text-green-700">{notice}</p>}

      {view === 'stats' && stats && (
        <div className="space-y-5">
          <section>
            <h2 className="mb-2 font-semibold text-forest-900">Заявки</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card label="Ждут проверки" value={stats.pending} accent={stats.pending > 0} />
              <Card label="Подтверждено" value={stats.approved} />
              <Card label="Отклонено" value={stats.rejected} />
              <Card label="Всего" value={stats.total} />
              <Card label="За 24 часа" value={stats.last24h} />
              <Card label="За 7 дней" value={stats.last7d} />
              <Card label="Медведей (подтв.)" value={stats.bears_approved} />
              <Card label="Авторов заявок" value={stats.reporters} />
            </div>
          </section>

          <section>
            <h2 className="mb-2 font-semibold text-forest-900">Посетители</h2>
            <div className="grid grid-cols-3 gap-3">
              <Card label="Сегодня" value={stats.visitors_today} />
              <Card label="За 7 дней" value={stats.visitors_7d} />
              <Card label="За всё время" value={stats.visitors_total} />
            </div>
          </section>

          <section className="rounded-2xl border border-forest-100 bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-semibold text-forest-900">Последние 14 дней</h2>
            <Chart days={stats.per_day} />
          </section>

          <section className="rounded-2xl border border-forest-100 bg-white p-4 shadow-sm">
            <h2 className="mb-2 font-semibold text-forest-900">Где чаще видят медведей</h2>
            {stats.top_places.length === 0 ? (
              <p className="text-sm text-gray-500">Пока нет данных.</p>
            ) : (
              <ol className="space-y-1 text-sm">
                {stats.top_places.map((p) => (
                  <li key={p.place} className="flex justify-between gap-3">
                    <span className="truncate">📍 {p.place}</span><b>{p.n}</b>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <p className="text-xs text-gray-400">
            Посетители и авторы считаются по анонимному идентификатору браузера: человек с несколькими
            устройствами или в режиме инкогнито учитывается несколько раз. Дни считаются по UTC.
          </p>
          <button onClick={loadStats} className="text-sm text-forest-600 underline">Обновить</button>
        </div>
      )}

      {view === 'queue' && (
        <>
          <div className="mb-4 flex gap-2">
            {TABS.map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === key ? 'bg-forest-800 text-white' : 'border border-forest-100 bg-white'}`}>
                {label}
              </button>
            ))}
          </div>

          {rows.length === 0 && <p className="text-gray-500">Здесь пусто.</p>}

          {rows.map((r) => editing === r.id ? (
            <div key={r.id} className="mb-3 rounded-2xl border-2 border-forest-600 bg-white p-4 shadow-sm">
              <SightingForm
                initial={{ lat: r.lat, lng: r.lng, seen_at: r.seen_at, bears_count: r.bears_count, place: r.place, description: r.description }}
                submitLabel="Сохранить"
                onSubmit={(v) => saveEdit(r.id, v)}
                onCancel={() => setEditing(null)}
              />
            </div>
          ) : (
            <div key={r.id} className="mb-3 rounded-2xl border border-forest-100 bg-white p-4 text-sm shadow-sm">
              <div><b>Видели:</b> {new Date(r.seen_at).toLocaleString('ru-RU')}</div>
              <div><b>Отправлено:</b> {new Date(r.created_at).toLocaleString('ru-RU')}</div>
              <div><b>Медведей:</b> {r.bears_count}</div>
              <div><b>Место:</b> {r.place || '—'}</div>
              <div className="my-1"><b>Комментарий:</b> {r.description || '—'}</div>
              <a className="text-forest-600 underline" target="_blank" rel="noreferrer"
                href={`https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lng}#map=12/${r.lat}/${r.lng}`}>
                Показать место ({r.lat.toFixed(4)}, {r.lng.toFixed(4)})
              </a>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => { setEditing(r.id); setNotice(''); }}
                  className="rounded-xl border border-forest-100 px-4 py-2">Изменить</button>
                {r.status !== 'approved' && (
                  <button onClick={() => setStatus(r.id, 'approved')}
                    className="rounded-xl bg-green-700 px-4 py-2 text-white">Подтвердить</button>
                )}
                {r.status !== 'rejected' && (
                  <button onClick={() => setStatus(r.id, 'rejected')}
                    className="rounded-xl bg-red-700 px-4 py-2 text-white">Отклонить</button>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {view === 'new' && (
        <div className="rounded-2xl border border-forest-100 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold text-forest-900">Новое сообщение от модератора</h2>
          <SightingForm submitLabel="Создать" withStatus onSubmit={createNew} />
        </div>
      )}
    </main>
  );
}
