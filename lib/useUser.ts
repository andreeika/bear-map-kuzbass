'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [isModerator, setIsModerator] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function check(u: User | null) {
      setUser(u);
      if (u) {
        const { data } = await supabase.rpc('is_moderator');
        setIsModerator(data === true);
      } else {
        setIsModerator(false);
      }
      setLoading(false);
    }
    supabase.auth.getSession().then(({ data }) => check(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setTimeout(() => check(session?.user ?? null), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { user, isModerator, loading };
}
