import { IBM_Plex_Mono, IBM_Plex_Sans, Sora } from 'next/font/google';

/**
 * Polices de la maquette, chargées par next/font (auto-hébergées, sans requête externe au runtime).
 * Les variables CSS sont consommées par le preset Tailwind de @stationsure/ui (plateforme "web").
 */
export const sora = Sora({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-sora',
  display: 'swap',
});

export const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-sans',
  display: 'swap',
});

export const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});

export const classesPolices = `${sora.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable}`;
