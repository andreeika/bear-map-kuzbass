import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type Sighting = {
  id: string;
  lat: number;
  lng: number;
  seen_at: string;
  description: string | null;
  bears_count: number;
  place: string | null;
  confirms: number;
};
