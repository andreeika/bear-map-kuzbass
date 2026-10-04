'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import KuzbassMap, { type FlyTarget } from '@/components/KuzbassMap';
import Turnstile from '@/components/Turnstile';
import { supabase, type Sighting } from '@/lib/supabase';
import { useUser } from '@/lib/useUser';
import { reverseGeocode } from '@/lib/geocode';
import { getDeviceId, trackVisit } from '@/lib/device';
import { loadRegion, insideRegion, type RegionGeometry } from '@/lib/region';
import { AGE_META, RADIUS_M, ageClass, ago, type AgeClass } from '@/lib/zones';

// Капча включается, только если задан ключ NEXT_PUBLIC_TURNSTILE_SITE_KEY
const CAPTCHA_ON = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

function nowLocal() {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

// text-base на телефоне нужен, чтобы iPhone не увеличивал страницу при вводе
const field =
  'w-full rounded-xl border border-forest-100 bg-forest-50 px-3 py-3 text-base outline-none transition md:py-2.5 md:text-sm ' +
  'focus:border-forest-600 focus:bg-white focus:ring-2 focus:ring-forest-600/20';
const label = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500';

// Высота нижней панели на телефоне: свёрнута / половина / почти весь экран
type Sheet = 'peek' | 'half' | 'full';
const SHEET_ORDER: Sheet[] = ['peek', 'half', 'full'];
const SHEET_H: Record<Sheet, string> = {
  peek: 'h-[calc(96px_+_env(safe-area-inset-bottom))]',
  half: 'h-[55dvh]',
  full: 'h-[90dvh]',
};

export default function Home() {
  const { user, isModerator } = useUser();
  const [tab, setTab] = useState<'feed' | 'report'>('feed');
  const [sheet, setSheet] = useState<Sheet>('peek');
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [placeBusy, setPlaceBusy] = useState(false);
  const [seenAt, setSeenAt] = useState('');
  const [count, setCount] = useState(1);
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [selected, setSelected] = useState<Sighting | null>(null);
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);
  const [locating, setLocating] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [days, setDays] = useState<1 | 7 | 30>(30);
  const [region, setRegion] = useState<RegionGeometry>(null);
  const [consent, setConsent] = useState(false);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ id: number; name: string; lat: number; lng: number }[]>([]);
  const [searching, setSearching] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const reqId = useRef(0);
  const startY = useRef<number | null>(null);

  async function load() {
    const { data, error } = await supabase.rpc('get_sightings');
    if (!error && data) setSightings(data as Sighting[]);
  }

  useEffect(() => {
    setSeenAt(nowLocal()); load(); trackVisit();
    loadRegion().then(setRegion);
    try {
      setConsent(localStorage.getItem('bmk_consent') === '1');
      setConfirmed(new Set(JSON.parse(localStorage.getItem('bmk_confirmed') ?? '[]')));
    } catch { /* хранилище недоступно */ }
  }, []);

  function showToast(text: string) {
    setToast(text);
    setTimeout(() => setToast(''), 5000);
  }

  function openSheet() {
    setSheet((s) => (s === 'peek' ? 'half' : s));
  }

  function shiftSheet(dir: 1 | -1) {
    setSheet((s) => SHEET_ORDER[Math.min(2, Math.max(0, SHEET_ORDER.indexOf(s) + dir))]);
  }

  function pick(p: { lat: number; lng: number }) {
    setTab('report');
    openSheet();
    setPicked(p);
    setAccuracy(null);
    setPlace(null);
    setPlaceBusy(true);
    const id = ++reqId.current;
    reverseGeocode(p.lat, p.lng).then((r) => {
      if (id === reqId.current) { setPlace(r); setPlaceBusy(false); }
    });
  }

  // Сброс выбранной точки: убирает метку и закрывает форму «Сообщить»
  function clearPick() {
    reqId.current++; // отменяем незавершённое определение названия места
    setPicked(null);
    setPlace(null);
    setPlaceBusy(false);
    setAccuracy(null);
    setTab('feed');
    setSheet('peek');
  }

  // Нажатие на карту: первое ставит метку, повторное убирает её
  function onMapTap(p: { lat: number; lng: number }) {
    if (picked) clearPick();
    else pick(p);
  }

  // Определение текущего местоположения устройства
  function locate() {
    if (!window.isSecureContext || !navigator.geolocation) {
      showToast('Определение местоположения работает только на https-адресе (или на localhost).');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!insideRegion(p.lng, p.lat, region)) {
          showToast('Вы находитесь за пределами Кемеровской области.');
          return;
        }
        pick(p);
        setAccuracy(pos.coords.accuracy);
        const pad = window.innerWidth < 768 ? Math.max(0, window.innerHeight * 0.55 - 96) : 0;
        setFlyTarget({ lat: p.lat, lng: p.lng, key: Date.now(), zoom: 14, padBottom: pad });
        if (pos.coords.accuracy > 1000) {
          showToast(`Точность низкая (±${Math.round(pos.coords.accuracy)} м). Проверьте метку на карте.`);
        }
      },
      (err) => {
        setLocating(false);
        showToast(err.code === 1
          ? 'Доступ к местоположению запрещён. Разрешите его в настройках браузера.'
          : 'Не удалось определить местоположение.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  }

  async function submit() {
    if (!picked || !consent || (CAPTCHA_ON && !token)) return;
    setBusy(true);
    let errorCode = '';
    if (!CAPTCHA_ON) {
      // Без капчи: прямой вызов функции в базе
      const { error } = await supabase.rpc('add_sighting', {
        p_lat: picked.lat, p_lng: picked.lng,
        p_seen_at: new Date(seenAt).toISOString(),
        p_description: desc.trim(), p_bears: count,
        p_place: place, p_device: getDeviceId(),
      });
      if (error) {
        errorCode = error.message.includes('rate limit') ? 'rate'
          : error.message.includes('outside') ? 'region' : 'failed';
      }
    } else try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: picked.lat, lng: picked.lng,
          seen_at: new Date(seenAt).toISOString(),
          description: desc.trim(), bears: count, place,
          device: getDeviceId(), token,
        }),
      });
      if (!res.ok) errorCode = (await res.json().catch(() => ({}))).error ?? 'failed';
    } catch {
      errorCode = 'failed';
    }
    setBusy(false);
    setToken(null);
    setCaptchaKey((k) => k + 1); // токен капчи одноразовый
    if (errorCode) {
      showToast(
        errorCode === 'captcha' ? 'Проверка «я не робот» не пройдена. Попробуйте ещё раз.' :
        errorCode === 'rate' ? 'Слишком много сообщений. Попробуйте позже.' :
        errorCode === 'region' ? 'Эта точка вне Кемеровской области.' :
        'Не удалось отправить. Попробуйте позже.'
      );
      return;
    }
    setPicked(null); setPlace(null); setDesc(''); setCount(1);
    setTab('feed');
    setSheet('peek');
    showToast('Спасибо! Наблюдение появится на карте после проверки.');
  }

  // «И я видел»: подтверждение чужого наблюдения
  async function confirmSighting(s: Sighting) {
    const { error } = await supabase.rpc('confirm_sighting', { p_id: s.id, p_device: getDeviceId() });
    if (error) { showToast('Не удалось отправить подтверждение.'); return; }
    const next = new Set(confirmed).add(s.id);
    setConfirmed(next);
    try { localStorage.setItem('bmk_confirmed', JSON.stringify([...next])); } catch { /* ничего */ }
    load();
    showToast('Спасибо, подтверждение учтено.');
  }

  // Поиск посёлка или района (только по нажатию кнопки, без автоподсказок)
  async function search() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    try {
      const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
        q, format: 'jsonv2', limit: '5', bounded: '1', viewbox: '83.3,56.9,89.9,52.1',
        countrycodes: 'ru', 'accept-language': 'ru',
      });
      const data: { place_id: number; display_name: string; lat: string; lon: string }[] =
        await (await fetch(url)).json();
      const list = data.map((d) => ({
        id: d.place_id, name: d.display_name.split(', ').slice(0, 3).join(', '),
        lat: Number(d.lat), lng: Number(d.lon),
      }));
      setResults(list);
      if (list.length === 0) showToast('Ничего не найдено.');
    } catch {
      showToast('Поиск временно недоступен.');
    }
    setSearching(false);
  }

  function goTo(r: { lat: number; lng: number }) {
    setResults([]);
    setSheet('peek');
    setFlyTarget({ lat: r.lat, lng: r.lng, key: Date.now(), zoom: 11 });
  }

  // Клик по наблюдению в списке: показать его на карте
  function focusSighting(s: Sighting) {
    setSelected(s);
    setFlyTarget({ lat: s.lat, lng: s.lng, key: Date.now() });
    setSheet('peek');
  }

  const fresh = sightings.filter((s) => ageClass(s.seen_at) === 'fresh').length;
  const visible = sightings.filter((s) => Date.now() - new Date(s.seen_at).getTime() < days * 86400000);

  const legend = (Object.keys(AGE_META) as AgeClass[]).map((k) => (
    <span key={k} className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: AGE_META[k].color }} />
      {AGE_META[k].label}
    </span>
  ));

  const safety = (
    <>ℹ️ Сайт не является коммерческим проектом и создан для информирования граждан.<br />⚠️ Сайт не заменяет официальные предупреждения. При встрече с медведем не бегите
      и не приближайтесь, медленно отступайте. Экстренная помощь: <b>112</b>.{' '}
      <Link href="/bear-safety" className="font-semibold underline">Что делать при встрече с медведем</Link>
      {' · '}<Link href="/about" className="underline">О проекте</Link>
      {' · '}<Link href="/privacy" className="underline">Конфиденциальность</Link></>
  );

  return (
    <main className="relative h-dvh overflow-hidden">
      {/* Карта: на телефоне заканчивается над свёрнутой панелью, чтобы была видна подпись OSM */}
      <div className="absolute inset-x-0 top-0 bottom-[calc(96px_+_env(safe-area-inset-bottom))] md:inset-0">
        <KuzbassMap
          sightings={visible} picked={picked} onPick={onMapTap}
          selected={selected} flyTarget={flyTarget} onSelect={setSelected}
          onConfirm={confirmSighting} confirmed={confirmed} region={region} onNotice={showToast}
        />
      </div>

      {/* Поиск и фильтры */}
      <div className="absolute left-3 right-3 top-3 z-10 md:left-[432px] md:right-16 md:max-w-md">
        <form onSubmit={(e) => { e.preventDefault(); search(); }} className="relative">
          <div className="flex items-center gap-2 rounded-full bg-white/95 py-1.5 pl-3.5 pr-1.5 shadow-lg">
            <span className="text-base">🐻</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Посёлок или район"
              className="min-w-0 flex-1 bg-transparent py-1.5 text-base outline-none md:text-sm" />
            {query && (
              <button type="button" aria-label="Очистить поиск"
                onClick={() => { setQuery(''); setResults([]); }}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-2xl leading-none text-gray-400 active:bg-forest-50">×</button>
            )}
            <button type="submit" className="rounded-full bg-forest-800 px-4 py-2 text-sm font-semibold text-white">
              {searching ? '…' : 'Найти'}
            </button>
          </div>
          {results.length > 0 && (
            <ul className="absolute left-0 right-0 mt-2 overflow-hidden rounded-2xl bg-white shadow-xl">
              {results.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => goTo(r)}
                    className="block w-full truncate px-4 py-3 text-left text-sm hover:bg-forest-50">{r.name}</button>
                </li>
              ))}
            </ul>
          )}
        </form>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {([[1, 'Сутки'], [7, 'Неделя'], [30, 'Месяц']] as const).map(([d, l]) => (
            <button key={d} onClick={() => setDays(d)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold shadow ${days === d ? 'bg-forest-800 text-white' : 'bg-white/95 text-forest-900'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Легенда (компьютер) */}
      <div className="absolute bottom-6 right-4 z-10 hidden rounded-2xl bg-white/90 px-4 py-3 shadow-lg backdrop-blur md:block">
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Давность</div>
        {(Object.keys(AGE_META) as AgeClass[]).map((k) => (
          <div key={k} className="flex items-center gap-2 text-sm text-forest-900">
            <span className="h-3 w-3 rounded-full" style={{ background: AGE_META[k].color }} />
            {AGE_META[k].label}
          </div>
        ))}
      </div>

      {/* Уведомление */}
      {toast && (
        <div className="fade-up absolute left-1/2 top-16 z-30 w-[90%] max-w-sm -translate-x-1/2 rounded-2xl bg-forest-900 px-5 py-3 text-center text-sm text-white shadow-xl md:top-4 md:w-auto md:rounded-full">
          {toast}
        </div>
      )}

      {/* Панель: нижний лист на телефоне, плавающая карточка на компьютере */}
      <aside
        className={`absolute inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)]
          shadow-[0_-8px_30px_rgba(20,38,27,0.2)] transition-[height] duration-300 ${SHEET_H[sheet]}
          md:inset-x-auto md:bottom-4 md:left-4 md:top-4 md:h-auto md:w-[400px] md:rounded-3xl md:pb-0 md:shadow-2xl`}
      >
        {/* Ручка (телефон): свайп вверх/вниз или касание */}
        <div
          role="button" aria-label="Раскрыть панель"
          className="select-none px-5 pb-1 pt-2.5 md:hidden"
          style={{ touchAction: 'none' }}
          onTouchStart={(e) => { startY.current = e.touches[0].clientY; }}
          onTouchEnd={(e) => {
            if (startY.current === null) return;
            const dy = e.changedTouches[0].clientY - startY.current;
            startY.current = null;
            if (dy < -30) shiftSheet(1);
            else if (dy > 30) shiftSheet(-1);
            else setSheet((s) => (s === 'peek' ? 'half' : 'peek'));
          }}
        >
          <div className="mx-auto h-1.5 w-12 rounded-full bg-gray-300" />
          {sheet !== 'peek' && (
            <div className="mt-2 text-center text-xs text-gray-500">
              🐻 {sightings.length} за 30 дней · {fresh} за сутки
            </div>
          )}
        </div>

        {/* Шапка (компьютер) */}
        <header className="hidden bg-gradient-to-br from-forest-900 via-forest-800 to-forest-600 p-5 text-white md:block">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 text-2xl">🐻</div>
              <div>
                <h1 className="text-xl font-extrabold leading-tight tracking-tight">Bear Map Kuzbass</h1>
                <p className="text-xs text-white/70">Медведи в Кемеровской области</p>
              </div>
            </div>
            {user && (
              <div className="flex flex-col items-end gap-1 text-[11px] text-white/75">
                {isModerator && <Link href="/moderator" className="underline">Модерация</Link>}
                <button onClick={() => supabase.auth.signOut()} className="underline">Выйти</button>
              </div>
            )}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              [sightings.length, 'за 30 дней'],
              [fresh, 'за 24 часа'],
              [`${RADIUS_M / 1000} км`, 'радиус зоны'],
            ].map(([v, l]) => (
              <div key={l} className="rounded-xl bg-white/10 px-3 py-2">
                <div className="text-lg font-bold leading-none">{v}</div>
                <div className="mt-1 text-[11px] text-white/70">{l}</div>
              </div>
            ))}
          </div>
        </header>

        {/* Вкладки */}
        <nav className="mx-5 mb-3 mt-1 grid grid-cols-2 rounded-2xl bg-forest-50 p-1 text-base font-semibold md:mb-0 md:mt-4 md:text-sm">
          {(['feed', 'report'] as const).map((t) => (
            <button key={t} onClick={() => { setTab(t); openSheet(); }}
              className={`rounded-xl py-3 transition md:py-2 ${tab === t ? 'bg-white text-forest-900 shadow' : 'text-gray-500'}`}>
              {t === 'feed' ? 'Наблюдения' : 'Сообщить'}
            </button>
          ))}
        </nav>

        {/* Содержимое */}
        <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-5">
          {user && (
            <div className="mb-3 flex items-center justify-between gap-3 text-xs text-gray-500 md:hidden">
              <span className="truncate">{user.email}</span>
              <span className="flex shrink-0 gap-4">
                {isModerator && <Link href="/moderator" className="py-1 text-forest-600 underline">Модерация</Link>}
                <button onClick={() => supabase.auth.signOut()} className="py-1 underline">Выйти</button>
              </span>
            </div>
          )}

          {tab === 'feed' ? (
            <>
              <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 md:hidden">{legend}</div>
              {visible.length === 0 ? (
                <div className="py-10 text-center text-gray-500">
                  <div className="text-4xl">🌲</div>
                  <p className="mt-2 text-sm">Пока нет подтверждённых наблюдений.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {visible.slice(0, 15).map((s) => {
                    const age = ageClass(s.seen_at);
                    return (
                      <article
                        key={s.id}
                        role="button" tabIndex={0}
                        onClick={() => focusSighting(s)}
                        onKeyDown={(e) => { if (e.key === 'Enter') focusSighting(s); }}
                        className={`fade-up flex cursor-pointer gap-3 rounded-2xl border bg-white p-3.5 shadow-sm transition active:scale-[0.99] ${
                          selected?.id === s.id ? 'border-forest-600 ring-2 ring-forest-600/20' : 'border-forest-100 hover:border-forest-600/50'
                        }`}
                      >
                        <div className="w-1.5 shrink-0 rounded-full" style={{ background: AGE_META[age].color }} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-forest-900">{ago(s.seen_at)}</span>
                            <span className="shrink-0 rounded-full bg-bear-100 px-2 py-0.5 text-xs font-semibold text-bear-600">
                              🐻 × {s.bears_count}
                            </span>
                          </div>
                          {s.place && <div className="mt-0.5 text-sm text-forest-800">📍 {s.place}</div>}
                          <p className="mt-1 text-sm text-gray-600">{s.description || 'Без комментария'}</p>
                          <div className="mt-1.5 text-xs text-forest-600">Показать на карте →{s.confirms > 0 && <span className="text-gray-500"> · подтвердили: {s.confirms}</span>}</div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div>
                <span className={label}>1. Место</span>
                <div className={`rounded-2xl border-2 border-dashed p-3 text-sm ${picked ? 'border-forest-600 bg-forest-50' : 'border-forest-100 text-gray-500'}`}>
                  {!picked
                    ? '👆 Нажмите на карту, где вы видели медведя'
                    : placeBusy
                      ? 'Определяем название места…'
                      : <>📍 {place ?? 'Вне улиц и населённых пунктов'}
                          <div className="mt-0.5 text-xs text-gray-500">{picked.lat.toFixed(4)}, {picked.lng.toFixed(4)}{accuracy !== null && ` · точность ±${Math.round(accuracy)} м`}</div></>}
                </div>
                <button onClick={locate} disabled={locating}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-forest-600 py-3 text-base font-semibold text-forest-800 transition active:bg-forest-100 disabled:opacity-50 md:py-2.5 md:text-sm">
                  {locating ? 'Определяем…' : '🎯 Использовать моё местоположение'}
                </button>
                {!picked && (
                  <button onClick={() => setSheet('peek')}
                    className="mt-2 text-sm text-forest-600 underline md:hidden">
                    Свернуть панель, чтобы выбрать место
                  </button>
                )}
              </div>

              <div>
                <span className={label}>2. Когда</span>
                <input type="datetime-local" value={seenAt} max={nowLocal()}
                  onChange={(e) => setSeenAt(e.target.value)} className={field} />
              </div>

              <div>
                <span className={label}>3. Сколько медведей</span>
                <div className="flex items-center gap-4">
                  <button onClick={() => setCount((c) => Math.max(1, c - 1))}
                    className="h-12 w-12 rounded-full bg-forest-50 text-2xl font-bold text-forest-800 active:bg-forest-100 md:h-10 md:w-10 md:text-xl">−</button>
                  <span className="w-6 text-center text-xl font-bold">{count}</span>
                  <button onClick={() => setCount((c) => Math.min(10, c + 1))}
                    className="h-12 w-12 rounded-full bg-forest-50 text-2xl font-bold text-forest-800 active:bg-forest-100 md:h-10 md:w-10 md:text-xl">+</button>
                </div>
              </div>

              <div>
                <span className={label}>4. Комментарий</span>
                <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} maxLength={500}
                  placeholder="Куда шёл, был ли медвежонок, что делал…" className={field} />
              </div>

              <label className="flex items-start gap-3 text-sm text-gray-600">
                <input type="checkbox" checked={consent}
                  onChange={(e) => {
                    setConsent(e.target.checked);
                    try { localStorage.setItem('bmk_consent', e.target.checked ? '1' : '0'); } catch { /* ничего */ }
                  }}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[#24422f]" />
                <span>Согласен на обработку указанных данных, включая местоположение, согласно{' '}
                  <Link href="/privacy" className="text-forest-600 underline">политике конфиденциальности</Link>.</span>
              </label>

              {CAPTCHA_ON && <Turnstile onToken={setToken} resetKey={captchaKey} />}

              {/* Кнопка остаётся видимой при прокрутке формы */}
              <div className="sticky bottom-0 -mx-5 bg-white/95 px-5 pb-2 pt-3 backdrop-blur">
                <button onClick={submit} disabled={busy || !picked || !consent || (CAPTCHA_ON && !token)}
                  className="w-full rounded-2xl bg-bear-600 py-4 text-base font-bold text-white shadow-lg shadow-bear-600/30 transition active:brightness-90 disabled:opacity-40 disabled:shadow-none md:py-3.5">
                  {busy ? 'Отправка…' : !picked ? 'Сначала выберите место на карте' : !consent ? 'Нужно согласие на обработку данных' : CAPTCHA_ON && !token ? 'Пройдите проверку выше' : '🐻 Отправить наблюдение'}
                </button>
              </div>
            </div>
          )}

          <p className="mt-5 rounded-xl bg-forest-50 p-3 text-xs leading-relaxed text-gray-600 md:hidden">{safety}</p>
        </div>

        <footer className="hidden border-t border-forest-100 bg-forest-50 px-5 py-3 text-xs leading-relaxed text-gray-600 md:block">
          {safety}
        </footer>
      </aside>
    </main>
  );
}
