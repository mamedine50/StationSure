import type { Route } from 'next';

/** Clés de page : identiques aux clés `nav.*` et `empty.*` de @stationsure/i18n. */
export type ClePage =
  | 'dashboard'
  | 'stations'
  | 'fuel'
  | 'cash'
  | 'stock'
  | 'shop'
  | 'garage'
  | 'carwash'
  | 'employees'
  | 'alerts'
  | 'credit'
  | 'settings';

export interface EntreeNavigation {
  cle: ClePage;
  href: Route;
  /** Phase de la roadmap dans laquelle l'écran prend vie (docs/maquette/README.md). */
  phase: number;
}

/** Ordre identique à la barre latérale de la maquette 05, avec « Stock » ajouté. */
export const NAVIGATION: readonly EntreeNavigation[] = [
  { cle: 'dashboard', href: '/', phase: 5 },
  { cle: 'stations', href: '/stations', phase: 1 },
  { cle: 'fuel', href: '/carburant', phase: 3 },
  { cle: 'cash', href: '/caisse', phase: 4 },
  { cle: 'stock', href: '/stock', phase: 9 },
  { cle: 'shop', href: '/boutique', phase: 7 },
  { cle: 'garage', href: '/garage', phase: 8 },
  { cle: 'carwash', href: '/car-wash', phase: 8 },
  { cle: 'employees', href: '/employes', phase: 2 },
  { cle: 'alerts', href: '/alertes', phase: 5 },
  { cle: 'credit', href: '/credit-clients', phase: 4 },
];

/** Entrée épinglée en bas de la barre latérale. */
export const NAVIGATION_PIED: EntreeNavigation = { cle: 'settings', href: '/parametres', phase: 1 };

export function trouverEntree(cle: ClePage): EntreeNavigation {
  const entree = [...NAVIGATION, NAVIGATION_PIED].find((e) => e.cle === cle);
  if (!entree) throw new Error(`Page inconnue : ${cle}`);
  return entree;
}
