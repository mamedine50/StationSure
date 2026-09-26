/** Variables publiques Supabase (voir .env.example). Jamais de secret ici. */
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * Variables manquantes au moment du bundle (fichier apps/mobile/.env absent ou Metro lancé avant
 * sa création : relancer avec `npx expo start --clear`). L'app affiche alors un écran explicite
 * au lieu de planter au chargement.
 */
export const VARIABLES_MANQUANTES: string[] = [
  ...(SUPABASE_URL ? [] : ['EXPO_PUBLIC_SUPABASE_URL']),
  ...(SUPABASE_ANON_KEY ? [] : ['EXPO_PUBLIC_SUPABASE_ANON_KEY']),
];

/** Minutes sans interaction avant retour à l'écran PIN. */
export const INACTIVITE_MINUTES = 10;
