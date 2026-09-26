/** Variables publiques Supabase (voir .env.example). Lues à l'exécution, jamais de secret ici. */
export function envSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY sont requis (voir .env.example).',
    );
  }
  return { url, key };
}

/** Vrai quand le Supabase ciblé est la pile locale (pages et actions réservées au développement). */
export function estEnvironnementLocal(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  return /^https?:\/\/(127\.0\.0\.1|localhost|192\.168\.|10\.|host\.docker\.internal)/.test(url);
}
