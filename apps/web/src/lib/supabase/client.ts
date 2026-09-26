'use client';

import type { Database } from '@stationsure/database';
import { createBrowserClient } from '@supabase/ssr';

import { envSupabase } from '@/lib/env';

/** Client Supabase côté navigateur (composants client). */
export function creerClientNavigateur() {
  const { url, key } = envSupabase();
  return createBrowserClient<Database>(url, key);
}
