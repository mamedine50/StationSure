import { assertEntier } from './erreurs';
import { formatFCFA, formatLitres, formatPourcent } from './format';
import type { FCFA, Pourcentage } from './types';

/**
 * Notifications propriétaire (phase 5) : validation des numéros E.164 et rendu des messages.
 * Le rendu est le MIROIR EXACT de `render_evening_report`, `render_summary_report` et
 * `render_alert_message` en base (migration 0016) : modifier les deux ensemble.
 */

/** Numéro international E.164 : « + », indicatif sans 0, 7 à 15 chiffres au total. */
const E164 = /^\+[1-9][0-9]{6,14}$/;

/**
 * Normalise une saisie en E.164 : espaces, points, tirets et parenthèses ignorés ; un « 00 »
 * initial devient « + » ; un numéro sénégalais à 9 chiffres (7x…) reçoit l'indicatif 221.
 * Retourne `null` si le résultat n'est pas un numéro valide.
 */
export function normaliserE164(saisie: string): string | null {
  let s = saisie.replace(/[\s.\-()]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (/^7[0-9]{8}$/.test(s)) s = `+221${s}`;
  return E164.test(s) ? s : null;
}

export function estE164(numero: string): boolean {
  return E164.test(numero);
}

/** Rapport du soir (écran 06), construit par le serveur depuis les valeurs figées de la clôture. */
export interface RapportSoir {
  station: string;
  /** « JJ/MM » */
  date: string;
  shiftLabel?: string | null;
  caTotal: FCFA;
  caCarburant: FCFA;
  caBoutique: FCFA;
  caGarage: FCFA;
  caLavage: FCFA;
  litresSuperCl: number;
  litresGasoilCl: number;
  mobileFcfa: FCFA;
  mobileRapproche: boolean;
  ecartCaisse: FCFA;
  toleranceCaisse: FCFA;
  gerant?: string | null;
  /** Écart de passation en centilitres (valeur absolue affichée), null si aucun. */
  ecartPassationCl?: number | null;
  pistoletPassation?: string | null;
  ecartCuvePct?: Pourcentage | null;
  seuilCuvePct: Pourcentage;
  cuveOk: boolean;
  photosFaites: number;
  photosTotal: number;
  bordereau: 'declared' | 'slip' | 'missing';
  lien: string;
}

function litresEntiers(cl: number): string {
  assertEntier(cl, 'cl');
  return formatFCFA(Math.trunc(cl / 100));
}

/** Texte WhatsApp du rapport du soir. Même sortie que `render_evening_report` (SQL). */
export function renderRapportSoir(r: RapportSoir): string {
  const lignes: string[] = [];
  lignes.push(`Station ${r.station} · Clôture du ${r.date}`);
  lignes.push(`Chiffre d'affaires : ${formatFCFA(r.caTotal)} FCFA`);
  lignes.push(
    `Carburant ${formatFCFA(r.caCarburant)} · Boutique ${formatFCFA(r.caBoutique)} · Garage ${formatFCFA(r.caGarage)} · Lavage ${formatFCFA(r.caLavage)}`,
  );
  lignes.push(
    `Litres : Super ${litresEntiers(r.litresSuperCl)} · Gasoil ${litresEntiers(r.litresGasoilCl)}`,
  );
  if (Math.abs(r.ecartCaisse) > r.toleranceCaisse) {
    lignes.push(
      `⚠️ Écart caisse ${r.shiftLabel ?? 'shift'} : ${formatFCFA(r.ecartCaisse)} FCFA (gérant : ${r.gerant ?? '?'})`,
    );
  } else {
    lignes.push(
      `✅ Caisse : ${r.ecartCaisse === 0 ? 'aucun écart' : `${formatFCFA(r.ecartCaisse)} FCFA (toléré)`}`,
    );
  }
  if (r.ecartPassationCl !== null && r.ecartPassationCl !== undefined) {
    lignes.push(
      `⚠️ Passation : ${formatLitres(Math.abs(r.ecartPassationCl))} L à justifier (${r.pistoletPassation ?? '?'})`,
    );
  } else {
    lignes.push('✅ Passations OK');
  }
  lignes.push(
    r.bordereau === 'declared'
      ? '✅ Versement banque déclaré'
      : r.bordereau === 'slip'
        ? '✅ Bordereau de versement : photo jointe'
        : '⚠️ Bordereau de versement : manquant',
  );
  lignes.push(
    `${r.mobileRapproche ? '✅' : '⚠️'} Wave / Orange Money : ${formatFCFA(r.mobileFcfa)} FCFA, ${r.mobileRapproche ? 'rapproché' : 'en attente de rapprochement'}`,
  );
  if (r.ecartCuvePct !== null && r.ecartCuvePct !== undefined) {
    lignes.push(
      `${r.cuveOk ? '✅' : '⚠️'} Cuves : ${formatPourcent(r.ecartCuvePct)} (seuil ${formatPourcent(r.seuilCuvePct)})`,
    );
  } else {
    lignes.push('✅ Cuves : pas de jaugeage rapproché');
  }
  lignes.push(
    `${r.photosFaites === r.photosTotal ? '✅' : '⚠️'} Photos d'index : ${r.photosFaites}/${r.photosTotal}`,
  );
  lignes.push(`Détail : ${r.lien}`);
  return lignes.join('\n');
}

/** Résumé multi-stations d'une journée. Même sortie que `render_summary_report` (SQL). */
export interface ResumeJournee {
  date: string;
  clotures: number;
  stationsTotal: number;
  stations: { station: string; caFcfa: FCFA; ecartFcfa: FCFA }[];
  caTotal: FCFA;
  alertesGraves: number;
}

export function renderResumeJournee(r: ResumeJournee): string {
  const lignes = [
    `Résumé du ${r.date} · ${r.clotures} clôture(s) sur ${r.stationsTotal} station(s)`,
    ...r.stations.map(
      (s) =>
        `• ${s.station} : ${formatFCFA(s.caFcfa)} FCFA${s.ecartFcfa !== 0 ? ` · écart ${formatFCFA(s.ecartFcfa)}` : ' · caisse OK'}`,
    ),
    `Total : ${formatFCFA(r.caTotal)} FCFA · alertes graves : ${r.alertesGraves}`,
  ];
  return lignes.join('\n');
}

/** Message court d'alerte immédiate : quoi, où, qui, montant, lien. */
export interface AlerteCourte {
  station: string;
  quoi: string;
  qui?: string | null;
  lien: string;
}

export function renderAlerteCourte(a: AlerteCourte): string {
  return `⚠️ ${a.station} · ${a.quoi}${a.qui ? ` · ${a.qui}` : ''}\n${a.lien}`;
}

/** Modèles WhatsApp (docs/whatsapp-modeles.md) et leurs variables, dans l'ordre. */
export const MODELES_WHATSAPP = {
  stationsure_rapport_soir: ['station', 'date', 'corps'],
  stationsure_resume_journee: ['date', 'corps'],
  stationsure_alerte: ['station', 'corps'],
  stationsure_relance_bordereau: ['prenom', 'date', 'station', 'montant'],
} as const;

export type ModeleWhatsApp = keyof typeof MODELES_WHATSAPP;
