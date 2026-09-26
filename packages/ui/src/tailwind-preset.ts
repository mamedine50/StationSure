import type { Config } from 'tailwindcss';

import { couleurs, HAUTEUR_TACTILE_MIN, largeurs, rayons } from './tokens';

export type PlateformePreset = 'web' | 'native';

/**
 * Familles de polices par plateforme.
 * - web : variables CSS injectées par next/font (voir apps/web/src/app/fonts.ts).
 * - native : noms des polices chargées par expo-font (@expo-google-fonts/*). Sur React Native,
 *   chaque graisse est une famille distincte, d'où les variantes `-semibold`, `-medium`.
 */
const fontFamilies: Record<PlateformePreset, Record<string, string[]>> = {
  web: {
    display: ['var(--font-sora)', 'Sora', 'sans-serif'],
    'display-semibold': ['var(--font-sora)', 'Sora', 'sans-serif'],
    sans: ['var(--font-ibm-plex-sans)', 'IBM Plex Sans', 'sans-serif'],
    'sans-medium': ['var(--font-ibm-plex-sans)', 'IBM Plex Sans', 'sans-serif'],
    'sans-semibold': ['var(--font-ibm-plex-sans)', 'IBM Plex Sans', 'sans-serif'],
    mono: ['var(--font-ibm-plex-mono)', 'IBM Plex Mono', 'monospace'],
    'mono-semibold': ['var(--font-ibm-plex-mono)', 'IBM Plex Mono', 'monospace'],
  },
  native: {
    display: ['Sora_700Bold'],
    'display-semibold': ['Sora_600SemiBold'],
    sans: ['IBMPlexSans_400Regular'],
    'sans-medium': ['IBMPlexSans_500Medium'],
    'sans-semibold': ['IBMPlexSans_600SemiBold'],
    mono: ['IBMPlexMono_500Medium'],
    'mono-semibold': ['IBMPlexMono_600SemiBold'],
  },
};

/**
 * Preset Tailwind partagé par apps/web (Tailwind + PostCSS) et apps/mobile (NativeWind).
 * Les couleurs et rayons viennent de `tokens.ts` ; seules les polices dépendent de la plateforme.
 */
export function stationsurePreset(plateforme: PlateformePreset): Partial<Config> {
  return {
    theme: {
      extend: {
        colors: {
          fond: couleurs.fond,
          surface: {
            DEFAULT: couleurs.surface,
            2: couleurs.surface2,
            nav: couleurs.surfaceNav,
          },
          bordure: {
            DEFAULT: couleurs.bordure,
            forte: couleurs.bordureForte,
          },
          texte: {
            DEFAULT: couleurs.texte,
            secondaire: couleurs.texteSecondaire,
            nav: couleurs.texteNav,
          },
          accent: {
            DEFAULT: couleurs.accent,
            texte: couleurs.accentTexte,
            fond: couleurs.accentFond,
          },
          succes: couleurs.succes,
          danger: {
            DEFAULT: couleurs.danger,
            fond: couleurs.dangerFond,
            bordure: couleurs.dangerBordure,
          },
          info: couleurs.info,
        },
        fontFamily: fontFamilies[plateforme],
        borderRadius: {
          sm: `${rayons.sm}px`,
          md: `${rayons.md}px`,
          lg: `${rayons.lg}px`,
          xl: `${rayons.xl}px`,
          pilule: `${rayons.pilule}px`,
        },
        minHeight: {
          tactile: `${HAUTEUR_TACTILE_MIN}px`,
        },
        height: {
          tactile: `${HAUTEUR_TACTILE_MIN}px`,
        },
        width: {
          'barre-laterale': `${largeurs.barreLaterale}px`,
        },
      },
    },
  };
}

export default stationsurePreset;
