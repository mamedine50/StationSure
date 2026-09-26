import { Text, View } from 'react-native';

export interface Etape {
  id: string;
  label: string;
  etat: 'done' | 'current' | 'todo';
  detail?: string | undefined;
}

/** Liste des pistolets / cuves avec leur état (maquettes 02 et 11). */
export function ListeEtapes({
  titre,
  etapes,
  libelles,
}: {
  titre: string;
  etapes: Etape[];
  libelles: { done: string; current: string; todo: string };
}) {
  return (
    <View className="gap-2">
      <Text className="font-sans-semibold text-[14px] text-texte-secondaire">{titre}</Text>
      <View className="overflow-hidden rounded-lg border border-bordure bg-surface">
        {etapes.map((e, i) => (
          <View
            key={e.id}
            className={`flex-row items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-bordure' : ''} ${e.etat === 'current' ? 'bg-accent-fond' : ''}`}
          >
            <View
              className={`h-5 w-5 items-center justify-center rounded-pilule border-2 ${e.etat === 'done' ? 'border-succes' : e.etat === 'current' ? 'border-accent' : 'border-bordure-forte'}`}
            >
              {e.etat === 'done' && <Text className="text-[11px] text-succes">✓</Text>}
            </View>
            <Text
              className={`flex-1 font-sans text-[15px] ${e.etat === 'todo' ? 'text-texte-secondaire' : 'text-texte'} ${e.etat === 'current' ? 'font-sans-semibold' : ''}`}
            >
              {e.label}
            </Text>
            <Text
              className={`font-mono text-[13px] ${e.etat === 'current' ? 'text-accent' : 'text-texte-secondaire'}`}
            >
              {e.detail ?? libelles[e.etat]}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function BarreProgression({ ratio }: { ratio: number }) {
  return (
    <View className="h-2 overflow-hidden rounded-pilule bg-surface-2">
      <View
        className="h-2 rounded-pilule bg-accent"
        style={{ width: `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%` }}
      />
    </View>
  );
}

export function EnTeteEcran({
  titre,
  sousTitre,
  compteur,
  onRetour,
}: {
  titre: string;
  sousTitre?: string | undefined;
  compteur?: string | undefined;
  onRetour?: (() => void) | undefined;
}) {
  return (
    <View className="flex-row items-center gap-3">
      {onRetour && (
        <Text
          onPress={onRetour}
          accessibilityRole="button"
          className="h-11 w-11 rounded-md border border-bordure bg-surface text-center font-sans text-[22px] leading-[44px] text-texte"
        >
          ‹
        </Text>
      )}
      <View className="flex-1">
        <Text className="font-display text-[20px] text-texte" accessibilityRole="header">
          {titre}
        </Text>
        {sousTitre ? (
          <Text className="font-sans text-[12px] text-texte-secondaire">{sousTitre}</Text>
        ) : null}
      </View>
      {compteur ? (
        <Text className="font-mono-semibold text-[18px] text-accent">{compteur}</Text>
      ) : null}
    </View>
  );
}
