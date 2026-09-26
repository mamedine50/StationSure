import { couleurs } from '@stationsure/ui';
import Svg, { Path } from 'react-native-svg';

/** Coche verte « appareil enregistré » (maquette 01). */
export function IconeCoche({ taille = 14 }: { taille?: number }) {
  return (
    <Svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke={couleurs.succes}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M20 6 9 17l-5-5" />
    </Svg>
  );
}
