import { assertEntierPositif, ErreurMetier } from './erreurs';
import type { Centilitres } from './types';

/** Index relevé sur un pistolet lors d'une passation. */
export interface IndexPistolet {
  /** Identifiant lisible du pistolet, ex : "P3-A". */
  pistolet: string;
  /** Index du totaliseur en centilitres. */
  index: Centilitres;
}

/** Un pistolet dont les index sortant et entrant ne concordent pas. */
export interface EcartPassation {
  pistolet: string;
  indexSortant: Centilitres;
  indexEntrant: Centilitres;
  /** entrant − sortant, en centilitres. Jamais 0 (sinon il n'y a pas d'écart). */
  ecart: Centilitres;
}

function indexerParPistolet(
  liste: readonly IndexPistolet[],
  nom: string,
): Map<string, Centilitres> {
  const map = new Map<string, Centilitres>();
  for (const { pistolet, index } of liste) {
    assertEntierPositif(index, `${nom}[${pistolet}].index`);
    if (map.has(pistolet)) {
      throw new ErreurMetier(
        'PASSATION_PISTOLET_DUPLIQUE',
        `Le pistolet ${pistolet} apparaît deux fois dans la liste ${nom}.`,
      );
    }
    map.set(pistolet, index);
  }
  return map;
}

/**
 * Compare les index déclarés par le pompiste sortant et par le pompiste entrant.
 * Renvoie la liste des pistolets en écart (tolérance 0), dans l'ordre de la liste sortante.
 * Une liste vide signifie que la passation est conforme.
 *
 * Lève `PASSATION_PISTOLETS_DIFFERENTS` si les deux listes ne couvrent pas exactement
 * les mêmes pistolets : une passation partielle n'est pas une passation.
 */
export function comparerPassation(
  indexSortant: readonly IndexPistolet[],
  indexEntrant: readonly IndexPistolet[],
): EcartPassation[] {
  const sortant = indexerParPistolet(indexSortant, 'indexSortant');
  const entrant = indexerParPistolet(indexEntrant, 'indexEntrant');

  if (sortant.size !== entrant.size || [...sortant.keys()].some((p) => !entrant.has(p))) {
    const manquants = [
      ...[...sortant.keys()].filter((p) => !entrant.has(p)),
      ...[...entrant.keys()].filter((p) => !sortant.has(p)),
    ];
    throw new ErreurMetier(
      'PASSATION_PISTOLETS_DIFFERENTS',
      `Les listes sortant / entrant ne couvrent pas les mêmes pistolets (${manquants.join(', ')}).`,
    );
  }

  const ecarts: EcartPassation[] = [];
  for (const [pistolet, valeurSortant] of sortant) {
    const valeurEntrant = entrant.get(pistolet)!;
    if (valeurEntrant !== valeurSortant) {
      ecarts.push({
        pistolet,
        indexSortant: valeurSortant,
        indexEntrant: valeurEntrant,
        ecart: valeurEntrant - valeurSortant,
      });
    }
  }
  return ecarts;
}
