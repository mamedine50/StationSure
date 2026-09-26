import type { Database } from '@stationsure/database';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env';
import { stockageSecurise } from './stockage-securise';

/** Client Supabase de l'appareil. La session (jetons) vit dans le stockage sécurisé. */
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: stockageSecurise,
    storageKey: 'stationsure.appareil',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Rafraîchit le jeton uniquement quand l'app est au premier plan.
AppState.addEventListener('change', (etat) => {
  if (etat === 'active') void supabase.auth.startAutoRefresh();
  else void supabase.auth.stopAutoRefresh();
});
