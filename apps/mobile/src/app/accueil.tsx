import { APP_NAME } from '@stationsure/core';
import { useTranslation } from '@stationsure/i18n/react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LogoPompe } from '@/components/logo-pompe';
import { INACTIVITE_MINUTES } from '@/lib/env';
import { useSession } from '@/lib/session';

const ROLE_CLE: Record<string, string> = {
  manager: 'manager',
  pump_attendant: 'pumpAttendant',
  shop_cashier: 'shop',
  mechanic: 'mechanic',
  washer: 'washer',
};

/** Accueil provisoire (phase 2) : qui est connecté, où, et bouton pour changer d'employé. */
export default function EcranAccueil() {
  const { t, i18n } = useTranslation();
  const { session, deconnecterEmploye } = useSession();
  if (session.etat !== 'connecte') return null;

  const { employe, appareil } = session;
  const heure = new Intl.DateTimeFormat(i18n.language, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(employe.expiresAt));

  return (
    <SafeAreaView className="flex-1 bg-fond">
      <View className="flex-1 gap-6 px-5 pb-6 pt-7">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <LogoPompe />
            <Text className="font-display text-[15px] text-texte">{APP_NAME}</Text>
          </View>
          <Text className="font-sans text-[13px] text-texte-secondaire">
            {appareil.stationName}
          </Text>
        </View>

        <View className="gap-[6px]">
          <Text className="font-display text-[26px] text-texte" accessibilityRole="header">
            {t('home.title', { name: employe.fullName })}
          </Text>
          <Text className="font-sans text-[14px] text-texte-secondaire">
            {t('home.subtitle', { role: t(`pin.roles.${ROLE_CLE[employe.role] ?? employe.role}`) })}
          </Text>
        </View>

        <View className="gap-2 rounded-lg border border-bordure bg-surface p-4">
          <Ligne libelle={t('home.station')} valeur={appareil.stationName} />
          <Text className="font-sans text-[13px] text-texte-secondaire">
            {t('home.sessionUntil', { time: heure })}
          </Text>
          <Text className="font-sans text-[12px] text-texte-secondaire">
            {t('home.inactivityHint', { minutes: INACTIVITE_MINUTES })}
          </Text>
        </View>

        <Text className="font-sans text-[13px] text-texte-secondaire">{t('home.nextPhase')}</Text>

        <Pressable
          accessibilityRole="button"
          onPress={() => void deconnecterEmploye('logout')}
          className="mt-auto h-14 items-center justify-center rounded-lg border border-bordure-forte bg-surface"
        >
          <Text className="font-sans-semibold text-[15px] text-texte">
            {t('home.changeEmployee')}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Ligne({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <View className="flex-row justify-between">
      <Text className="font-sans text-[13px] text-texte-secondaire">{libelle}</Text>
      <Text className="font-sans-semibold text-[14px] text-texte">{valeur}</Text>
    </View>
  );
}
