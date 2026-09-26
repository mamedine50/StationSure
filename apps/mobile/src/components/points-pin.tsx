import { View } from 'react-native';

interface Props {
  longueur: number;
  remplis: number;
}

/** Les 4 points du PIN : pleins (ambre) ou vides (bordure forte). */
export function PointsPin({ longueur, remplis }: Props) {
  return (
    <View className="flex-row gap-4" accessibilityLabel={`${remplis}/${longueur}`}>
      {Array.from({ length: longueur }, (_, i) => (
        <View
          key={i}
          className={`h-4 w-4 rounded-pilule ${
            i < remplis ? 'bg-accent' : 'border-2 border-bordure-forte'
          }`}
        />
      ))}
    </View>
  );
}
