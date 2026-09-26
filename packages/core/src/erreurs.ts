/**
 * Erreur métier levée par les fonctions de calcul lorsqu'une entrée est invalide.
 * Le `code` est stable et peut être traduit côté application.
 */
export class ErreurMetier extends Error {
  readonly code: CodeErreurMetier;

  constructor(code: CodeErreurMetier, message: string) {
    super(message);
    this.name = 'ErreurMetier';
    this.code = code;
  }
}

export type CodeErreurMetier =
  | 'INDEX_RECULE'
  | 'VALEUR_NON_ENTIERE'
  | 'VALEUR_NEGATIVE'
  | 'BAREMAGE_TABLE_VIDE'
  | 'BAREMAGE_HORS_TABLE'
  | 'BAREMAGE_HAUTEUR_DUPLIQUEE'
  | 'DIVISION_PAR_ZERO'
  | 'PASSATION_PISTOLETS_DIFFERENTS'
  | 'PASSATION_PISTOLET_DUPLIQUE';

/** Vérifie qu'une valeur est un entier fini, sinon lève `VALEUR_NON_ENTIERE`. */
export function assertEntier(valeur: number, nom: string): void {
  if (!Number.isInteger(valeur)) {
    throw new ErreurMetier(
      'VALEUR_NON_ENTIERE',
      `${nom} doit être un entier (reçu : ${String(valeur)}).`,
    );
  }
}

/** Vérifie qu'une valeur est un entier ≥ 0. */
export function assertEntierPositif(valeur: number, nom: string): void {
  assertEntier(valeur, nom);
  if (valeur < 0) {
    throw new ErreurMetier(
      'VALEUR_NEGATIVE',
      `${nom} ne peut pas être négatif (reçu : ${valeur}).`,
    );
  }
}

/** Vérifie qu'une valeur est un nombre fini (entier ou décimal). */
export function assertNombreFini(valeur: number, nom: string): void {
  if (typeof valeur !== 'number' || !Number.isFinite(valeur)) {
    throw new ErreurMetier('VALEUR_NON_ENTIERE', `${nom} doit être un nombre fini.`);
  }
}
