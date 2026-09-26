import { Pressable, Text, View } from 'react-native';

export interface Profil {
  id: string;
  initiales: string;
  nom: string;
  /** Libellé de rôle déjà traduit. */
  role: string;
}

interface Props {
  profils: readonly Profil[];
  selectionId: string | null;
  onSelection: (id: string) => void;
}

/** Grille 2 colonnes de profils employés (maquette 01). Cible tactile ≥ 68 px. */
export function GrilleProfils({ profils, selectionId, onSelection }: Props) {
  return (
    <View className="flex-row flex-wrap justify-between gap-y-3">
      {profils.map((profil) => {
        const actif = profil.id === selectionId;
        return (
          <Pressable
            key={profil.id}
            accessibilityRole="button"
            accessibilityState={{ selected: actif }}
            onPress={() => onSelection(profil.id)}
            className={`w-[48%] min-h-[68px] flex-row items-center gap-[10px] rounded-lg p-3 ${
              actif ? 'border-2 border-accent bg-accent-fond' : 'border border-bordure bg-surface'
            }`}
          >
            <View
              className={`h-[38px] w-[38px] items-center justify-center rounded-pilule ${
                actif ? 'bg-accent' : 'bg-bordure'
              }`}
            >
              <Text
                className={`font-sans-semibold text-[14px] ${actif ? 'text-accent-texte' : 'text-texte'}`}
              >
                {profil.initiales}
              </Text>
            </View>
            <View className="shrink">
              <Text className="font-sans-semibold text-[14px] text-texte" numberOfLines={1}>
                {profil.nom}
              </Text>
              <Text className="font-sans text-[12px] text-texte-secondaire">{profil.role}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
