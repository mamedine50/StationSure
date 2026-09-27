/**
 * Localités du Sénégal (référence `sn_communes` en base) : normalisation et recherche
 * insensible aux accents et à la casse (« Kao » → Kaolack). Utilisé par la liste déroulante
 * de l'onboarding et de la fiche station.
 */
export interface Localite {
  /** Code stable « region/departement/commune ». */
  code: string;
  nom: string;
  departement: string;
  region: string;
}

/** Minuscules, sans accents, ponctuation → espaces (même règle que `normaliser_localite` en base). */
export function normaliserRecherche(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Recherche : chaque mot de la requête doit apparaître au début d'un mot du nom, du
 * département ou de la région. Les correspondances sur le nom passent avant celles sur le
 * département / la région ; à rang égal, ordre alphabétique. `limite` résultats au plus.
 */
export function rechercherLocalites(
  requete: string,
  localites: readonly Localite[],
  limite = 8,
): Localite[] {
  const mots = normaliserRecherche(requete).split(' ').filter(Boolean);
  if (mots.length === 0) return [];
  const rang = (l: Localite): number => {
    const nom = normaliserRecherche(l.nom);
    const contexte = normaliserRecherche(`${l.departement} ${l.region}`);
    const debutDeMot = (texte: string, mot: string) =>
      texte.startsWith(mot) || texte.includes(` ${mot}`);
    if (mots.every((m) => debutDeMot(nom, m))) return nom.startsWith(mots[0]!) ? 0 : 1;
    if (mots.every((m) => debutDeMot(nom, m) || debutDeMot(contexte, m))) return 2;
    return -1;
  };
  return localites
    .map((l) => ({ l, r: rang(l) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.l.nom.localeCompare(b.l.nom, 'fr'))
    .slice(0, limite)
    .map((x) => x.l);
}
