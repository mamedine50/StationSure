import { assertEntier, assertEntierPositif, ErreurMetier } from './erreurs';
import type { Centilitres, FCFA } from './types';

/**
 * Clôture de caisse : attendu carburant par tranches de prix, attendu en espèces, billetage.
 * Miroir des fonctions SQL `shift_expected_fuel`, `shift_cash_summary` et du trigger de `cash_counts`.
 */

/** Relevés d'un pistolet dans l'ordre chronologique : ouverture, relevés de changement de prix, clôture. */
export interface RelevePistolet {
  /** Index en centilitres. */
  indexCl: Centilitres;
  /** Prix du litre (FCFA) applicable à partir de ce relevé. */
  prixUnitaire: FCFA;
}

export interface TranchePrix {
  litresCl: Centilitres;
  prixUnitaire: FCFA;
  montantFcfa: FCFA;
}

/**
 * Attendu carburant d'un pistolet découpé en tranches de prix : chaque tranche va d'un relevé
 * au suivant et se valorise au prix en vigueur au début de la tranche. Un changement de prix
 * sans relevé intermédiaire ne peut pas être calculé (c'est la base qui le refuse).
 * Lève `INDEX_RECULE` si un index est inférieur au précédent.
 */
export function attenduCarburantParTranches(releves: readonly RelevePistolet[]): TranchePrix[] {
  if (releves.length < 2) return [];
  const tranches: TranchePrix[] = [];
  for (let i = 1; i < releves.length; i++) {
    const debut = releves[i - 1]!;
    const fin = releves[i]!;
    assertEntierPositif(debut.indexCl, `releves[${i - 1}].indexCl`);
    assertEntierPositif(fin.indexCl, `releves[${i}].indexCl`);
    assertEntierPositif(debut.prixUnitaire, `releves[${i - 1}].prixUnitaire`);
    if (fin.indexCl < debut.indexCl) {
      throw new ErreurMetier(
        'INDEX_RECULE',
        `L'index ${fin.indexCl} est inférieur à ${debut.indexCl}.`,
      );
    }
    const litresCl = fin.indexCl - debut.indexCl;
    tranches.push({
      litresCl,
      prixUnitaire: debut.prixUnitaire,
      montantFcfa: Math.round((litresCl * debut.prixUnitaire) / 100),
    });
  }
  return tranches;
}

export interface ElementsAttenduShift {
  carburant: FCFA;
  boutique?: FCFA;
  lavage?: FCFA;
  vidange?: FCFA;
  /** Remboursements de crédit encaissés pendant le shift (entrent en caisse). */
  remboursementsCredit?: FCFA;
  /** Annulations APPROUVÉES par le propriétaire. */
  annulationsApprouvees?: FCFA;
}

/** Attendu total = carburant + boutique + lavage + vidange + remboursements − annulations approuvées. */
export function montantAttenduShift({
  carburant,
  boutique = 0,
  lavage = 0,
  vidange = 0,
  remboursementsCredit = 0,
  annulationsApprouvees = 0,
}: ElementsAttenduShift): FCFA {
  for (const [nom, v] of Object.entries({
    carburant,
    boutique,
    lavage,
    vidange,
    remboursementsCredit,
    annulationsApprouvees,
  }))
    assertEntierPositif(v, nom);
  return carburant + boutique + lavage + vidange + remboursementsCredit - annulationsApprouvees;
}

export interface PaiementsElectroniques {
  wave?: FCFA;
  orangeMoney?: FCFA;
  carte?: FCFA;
  credit?: FCFA;
}

/** Attendu en espèces = attendu total − Wave − Orange Money − carte − ventes à crédit. */
export function montantAttenduEspeces(
  attenduTotal: FCFA,
  { wave = 0, orangeMoney = 0, carte = 0, credit = 0 }: PaiementsElectroniques,
): FCFA {
  assertEntier(attenduTotal, 'attenduTotal');
  for (const [nom, v] of Object.entries({ wave, orangeMoney, carte, credit }))
    assertEntierPositif(v, nom);
  return attenduTotal - wave - orangeMoney - carte - credit;
}

/** Coupures du FCFA acceptées au billetage (billets puis pièces). */
export const COUPURES_FCFA = [10000, 5000, 2000, 1000, 500, 200, 100, 50] as const;
export type Coupure = (typeof COUPURES_FCFA)[number];
export type Billetage = Partial<Record<Coupure, number>>;

/** Total d'un billetage. Refuse les coupures inconnues et les quantités non entières ou négatives. */
export function totalBilletage(billetage: Billetage): FCFA {
  let total = 0;
  for (const [coupure, quantite] of Object.entries(billetage)) {
    const valeur = Number(coupure);
    if (!(COUPURES_FCFA as readonly number[]).includes(valeur)) {
      throw new ErreurMetier('VALEUR_NON_ENTIERE', `Coupure inconnue : ${coupure}.`);
    }
    assertEntierPositif(quantite ?? 0, `billetage[${coupure}]`);
    total += valeur * (quantite ?? 0);
  }
  return total;
}
