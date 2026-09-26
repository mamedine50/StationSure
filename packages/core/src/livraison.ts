import { assertEntier, assertEntierPositif, ErreurMetier } from './erreurs';
import type { Centilitres, Pourcentage } from './types';

/** Seuil d'écart livré vs facturé au-delà duquel le bon est signé avec réserve (architecture v2 §4). */
export const SEUIL_LIVRAISON_POURCENT = 0.3;

/** Volume livré mesuré = volume après − volume avant (centilitres). Peut être négatif en cas d'erreur de jauge. */
export function volumeLivre(volumeAvantCl: Centilitres, volumeApresCl: Centilitres): Centilitres {
  assertEntierPositif(volumeAvantCl, 'volumeAvantCl');
  assertEntierPositif(volumeApresCl, 'volumeApresCl');
  return volumeApresCl - volumeAvantCl;
}

/**
 * Écart de livraison en % du volume facturé, 2 décimales : (livré − facturé) / facturé × 100.
 * Négatif = il manque du carburant. Ex : livré 696 000 cL, facturé 700 000 cL → −0,57.
 */
export function ecartLivraisonPourcent(livreCl: Centilitres, factureCl: Centilitres): Pourcentage {
  assertEntier(livreCl, 'livreCl');
  assertEntierPositif(factureCl, 'factureCl');
  if (factureCl === 0)
    throw new ErreurMetier('DIVISION_PAR_ZERO', 'Le volume facturé doit être > 0.');
  return Number((((livreCl - factureCl) / factureCl) * 100).toFixed(2));
}

/** Vrai si l'écart dépasse le seuil (en valeur absolue) : signature avec réserve obligatoire. */
export function livraisonAvecReserve(
  ecartPourcent: Pourcentage,
  seuil = SEUIL_LIVRAISON_POURCENT,
): boolean {
  return Math.abs(ecartPourcent) > seuil;
}
