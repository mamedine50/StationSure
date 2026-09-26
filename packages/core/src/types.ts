/**
 * Unités internes : toujours des ENTIERS pour éviter les erreurs de virgule flottante.
 *
 * - Les montants sont en francs CFA entiers (le FCFA n'a pas de sous-unité).
 * - Les volumes sont en centilitres entiers (1 L = 100 cL), ce qui donne les 2 décimales
 *   exigées par le métier (« 482 371,25 L ») sans jamais manipuler de flottant.
 *
 * Les alias ci-dessous ne sont pas des types nominaux : ils documentent l'intention
 * et rendent les signatures lisibles.
 */

/** Montant en francs CFA, entier. */
export type FCFA = number;

/** Volume en centilitres, entier (1 L = 100 cL). */
export type Centilitres = number;

/** Volume en litres, décimal (2 décimales max). N'est utilisé qu'aux frontières (saisie / affichage). */
export type Litres = number;

/** Hauteur de jauge en centimètres (peut être décimale : lecture de réglette). */
export type Centimetres = number;

/** Pourcentage exprimé sur 100 (ex : -0.9 pour -0,9 %). */
export type Pourcentage = number;
