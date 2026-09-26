import { Pressable, Text, View } from 'react-native';

interface Props {
  libelleEffacer: string;
  libelleEntrer: string;
  onChiffre: (chiffre: string) => void;
  onEffacer: () => void;
  onEntrer: () => void;
}

const LIGNES = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
] as const;

function Touche({
  children,
  onPress,
  variante = 'chiffre',
  accessibilityLabel,
}: {
  children: string;
  onPress: () => void;
  variante?: 'chiffre' | 'effacer' | 'entrer';
  accessibilityLabel?: string;
}) {
  const conteneur = {
    chiffre: 'border border-bordure bg-surface active:bg-surface-2',
    effacer: 'border border-bordure bg-transparent active:bg-surface',
    entrer: 'bg-accent active:opacity-90',
  }[variante];
  const texte = {
    chiffre: 'font-mono text-[24px] text-texte',
    effacer: 'font-sans text-[15px] text-texte-secondaire',
    entrer: 'font-sans-semibold text-[17px] text-accent-texte',
  }[variante];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? children}
      onPress={onPress}
      className={`h-[62px] flex-1 items-center justify-center rounded-lg ${conteneur}`}
    >
      <Text className={texte}>{children}</Text>
    </Pressable>
  );
}

/** Pavé numérique 3 × 4 de la maquette 01. Toutes les touches font 62 px de haut (≥ 48 px). */
export function PaveNumerique({
  libelleEffacer,
  libelleEntrer,
  onChiffre,
  onEffacer,
  onEntrer,
}: Props) {
  return (
    <View className="gap-[10px]">
      {LIGNES.map((ligne) => (
        <View key={ligne.join('')} className="flex-row gap-[10px]">
          {ligne.map((chiffre) => (
            <Touche key={chiffre} onPress={() => onChiffre(chiffre)}>
              {chiffre}
            </Touche>
          ))}
        </View>
      ))}
      <View className="flex-row gap-[10px]">
        <Touche variante="effacer" onPress={onEffacer}>
          {libelleEffacer}
        </Touche>
        <Touche onPress={() => onChiffre('0')}>0</Touche>
        <Touche variante="entrer" onPress={onEntrer}>
          {libelleEntrer}
        </Touche>
      </View>
    </View>
  );
}
