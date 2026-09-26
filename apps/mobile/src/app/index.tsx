import { ActivityIndicator, View } from 'react-native';

import { couleurs } from '@stationsure/ui';

/** Écran de chargement : la Garde du layout redirige selon l'état de session. */
export default function Chargement() {
  return (
    <View className="flex-1 items-center justify-center bg-fond">
      <ActivityIndicator color={couleurs.accent} />
    </View>
  );
}
