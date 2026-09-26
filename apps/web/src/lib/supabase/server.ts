import type { Database } from '@stationsure/database';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { envSupabase } from '@/lib/env';

/** Client Supabase côté serveur (composants serveur, actions, route handlers), lié aux cookies. */
export async function creerClientServeur() {
  const { url, key } = envSupabase();
  const cookieStore = await cookies();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Appelé depuis un composant serveur : les cookies sont rafraîchis par le proxy.
        }
      },
    },
  });
}
