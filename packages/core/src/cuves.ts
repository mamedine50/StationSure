import { assertEntier, assertNombreFini } from './erreurs';
import type { Centilitres } from './types';

/**
 * Cuves (écran 20) : autonomie, remplissage et choix de la vue (3D ou simple).
 * Le serveur calcule mesuré / théorique / ventes (RPC `tank_levels`) ; ces fonctions ne font
 * que présenter ces valeurs.
 */

/** Autonomie en jours = volume / ventes moyennes par jour, arrondie au dixième ; null sans ventes. */
export function autonomieJours(volumeCl: Centilitres, ventesJourCl: Centilitres): number | null {
  assertEntier(volumeCl, 'volumeCl');
  assertEntier(ventesJourCl, 'ventesJourCl');
  if (ventesJourCl <= 0) return null;
  return Math.round((volumeCl / ventesJourCl) * 10) / 10;
}

/** Remplissage en % de la capacité (0 à 100, 1 décimale). */
export function pourcentageRemplissage(volumeCl: Centilitres, capaciteCl: Centilitres): number {
  assertEntier(volumeCl, 'volumeCl');
  assertEntier(capaciteCl, 'capaciteCl');
  if (capaciteCl <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((volumeCl / capaciteCl) * 1000) / 10));
}

export type VueCuves = '3d' | 'simple';

export interface ContexteVueCuves {
  /** Choix mémorisé par l'utilisateur, s'il en a fait un. */
  preference?: VueCuves | null;
  webglDisponible: boolean;
  /** `prefers-reduced-motion: reduce`. */
  reduireAnimations: boolean;
}

/**
 * Vue simple automatiquement si WebGL manque ou si l'utilisateur réduit les animations ;
 * sinon la préférence mémorisée, sinon la 3D. Sans WebGL, la 3D n'est jamais choisie.
 */
export function choisirVueCuves(contexte: ContexteVueCuves): VueCuves {
  if (!contexte.webglDisponible) return 'simple';
  if (contexte.preference === '3d' || contexte.preference === 'simple') return contexte.preference;
  return contexte.reduireAnimations ? 'simple' : '3d';
}

/** Couleur du liquide par produit (tokens de la maquette 20). */
export const COULEUR_PRODUIT = { super: '#E8A94D', gasoil: '#5B8DEF' } as const;

/** Formate une autonomie : « 3,2 jours », « 0,6 jour », « — » sans ventes. */
export function formatAutonomie(jours: number | null): string {
  assertNombreFini(jours ?? 0, 'jours');
  if (jours === null) return '—';
  const texte = jours.toFixed(1).replace('.', ',');
  return `${texte} ${jours < 2 ? 'jour' : 'jours'}`;
}
