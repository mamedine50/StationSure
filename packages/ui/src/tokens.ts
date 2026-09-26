/**
 * Design tokens StationSûre — dark mode uniquement.
 * Source : docs/maquette/README.md (section « Design tokens »). Ne pas modifier sans mettre à jour la maquette.
 */

export const couleurs = {
  fond: '#0E1311',
  surface: '#161D1A',
  surface2: '#1E2723',
  bordure: '#2A3530',
  bordureForte: '#4A5852',
  texte: '#EEF2EF',
  texteSecondaire: '#A3B0AA',
  /** Ambre. */
  accent: '#F2A541',
  /** Texte posé sur l'accent. */
  accentTexte: '#1A1206',
  accentFond: '#221C10',
  succes: '#4CC38A',
  danger: '#FF7A66',
  dangerFond: '#2A1512',
  dangerBordure: '#7A2F25',
  info: '#7AA7F5',
  /** Fond de la barre latérale web (maquette 05). */
  surfaceNav: '#111816',
  /** Texte des liens inactifs de la barre latérale (maquette 05). */
  texteNav: '#C9D3CE',
} as const;

export type NomCouleur = keyof typeof couleurs;

/** Familles de polices et graisses utilisées, telles que définies dans la maquette. */
export const polices = {
  /** Titres. */
  titres: { famille: 'Sora', graisses: [600, 700] },
  /** Texte courant. */
  texte: { famille: 'IBM Plex Sans', graisses: [400, 500, 600] },
  /** Tous les chiffres : montants, index, litres. */
  chiffres: { famille: 'IBM Plex Mono', graisses: [500, 600] },
} as const;

/** Rayons de bordure (px). La maquette utilise 10 à 16 px. */
export const rayons = {
  sm: 10,
  md: 12,
  lg: 14,
  xl: 16,
  pilule: 999,
} as const;

/** Hauteur minimale d'une cible tactile (px), obligatoire sur mobile. */
export const HAUTEUR_TACTILE_MIN = 48;

/** Largeurs de référence de la maquette (px). */
export const largeurs = {
  mobile: 390,
  web: 1440,
  barreLaterale: 232,
} as const;
