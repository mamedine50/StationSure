import { assertEntier, assertEntierPositif, assertNombreFini, ErreurMetier } from './erreurs';
import type { Centilitres, Centimetres, Pourcentage } from './types';

/**
 * Litres vendus sur un pistolet = index de fin − index de début (en centilitres).
 * Lève `INDEX_RECULE` si l'index de fin est inférieur à l'index de début :
 * un totaliseur ne recule jamais, c'est un signe de manipulation ou d'erreur de saisie.
 */
export function litresVendus(indexDebut: Centilitres, indexFin: Centilitres): Centilitres {
  assertEntierPositif(indexDebut, 'indexDebut');
  assertEntierPositif(indexFin, 'indexFin');
  if (indexFin < indexDebut) {
    throw new ErreurMetier(
      'INDEX_RECULE',
      `L'index de fin (${indexFin}) est inférieur à l'index de début (${indexDebut}).`,
    );
  }
  return indexFin - indexDebut;
}

/** Somme d'une valeur unique ou d'une liste de valeurs entières. */
function somme(valeurs: number | readonly number[], nom: string): number {
  if (typeof valeurs === 'number') {
    assertEntier(valeurs, nom);
    return valeurs;
  }
  return valeurs.reduce<number>((total, v, i) => {
    assertEntier(v, `${nom}[${i}]`);
    return total + v;
  }, 0);
}

/**
 * Stock théorique d'une cuve (centilitres) :
 * stock initial + livraisons − litres vendus ± ajustements.
 *
 * `livraisons` et `ajustements` acceptent une valeur ou une liste (somme automatique).
 * Les ajustements sont signés (retour produit positif, purge négative…).
 */
export function stockTheorique(
  stockInitial: Centilitres,
  livraisons: Centilitres | readonly Centilitres[],
  litresVendus: Centilitres,
  ajustements: Centilitres | readonly Centilitres[] = 0,
): Centilitres {
  assertEntier(stockInitial, 'stockInitial');
  assertEntierPositif(litresVendus, 'litresVendus');
  return (
    stockInitial +
    somme(livraisons, 'livraisons') -
    litresVendus +
    somme(ajustements, 'ajustements')
  );
}

/** Un point de la table de barémage d'une cuve : hauteur mesurée → volume. */
export interface PointBaremage {
  /** Hauteur de jauge en centimètres. */
  hauteurCm: Centimetres;
  /** Volume correspondant en centilitres. */
  volumeCl: Centilitres;
}

/**
 * Volume physique d'une cuve (centilitres) à partir de la hauteur lue sur la réglette,
 * par interpolation linéaire entre les deux points encadrants de la table de barémage.
 *
 * - La table peut être fournie dans n'importe quel ordre ; elle est triée par hauteur.
 * - Une hauteur égale à un point de la table renvoie exactement son volume.
 * - Lève `BAREMAGE_HORS_TABLE` si la hauteur est en dehors de [min, max] :
 *   on n'extrapole jamais un volume de cuve.
 */
export function volumeDepuisBaremage(
  hauteurCm: Centimetres,
  table: readonly PointBaremage[],
): Centilitres {
  assertNombreFini(hauteurCm, 'hauteurCm');
  if (table.length === 0) {
    throw new ErreurMetier('BAREMAGE_TABLE_VIDE', 'La table de barémage est vide.');
  }
  const points = [...table].sort((a, b) => a.hauteurCm - b.hauteurCm);
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    assertNombreFini(p.hauteurCm, `table[${i}].hauteurCm`);
    assertEntierPositif(p.volumeCl, `table[${i}].volumeCl`);
    if (i > 0 && points[i - 1]!.hauteurCm === p.hauteurCm) {
      throw new ErreurMetier(
        'BAREMAGE_HAUTEUR_DUPLIQUEE',
        `La hauteur ${p.hauteurCm} cm apparaît deux fois dans la table de barémage.`,
      );
    }
  }

  const min = points[0]!;
  const max = points[points.length - 1]!;
  if (hauteurCm < min.hauteurCm || hauteurCm > max.hauteurCm) {
    throw new ErreurMetier(
      'BAREMAGE_HORS_TABLE',
      `Hauteur ${hauteurCm} cm hors de la table de barémage [${min.hauteurCm} ; ${max.hauteurCm}] cm.`,
    );
  }

  for (let i = 1; i < points.length; i++) {
    const bas = points[i - 1]!;
    const haut = points[i]!;
    if (hauteurCm === bas.hauteurCm) return bas.volumeCl;
    if (hauteurCm === haut.hauteurCm) return haut.volumeCl;
    if (hauteurCm > bas.hauteurCm && hauteurCm < haut.hauteurCm) {
      const ratio = (hauteurCm - bas.hauteurCm) / (haut.hauteurCm - bas.hauteurCm);
      return Math.round(bas.volumeCl + ratio * (haut.volumeCl - bas.volumeCl));
    }
  }
  // Table à un seul point et hauteur exactement égale à ce point.
  return min.volumeCl;
}

/**
 * Écart de cuve (centilitres) = stock physique (jaugé) − stock théorique (calculé).
 * Négatif = il manque du carburant.
 */
export function ecartCuve(stockPhysique: Centilitres, stockTheorique: Centilitres): Centilitres {
  assertEntier(stockPhysique, 'stockPhysique');
  assertEntier(stockTheorique, 'stockTheorique');
  return stockPhysique - stockTheorique;
}

/**
 * Écart de cuve en pourcentage des litres vendus sur la période, arrondi à 2 décimales.
 * Ex : écart −4 500 cL sur 500 000 cL vendus → −0,9.
 * Lève `DIVISION_PAR_ZERO` si aucun litre n'a été vendu : le pourcentage n'a pas de sens.
 */
export function ecartCuvePourcent(
  ecart: Centilitres,
  litresVendusPeriode: Centilitres,
): Pourcentage {
  assertEntier(ecart, 'ecart');
  assertEntierPositif(litresVendusPeriode, 'litresVendusPeriode');
  if (litresVendusPeriode === 0) {
    throw new ErreurMetier(
      'DIVISION_PAR_ZERO',
      'Impossible de calculer un écart en % sans litres vendus sur la période.',
    );
  }
  return Number(((ecart / litresVendusPeriode) * 100).toFixed(2));
}
