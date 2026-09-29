import { Pressable, Text, View } from 'react-native';

/**
 * Bouton d'action d'un onglet : libellé, détail, et « raison » quand les prérequis manquent
 * (le bouton est alors désactivé et la raison est affichée, jamais une erreur technique).
 */
export function BoutonAction({
  libelle,
  detail,
  raison,
  principal,
  onPress,
}: {
  libelle: string;
  detail?: string;
  raison?: string | null;
  principal?: boolean;
  onPress: () => void;
}) {
  const desactive = Boolean(raison);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: desactive }}
      disabled={desactive}
      onPress={onPress}
      className={`min-h-16 justify-center rounded-xl px-4 py-3 ${principal ? 'bg-accent' : 'border border-bordure bg-surface'} ${desactive ? 'opacity-50' : ''}`}
    >
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <Text
            className={`font-sans-semibold ${principal ? 'text-[20px] text-accent-texte' : 'text-[16px] text-texte'}`}
          >
            {libelle}
          </Text>
          {(raison ?? detail) && (
            <Text
              className={`font-sans text-[13px] ${principal ? 'text-accent-texte' : raison ? 'text-accent' : 'text-texte-secondaire'}`}
            >
              {raison ?? detail}
            </Text>
          )}
        </View>
        <Text
          className={`font-sans text-[18px] ${principal ? 'text-accent-texte' : 'text-texte-secondaire'}`}
        >
          ›
        </Text>
      </View>
    </Pressable>
  );
}
