import { assertEntier, assertNombreFini } from './erreurs';
import type { Centilitres, Litres } from './types';

/**
 * Convertit des litres (décimaux, saisie utilisateur) en centilitres entiers.
 * Arrondi au centilitre le plus proche : `litresToCl(482371.25)` → `48237125`.
 */
export function litresToCl(litres: Litres): Centilitres {
  assertNombreFini(litres, 'litres');
  // Le passage par une chaîne évite les artefacts type 0.1 * 100 = 10.000000000000002
  return Math.round(Number((litres * 100).toFixed(6)));
}

/**
 * Convertit des centilitres entiers en litres à 2 décimales (pour l'affichage ou la saisie).
 * `clToLitres(48237125)` → `482371.25`.
 */
export function clToLitres(cl: Centilitres): Litres {
  assertEntier(cl, 'cl');
  return Number((cl / 100).toFixed(2));
}
