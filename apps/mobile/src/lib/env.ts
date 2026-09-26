/** Variables publiques Supabase (voir .env.example). Jamais de secret ici. */
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Minutes sans interaction avant retour à l'écran PIN. */
export const INACTIVITE_MINUTES = 10;
