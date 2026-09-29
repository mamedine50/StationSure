import { APP_NAME } from '@stationsure/core';
import { useTranslation } from '@stationsure/i18n/react';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { abonnerFile, nombreEnAttente, traiterFile } from '@/lib/preuves';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

/** Écran 24 : profil, modules (lecture seule), photos en attente, changer d'employé, aide, appareil. */
export default function OngletMoi() {
  const { t, i18n } = useTranslation();
  const { session, deconnecterEmploye } = useSession();
  const [photos, setPhotos] = useState(nombreEnAttente());
  const [appareilNom, setAppareilNom] = useState('');
  useEffect(() => abonnerFile(() => setPhotos(nombreEnAttente())), []);
  useEffect(() => {
    void supabase
      .from('devices')
      .select('label')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setAppareilNom(data?.label ?? ''));
  }, []);
  if (session.etat !== 'connecte') return null;
  const { employe, appareil } = session;
  const initiales = employe.fullName
    .split(' ')
    .map((m) => m[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const typeLibelle = employe.typeCode
    ? t(`employeeTypes.${employe.typeCode}`)
    : t(`pin.roles.${employe.role}`);
  const version = Constants.expoConfig?.version ?? '1.0.0';
  return (
    <SafeAreaView className="flex-1 bg-fond" edges={['top']}>
      <ScrollView contentContainerClassName="gap-5 px-5 pb-8 pt-4">
        <View className="flex-row items-center gap-4">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-accent">
            <Text className="font-sans-semibold text-[20px] text-accent-texte">{initiales}</Text>
          </View>
          <View className="gap-1">
            <Text className="font-display text-[22px] text-texte">{employe.fullName}</Text>
            <Text className="font-sans text-[14px] text-texte-secondaire">
              {typeLibelle} · {appareil.stationName}
            </Text>
          </View>
        </View>

        <View className="gap-2">
          <Text className="font-sans-semibold text-[15px] text-texte">{t('meTab.modules')}</Text>
          <View className="flex-row flex-wrap gap-2">
            {employe.modules.map((m) => (
              <View key={m} className="rounded-full border border-bordure bg-surface px-3 py-1.5">
                <Text className="font-sans text-[13px] text-texte">{t(`modules.short.${m}`)}</Text>
              </View>
            ))}
          </View>
          <Text className="font-sans text-[12px] text-texte-secondaire">
            {t('meTab.modulesHint')}
          </Text>
        </View>

        <View className="flex-row items-center justify-between rounded-xl border border-bordure bg-surface px-4 py-3">
          <View className="gap-0.5">
            <Text className="font-sans-semibold text-[15px] text-texte">{t('meTab.photos')}</Text>
            <Text className="font-sans text-[13px] text-texte-secondaire">
              {t('meTab.photosCount', { count: photos })}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => void traiterFile()}
            className="h-11 items-center justify-center rounded-lg border border-bordure-forte px-4"
          >
            <Text className="font-sans-semibold text-[14px] text-texte">{t('meTab.resend')}</Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => void deconnecterEmploye('logout')}
          className="h-14 items-center justify-center rounded-xl bg-accent"
        >
          <Text className="font-sans-semibold text-[16px] text-accent-texte">
            {t('meTab.changeEmployee')}
          </Text>
        </Pressable>

        <View className="rounded-xl border border-bordure bg-surface">
          <View className="flex-row items-center justify-between px-4 py-3">
            <Text className="font-sans text-[15px] text-texte">{t('meTab.language')}</Text>
            <Text className="font-sans text-[14px] text-texte-secondaire">
              {i18n.language === 'en' ? 'English' : 'Français'}
            </Text>
          </View>
          <View className="gap-1 border-t border-bordure px-4 py-3">
            <Text className="font-sans text-[15px] text-texte">{t('meTab.help')}</Text>
            <Text className="font-sans text-[13px] text-texte-secondaire">
              {t('meTab.helpText')}
            </Text>
          </View>
        </View>
        <Text className="text-center font-sans text-[12px] text-texte-secondaire">
          {t('meTab.device', { name: appareilNom || APP_NAME, version })}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
