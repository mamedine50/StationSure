/** Données d'une cuve renvoyées par la RPC tank_levels, sérialisables pour les composants client. */
export interface NiveauCuve {
  tankId: string;
  stationId: string;
  label: string;
  produit: 'super' | 'gasoil';
  capaciteCl: number;
  mesureCl: number | null;
  mesureA: string | null;
  theoriqueCl: number | null;
  ecartCl: number | null;
  ecartPct: number | null;
  ventesJourCl: number;
  autonomieJours: number | null;
  seuilPct: number;
  seuilCl: number;
  sousSeuil: boolean;
}

/**
 * Hauteur de liquide (0..1 du diamètre) d'un cylindre couché pour une fraction de volume
 * (aire du segment circulaire, résolue par dichotomie). Même règle pour la vue 3D et la vue simple.
 */
export function hauteurPourFraction(fraction: number): number {
  const f = Math.min(1, Math.max(0, fraction));
  if (f === 0) return 0;
  if (f === 1) return 1;
  let bas = 0;
  let haut = 1;
  for (let i = 0; i < 40; i += 1) {
    const h = (bas + haut) / 2;
    // aire du segment pour un rayon 1, hauteur 2h : acos(1-2h) - (1-2h)·sqrt(1-(1-2h)²), normalisée par π
    const d = 1 - 2 * h;
    const aire = (Math.acos(d) - d * Math.sqrt(1 - d * d)) / Math.PI;
    if (aire < f) bas = h;
    else haut = h;
  }
  return (bas + haut) / 2;
}
