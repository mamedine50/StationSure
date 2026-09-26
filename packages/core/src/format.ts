import { assertEntier, assertNombreFini } from './erreurs';
import type { Centilitres, FCFA, Pourcentage } from './types';

/**
 * Format sénégalais des nombres :
 * espace comme séparateur de milliers, virgule décimale, signe moins typographique (U+2212)
 * comme sur la maquette (« −35 000 »).
 */
export const SEPARATEUR_MILLIERS = ' ';
export const SEPARATEUR_DECIMAL = ',';
export const SIGNE_MOINS = '−';

function grouperMilliers(entierAbsolu: string): string {
  return entierAbsolu.replace(/\B(?=(\d{3})+(?!\d))/g, SEPARATEUR_MILLIERS);
}

/**
 * Formate un montant FCFA entier : `formatFCFA(2385000)` → `"2 385 000"`,
 * `formatFCFA(-35000)` → `"−35 000"`. Le symbole « FCFA » n'est pas ajouté (libellé i18n).
 */
export function formatFCFA(montant: FCFA): string {
  assertEntier(montant, 'montant');
  const signe = montant < 0 ? SIGNE_MOINS : '';
  return signe + grouperMilliers(String(Math.abs(montant)));
}

/**
 * Formate un volume en centilitres en litres à 2 décimales :
 * `formatLitres(48237125)` → `"482 371,25"`, `formatLitres(1000)` → `"10,00"`.
 * L'unité « L » n'est pas ajoutée (libellé i18n).
 */
export function formatLitres(cl: Centilitres): string {
  assertEntier(cl, 'cl');
  const signe = cl < 0 ? SIGNE_MOINS : '';
  const abs = Math.abs(cl);
  const entier = Math.trunc(abs / 100);
  const decimales = String(abs % 100).padStart(2, '0');
  return signe + grouperMilliers(String(entier)) + SEPARATEUR_DECIMAL + decimales;
}

/**
 * Formate un pourcentage avec 1 décimale par défaut : `formatPourcent(-0.9)` → `"−0,9 %"`.
 * L'espace avant « % » est insécable (U+00A0).
 */
export function formatPourcent(valeur: Pourcentage, decimales = 1): string {
  assertNombreFini(valeur, 'valeur');
  const signe = valeur < 0 ? SIGNE_MOINS : '';
  const [entier = '0', fraction = ''] = Math.abs(valeur).toFixed(decimales).split('.');
  const partieDecimale = decimales > 0 ? SEPARATEUR_DECIMAL + fraction : '';
  return `${signe}${grouperMilliers(entier)}${partieDecimale}\u00A0%`;
}
