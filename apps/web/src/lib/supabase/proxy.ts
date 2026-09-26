import type { Database } from '@stationsure/database';
import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

import { envSupabase } from '@/lib/env';

/** Routes accessibles sans session. */
export const ROUTES_PUBLIQUES = [
  '/connexion',
  '/inscription',
  '/mot-de-passe-oublie',
  '/auth/callback',
];

export function estRoutePublique(pathname: string): boolean {
  return ROUTES_PUBLIQUES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

/**
 * Rafraîchit la session Supabase (cookies) et applique la protection des routes :
 * sans session → /connexion (sauf routes publiques) ; avec session → pas d'accès à /connexion et /inscription.
 */
export async function mettreAJourSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = envSupabase();

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet)
          response.cookies.set(name, value, options);
      },
    },
  });

  // getUser() valide le jeton auprès d'Auth : ne pas remplacer par getSession().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const publique = estRoutePublique(pathname);

  if (!user && !publique) {
    const urlConnexion = request.nextUrl.clone();
    urlConnexion.pathname = '/connexion';
    urlConnexion.search = pathname === '/' ? '' : `?suite=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(urlConnexion);
  }
  if (user && (pathname === '/connexion' || pathname === '/inscription')) {
    const accueil = request.nextUrl.clone();
    accueil.pathname = '/';
    accueil.search = '';
    return NextResponse.redirect(accueil);
  }
  return response;
}
