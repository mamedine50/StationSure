import { type NextRequest, NextResponse } from 'next/server';

import { creerClientServeur } from '@/lib/supabase/server';

/** Échange le code PKCE des liens e-mail (confirmation, réinitialisation) contre une session. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const suite = searchParams.get('suite');
  const destination = suite && suite.startsWith('/') ? suite : '/';

  if (code) {
    const supabase = await creerClientServeur();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${destination}`);
  }
  return NextResponse.redirect(`${origin}/connexion?erreur=callback`);
}
