import { supabase } from './supabase';

// Случайный анонимный идентификатор браузера (хранится только в этом браузере)
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem('bmk_device');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('bmk_device', id);
    }
    return id;
  } catch {
    return '';
  }
}

// Учёт посетителя: не чаще одного раза в сутки с одного браузера
export function trackVisit() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem('bmk_visit_day') === today) return;
    const id = getDeviceId();
    if (!id) return;
    supabase.rpc('track_visit', { p_device: id }).then(({ error }) => {
      if (!error) localStorage.setItem('bmk_visit_day', today);
    });
  } catch {
    /* хранилище недоступно — просто не считаем */
  }
}
