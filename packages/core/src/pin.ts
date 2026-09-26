/**
 * Règles du PIN employé. Miroir exact de `private.is_trivial_pin` en base
 * (supabase/migrations/20260926090010_identite.sql) : toute modification doit être faite des deux côtés.
 */

/** Longueur imposée du PIN. */
export const LONGUEUR_PIN = 4;

/** Codes fréquents refusés en plus des motifs (colonnes du pavé, années, « 1004 »…). */
const PINS_INTERDITS: ReadonlySet<string> = new Set([
  '2580',
  '0852',
  '1004',
  '2000',
  '2020',
  '2024',
  '2025',
  '2026',
  '1010',
  '0000',
]);

/** Vrai si la chaîne est exactement 4 chiffres. */
export function estFormatPinValide(pin: string): boolean {
  return new RegExp(`^[0-9]{${LONGUEUR_PIN}}$`).test(pin);
}

/**
 * Vrai si le PIN est trivial : chiffres tous identiques (1111), suite montante ou descendante
 * (1234, 4321, 0123, 9876), motif ABAB (1212), ou code de la liste interdite.
 * Un PIN au mauvais format est considéré trivial (donc refusé).
 */
export function estPinTrivial(pin: string): boolean {
  if (!estFormatPinValide(pin)) return true;
  const chiffres = pin.split('').map(Number);
  const tousIdentiques = chiffres.every((c) => c === chiffres[0]);
  const montante = chiffres.every((c, i) => i === 0 || c === chiffres[i - 1]! + 1);
  const descendante = chiffres.every((c, i) => i === 0 || c === chiffres[i - 1]! - 1);
  const abab = chiffres[0] === chiffres[2] && chiffres[1] === chiffres[3];
  return tousIdentiques || montante || descendante || abab || PINS_INTERDITS.has(pin);
}

export type ErreurPin = 'FORMAT' | 'TRIVIAL';

/** Renvoie le code d'erreur d'un PIN candidat, ou null s'il est acceptable. */
export function validerPin(pin: string): ErreurPin | null {
  if (!estFormatPinValide(pin)) return 'FORMAT';
  if (estPinTrivial(pin)) return 'TRIVIAL';
  return null;
}
