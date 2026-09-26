import { assertNombreFini } from './erreurs';

/** Types de contrôle soumis à un seuil d'alerte. */
export type TypeAlerte = 'cuve' | 'livraison' | 'passation' | 'paiementElectronique';

export type ResultatAlerte = 'ok' | 'alerte';

/**
 * Seuils de tolérance, en valeur absolue.
 * - `cuve` et `livraison` : pourcentage (± x %).
 * - `passation` : écart d'index en centilitres.
 * - `paiementElectronique` : écart en FCFA entre le relevé opérateur et la caisse.
 */
export interface Seuils {
  cuve: number;
  livraison: number;
  passation: number;
  paiementElectronique: number;
}

/**
 * Valeurs de départ de l'architecture v2 (§4), à calibrer par station pendant le pilote.
 * Cuve ± 0,5 % · livraison ± 0,3 % · passation 0 · paiements électroniques 0.
 */
export const SEUILS_PAR_DEFAUT: Readonly<Seuils> = Object.freeze({
  cuve: 0.5,
  livraison: 0.3,
  passation: 0,
  paiementElectronique: 0,
});

/**
 * Évalue une valeur d'écart contre le seuil du contrôle.
 * Le seuil est une tolérance inclusive : |valeur| ≤ seuil → "ok", au-delà → "alerte".
 * `seuils` permet de surcharger partiellement les valeurs par défaut (réglage par station).
 */
export function evaluerAlerte(
  type: TypeAlerte,
  valeur: number,
  seuils: Partial<Seuils> = {},
): ResultatAlerte {
  assertNombreFini(valeur, 'valeur');
  const seuil = seuils[type] ?? SEUILS_PAR_DEFAUT[type];
  assertNombreFini(seuil, `seuils.${type}`);
  return Math.abs(valeur) > seuil ? 'alerte' : 'ok';
}
