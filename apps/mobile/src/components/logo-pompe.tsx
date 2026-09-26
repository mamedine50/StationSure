import { couleurs } from '@stationsure/ui';
import Svg, { Path } from 'react-native-svg';

interface Props {
  taille?: number;
  couleur?: string;
}

/** Icône pompe de la maquette (trait ambre). */
export function LogoPompe({ taille = 22, couleur = couleurs.accent }: Props) {
  return (
    <Svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke={couleur}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M3 22h12" />
      <Path d="M4 9h10" />
      <Path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18" />
      <Path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9.83a2 2 0 0 0-.59-1.42L18 5" />
    </Svg>
  );
}
