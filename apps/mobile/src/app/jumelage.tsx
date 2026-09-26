import { APP_NAME } from '@stationsure/core';
import { useTranslation } from '@stationsure/i18n/react';
import { couleurs } from '@stationsure/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LogoPompe } from '@/components/logo-pompe';
import { jumelerAppareil } from '@/lib/jumelage';
import { useSession } from '@/lib/session';

export default function EcranJumelage() {
  const { t } = useTranslation();
  const { session, rafraichir } = useSession();
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; id?: string }>();
  const [code, setCode] = useState(params.code ?? '');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const jumeler = async (valeur: string, pairingId: string | null) => {
    setErreur(null);
    setEnCours(true);
    const res = await jumelerAppareil(valeur, pairingId, t('pairing.labelDefault'));
    setEnCours(false);
    if (res.ok) {
      await rafraichir();
      return;
    }
    setErreur(res.erreur === 'reseau' ? t('pairing.network') : t('pairing.error'));
  };

  // Code reçu du scanner (ou d'un lien stationsure://pair?code=…) : jumelage automatique.
  useEffect(() => {
    if (!params.code || !/^[0-9]{6}$/.test(params.code)) return;
    const codeRecu = params.code;
    const id = params.id ?? null;
    const minuteur = setTimeout(() => void jumeler(codeRecu, id), 0);
    return () => clearTimeout(minuteur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.code, params.id]);

  const codePropre = code.replace(/\s+/g, '');
  const valide = /^[0-9]{6}$/.test(codePropre);

  return (
    <SafeAreaView className="flex-1 bg-fond">
      <View className="flex-1 gap-6 px-5 pb-6 pt-7">
        <View className="flex-row items-center gap-2">
          <LogoPompe />
          <Text className="font-display text-[15px] text-texte">{APP_NAME}</Text>
        </View>

        {session.etat === 'revoque' && (
          <View className="gap-1 rounded-lg border border-danger-bordure bg-danger-fond p-4">
            <Text className="font-sans-semibold text-[14px] text-danger">
              {t('pairing.revokedTitle')}
            </Text>
            <Text className="font-sans text-[13px] text-texte">{t('pairing.revokedMessage')}</Text>
          </View>
        )}

        <View className="gap-[6px]">
          <Text className="font-display text-[26px] text-texte" accessibilityRole="header">
            {t('pairing.title')}
          </Text>
          <Text className="font-sans text-[14px] leading-5 text-texte-secondaire">
            {t('pairing.subtitle')}
          </Text>
        </View>

        <View className="gap-2">
          <Text className="font-sans text-[13px] text-texte-secondaire">
            {t('pairing.codeLabel')}
          </Text>
          <TextInput
            value={code}
            onChangeText={(v) => setCode(v.replace(/[^0-9 ]/g, '').slice(0, 7))}
            keyboardType="number-pad"
            maxLength={7}
            placeholder="000 000"
            placeholderTextColor={couleurs.bordureForte}
            accessibilityLabel={t('pairing.codeLabel')}
            className="h-16 rounded-lg border border-bordure bg-surface px-4 text-center font-mono text-[28px] tracking-[8px] text-texte"
          />
        </View>

        {erreur && (
          <Text className="font-sans text-[13px] text-danger" accessibilityLiveRegion="polite">
            {erreur}
          </Text>
        )}

        <Pressable
          accessibilityRole="button"
          disabled={!valide || enCours}
          onPress={() => void jumeler(codePropre, null)}
          className={`h-14 items-center justify-center rounded-lg ${valide && !enCours ? 'bg-accent' : 'bg-surface-2'}`}
        >
          {enCours ? (
            <ActivityIndicator color={couleurs.accentTexte} />
          ) : (
            <Text
              className={`font-sans-semibold text-[17px] ${valide ? 'text-accent-texte' : 'text-texte-secondaire'}`}
            >
              {t('pairing.submit')}
            </Text>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={enCours}
          onPress={() => router.push('/scanner')}
          className="h-14 items-center justify-center rounded-lg border border-bordure-forte bg-surface"
        >
          <Text className="font-sans-semibold text-[15px] text-texte">{t('pairing.scan')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
