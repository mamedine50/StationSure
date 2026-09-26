/**
 * Rapprochement mobile money (Wave, Orange Money) : lecture d'un relevé marchand CSV avec un
 * mapping de colonnes (les formats varient d'un opérateur à l'autre) et interface d'adaptateur
 * pour brancher plus tard l'API marchand sans changer le rapprochement.
 */
import type { FCFA } from './types';

export type OperateurMobileMoney = 'wave' | 'orange_money';

/** Une ligne du relevé marchand, normalisée. */
export interface LigneReleve {
  reference: string;
  montantFcfa: FCFA;
  payeLe: Date;
  /** Ligne brute d'origine, conservée pour l'audit. */
  brut: Record<string, string>;
}

/** Mapping des colonnes du CSV vers les champs attendus (noms d'en-têtes). */
export interface MappingReleve {
  reference: string;
  montant: string;
  date: string;
  /** Format de date : 'iso' (par défaut), 'dmy' (25/09/2026 16:42) ou 'epoch' (secondes). */
  formatDate?: 'iso' | 'dmy' | 'epoch';
}

export interface ResultatLectureReleve {
  lignes: LigneReleve[];
  lignesRejetees: { ligne: number; motif: 'FORMAT' | 'REFERENCE' | 'MONTANT' | 'DATE' }[];
  colonnes: string[];
}

/** Découpe une ligne CSV (séparateur ; , ou tabulation, guillemets doubles gérés). */
export function decouperLigneCsv(ligne: string, separateur: string): string[] {
  const cellules: string[] = [];
  let courante = '';
  let entreGuillemets = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i]!;
    if (c === '"') {
      if (entreGuillemets && ligne[i + 1] === '"') {
        courante += '"';
        i++;
      } else entreGuillemets = !entreGuillemets;
    } else if (c === separateur && !entreGuillemets) {
      cellules.push(courante.trim());
      courante = '';
    } else courante += c;
  }
  cellules.push(courante.trim());
  return cellules;
}

/** Devine le séparateur d'après la ligne d'en-tête. */
export function detecterSeparateur(entete: string): string {
  const candidats = [';', ',', '\t'];
  return candidats.reduce(
    (meilleur, s) => (entete.split(s).length > entete.split(meilleur).length ? s : meilleur),
    ';',
  );
}

/** En-têtes d'un CSV (première ligne non vide). */
export function lireEntetesCsv(texte: string): string[] {
  const premiere = texte.split(/\r?\n/).find((l) => l.trim());
  return premiere ? decouperLigneCsv(premiere, detecterSeparateur(premiere)) : [];
}

export function lireMontantFcfa(texte: string): FCFA | null {
  const propre = texte
    .replace(/[\s\u00a0]/g, '')
    .replace(/FCFA|XOF|CFA/gi, '')
    .replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(propre)) return null;
  return Math.round(Number(propre));
}

export function lireDate(texte: string, format: MappingReleve['formatDate'] = 'iso'): Date | null {
  const t = texte.trim();
  if (!t) return null;
  if (format === 'epoch') {
    const n = Number(t);
    return Number.isFinite(n) ? new Date(n * 1000) : null;
  }
  if (format === 'dmy') {
    const m = t.match(
      /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
    );
    if (!m) return null;
    const annee = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = new Date(
      Date.UTC(
        annee,
        Number(m[2]) - 1,
        Number(m[1]),
        Number(m[4] ?? 0),
        Number(m[5] ?? 0),
        Number(m[6] ?? 0),
      ),
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Lit un relevé marchand CSV selon le mapping. Les lignes invalides sont listées, pas bloquantes. */
export function lireReleveMobileMoney(
  texte: string,
  mapping: MappingReleve,
): ResultatLectureReleve {
  const lignesBrutes = texte.split(/\r?\n/);
  const indexEntete = lignesBrutes.findIndex((l) => l.trim());
  if (indexEntete === -1) return { lignes: [], lignesRejetees: [], colonnes: [] };
  const separateur = detecterSeparateur(lignesBrutes[indexEntete]!);
  const colonnes = decouperLigneCsv(lignesBrutes[indexEntete]!, separateur);
  const idx = (nom: string) => colonnes.findIndex((c) => c.toLowerCase() === nom.toLowerCase());
  const iRef = idx(mapping.reference);
  const iMontant = idx(mapping.montant);
  const iDate = idx(mapping.date);
  const lignes: LigneReleve[] = [];
  const lignesRejetees: ResultatLectureReleve['lignesRejetees'] = [];
  if (iRef === -1 || iMontant === -1 || iDate === -1) {
    return { lignes, lignesRejetees: [{ ligne: indexEntete + 1, motif: 'FORMAT' }], colonnes };
  }
  lignesBrutes.forEach((brute, i) => {
    if (i <= indexEntete || !brute.trim()) return;
    const cellules = decouperLigneCsv(brute, separateur);
    const brut: Record<string, string> = {};
    colonnes.forEach((c, j) => (brut[c] = cellules[j] ?? ''));
    const reference = (cellules[iRef] ?? '').trim();
    if (!reference) return void lignesRejetees.push({ ligne: i + 1, motif: 'REFERENCE' });
    const montantFcfa = lireMontantFcfa(cellules[iMontant] ?? '');
    if (montantFcfa === null || montantFcfa <= 0)
      return void lignesRejetees.push({ ligne: i + 1, motif: 'MONTANT' });
    const payeLe = lireDate(cellules[iDate] ?? '', mapping.formatDate);
    if (!payeLe) return void lignesRejetees.push({ ligne: i + 1, motif: 'DATE' });
    lignes.push({ reference, montantFcfa, payeLe, brut });
  });
  return { lignes, lignesRejetees, colonnes };
}

/**
 * Adaptateur de relevé marchand : aujourd'hui l'import CSV, demain l'API de l'opérateur.
 * Le rapprochement (en base) ne dépend que de `LigneReleve`.
 */
export interface AdaptateurReleveMarchand {
  operateur: OperateurMobileMoney;
  /** Lignes du relevé entre deux dates (incluses). */
  lireReleve(depuis: Date, jusqua: Date): Promise<LigneReleve[]>;
}

/** Implémentation CSV : le relevé est fourni par l'utilisateur, les dates servent de filtre. */
export function adaptateurCsv(
  operateur: OperateurMobileMoney,
  texte: string,
  mapping: MappingReleve,
): AdaptateurReleveMarchand {
  return {
    operateur,
    lireReleve: (depuis, jusqua) =>
      Promise.resolve(
        lireReleveMobileMoney(texte, mapping).lignes.filter(
          (l) => l.payeLe >= depuis && l.payeLe <= jusqua,
        ),
      ),
  };
}
