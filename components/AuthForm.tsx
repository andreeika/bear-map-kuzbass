'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

const field =
  'w-full rounded-xl border border-forest-100 bg-forest-50 px-3 py-3 text-base outline-none md:py-2.5 md:text-sm ' +
  'focus:border-forest-600 focus:ring-2 focus:ring-forest-600/20';

export default function AuthForm() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setMsg('');
    if (mode === 'in') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg('Неверная почта или пароль, либо почта не подтверждена.');
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) setMsg(error.message);
      else if (!data.session) setMsg('Проверьте почту и перейдите по ссылке для подтверждения, затем войдите.');
    }
    setBusy(false);
  }

  return (
    <div className="rounded-2xl border border-forest-100 bg-forest-50 p-4">
      <h2 className="font-semibold text-forest-900">
        {mode === 'in' ? 'Вход' : 'Регистрация'}
      </h2>
      <p className="mb-3 text-sm text-gray-600">
        Сообщать о медведях могут только зарегистрированные пользователи.
      </p>
      <div className="space-y-2">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="Почта" className={field} />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="Пароль (от 6 символов)" className={field} />
      </div>
      <button onClick={submit} disabled={busy || !email || password.length < 6}
        className="mt-3 w-full rounded-xl bg-forest-800 py-3.5 text-base font-medium text-white transition hover:bg-forest-900 disabled:opacity-50">
        {busy ? '…' : mode === 'in' ? 'Войти' : 'Зарегистрироваться'}
      </button>
      {msg && <p className="mt-2 text-sm text-red-700">{msg}</p>}
      <button onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(''); }}
        className="mt-3 py-1 text-sm text-forest-600 underline">
        {mode === 'in' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
      </button>
    </div>
  );
}
