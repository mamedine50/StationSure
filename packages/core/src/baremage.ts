import { ErreurMetier } from './erreurs';
import { litresToCl } from './unites';

/** Point de barémage en unités serveur : hauteur en millimètres, volume en centilitres. */
export interface PointBaremageMm {
  hauteurMm: number;
  volumeCl: number;
}

export type ErreurBaremage =
  | 'POINTS_INSUFFISANTS'
  | 'HAUTEUR_INVALIDE'
  | 'VOLUME_INVALIDE'
  | 'HAUTEUR_DUPLIQUEE'
  | 'VOLUME_NON_CROISSANT';

export interface ProblemeBaremage {
  code: ErreurBaremage;
  /** Index (0-based) du point concerné dans la liste triée, s'il y en a un. */
  index?: number;
}

/**
 * Valide une table de barémage complète (miroir de `private.validate_calibration_points` en base) :
 * au moins 2 points, hauteurs entières ≥ 0 et uniques, volumes entiers ≥ 0 STRICTEMENT croissants
 * avec la hauteur. Renvoie la liste des problèmes (vide = valide).
 */
export function validerBaremage(points: readonly PointBaremageMm[]): ProblemeBaremage[] {
  const problemes: ProblemeBaremage[] = [];
  if (points.length < 2) problemes.push({ code: 'POINTS_INSUFFISANTS' });
  const tries = [...points].sort((a, b) => a.hauteurMm - b.hauteurMm);
  tries.forEach((p, i) => {
    if (!Number.isInteger(p.hauteurMm) || p.hauteurMm < 0)
      problemes.push({ code: 'HAUTEUR_INVALIDE', index: i });
    if (!Number.isInteger(p.volumeCl) || p.volumeCl < 0)
      problemes.push({ code: 'VOLUME_INVALIDE', index: i });
    if (i > 0) {
      const prev = tries[i - 1]!;
      if (prev.hauteurMm === p.hauteurMm) problemes.push({ code: 'HAUTEUR_DUPLIQUEE', index: i });
      else if (p.volumeCl <= prev.volumeCl)
        problemes.push({ code: 'VOLUME_NON_CROISSANT', index: i });
    }
  });
  return problemes;
}

/** Vrai si la table commence par le point (0 mm, 0 cL), conseillé mais non obligatoire. */
export function commenceAZero(points: readonly PointBaremageMm[]): boolean {
  return points.some((p) => p.hauteurMm === 0 && p.volumeCl === 0);
}

export interface ResultatImportCsv {
  points: PointBaremageMm[];
  /** Lignes ignorées ou invalides : numéro de ligne (1-based) et motif. */
  lignesRejetees: { ligne: number; motif: 'FORMAT' | 'HAUTEUR' | 'VOLUME' }[];
}

/**
 * Lit un CSV « hauteur_mm;volume_l » (séparateur ; ou , ou tabulation, décimale , ou .).
 * La première ligne est ignorée si elle contient des lettres (en-tête). Les volumes en litres
 * sont convertis en centilitres. Les lignes vides sont ignorées.
 */
export function lireBaremageCsv(texte: string): ResultatImportCsv {
  const points: PointBaremageMm[] = [];
  const lignesRejetees: ResultatImportCsv['lignesRejetees'] = [];
  const lignes = texte.split(/\r?\n/);
  lignes.forEach((brute, i) => {
    const ligne = brute.trim();
    if (!ligne) return;
    if (i === 0 && /[a-zA-Z]/.test(ligne)) return; // en-tête
    const cellules = ligne.split(/[;\t]|,(?=\s*\d+(?:[.,]\d+)?\s*$)/).map((c) => c.trim());
    if (cellules.length < 2) {
      lignesRejetees.push({ ligne: i + 1, motif: 'FORMAT' });
      return;
    }
    const hauteur = Number(cellules[0]!.replace(/\s/g, ''));
    const volumeLitres = Number(cellules[1]!.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isInteger(hauteur) || hauteur < 0) {
      lignesRejetees.push({ ligne: i + 1, motif: 'HAUTEUR' });
      return;
    }
    if (!Number.isFinite(volumeLitres) || volumeLitres < 0) {
      lignesRejetees.push({ ligne: i + 1, motif: 'VOLUME' });
      return;
    }
    points.push({ hauteurMm: hauteur, volumeCl: litresToCl(volumeLitres) });
  });
  return { points, lignesRejetees };
}

/**
 * Volume interpolé pour une hauteur en mm (même règle que `volumeDepuisBaremage` et que
 * `volume_from_calibration` en base) : point exact, interpolation linéaire arrondie au cL,
 * erreur hors table.
 */
export function volumeDepuisBaremageMm(
  hauteurMm: number,
  points: readonly PointBaremageMm[],
): number {
  if (points.length === 0)
    throw new ErreurMetier('BAREMAGE_TABLE_VIDE', 'La table de barémage est vide.');
  const tries = [...points].sort((a, b) => a.hauteurMm - b.hauteurMm);
  const min = tries[0]!;
  const max = tries[tries.length - 1]!;
  if (hauteurMm < min.hauteurMm || hauteurMm > max.hauteurMm) {
    throw new ErreurMetier(
      'BAREMAGE_HORS_TABLE',
      `Hauteur ${hauteurMm} mm hors de [${min.hauteurMm} ; ${max.hauteurMm}] mm.`,
    );
  }
  for (let i = 1; i < tries.length; i++) {
    const bas = tries[i - 1]!;
    const haut = tries[i]!;
    if (hauteurMm === bas.hauteurMm) return bas.volumeCl;
    if (hauteurMm === haut.hauteurMm) return haut.volumeCl;
    if (hauteurMm > bas.hauteurMm && hauteurMm < haut.hauteurMm) {
      const ratio = (hauteurMm - bas.hauteurMm) / (haut.hauteurMm - bas.hauteurMm);
      return Math.round(bas.volumeCl + ratio * (haut.volumeCl - bas.volumeCl));
    }
  }
  return min.volumeCl;
}
