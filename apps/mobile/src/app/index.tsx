import { APP_NAME } from '@stationsure/core';
import { useTranslation } from '@stationsure/i18n/react';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GrilleProfils, type Profil } from '@/components/grille-profils';
import { IconeCoche } from '@/components/icone-coche';
import { LogoPompe } from '@/components/logo-pompe';
import { PaveNumerique } from '@/components/pave-numerique';
import { PointsPin } from '@/components/points-pin';

const LONGUEUR_PIN = 4;

/**
 * Écran 01 — Connexion PIN, reproduit en statique (phase 0).
 * Les profils, la station et le shift viennent de la maquette : ils seront remplacés
 * par les employés et l'appareil enregistrés en base à la phase 2 (auth + PIN).
 * Aucune vérification de PIN n'est faite ici.
 */
const EXEMPLE_MAQUETTE = {
  station: 'Station Mbour',
  shift: 'Shift matin · 06:00',
  appareil: 'Tablette caisse 01',
  profils: [
    { id: 'ad', initiales: 'AD', nom: 'Awa Diop', roleCle: 'pumpAttendant' },
    { id: 'mn', initiales: 'MN', nom: 'Moussa Ndiaye', roleCle: 'pumpAttendant' },
    { id: 'is', initiales: 'IS', nom: 'Ibrahima Sarr', roleCle: 'manager' },
    { id: 'kf', initiales: 'KF', nom: 'Khady Fall', roleCle: 'shop' },
  ],
} as const;

export default function EcranConnexionPin() {
  const { t, i18n } = useTranslation();
  const [profilId, setProfilId] = useState<string | null>(EXEMPLE_MAQUETTE.profils[0].id);
  const [pin, setPin] = useState('');

  const profils: Profil[] = EXEMPLE_MAQUETTE.profils.map((p) => ({
    id: p.id,
    initiales: p.initiales,
    nom: p.nom,
    role: t(`pin.roles.${p.roleCle}`),
  }));

  const dateDuJour = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  }).format(new Date());

  return (
    <SafeAreaView className="flex-1 bg-fond">
      <View className="flex-1 gap-[22px] px-5 pb-6 pt-7">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <LogoPompe />
            <Text className="font-display text-[15px] text-texte">{APP_NAME}</Text>
          </View>
          <Text className="font-sans text-[13px] text-texte-secondaire">
            {EXEMPLE_MAQUETTE.station}
          </Text>
        </View>

        <View className="gap-[6px]">
          <Text className="font-display text-[26px] text-texte" accessibilityRole="header">
            {t('pin.title')}
          </Text>
          <Text className="font-sans text-[14px] capitalize text-texte-secondaire">
            {dateDuJour} · {EXEMPLE_MAQUETTE.shift}
          </Text>
        </View>

        <GrilleProfils profils={profils} selectionId={profilId} onSelection={setProfilId} />

        <View className="items-center gap-[14px]">
          <Text className="font-sans text-[14px] text-texte-secondaire">{t('pin.enterPin')}</Text>
          <PointsPin longueur={LONGUEUR_PIN} remplis={pin.length} />
        </View>

        <PaveNumerique
          libelleEffacer={t('pin.clear')}
          libelleEntrer={t('pin.enter')}
          onChiffre={(c) =>
            setPin((actuel) => (actuel.length < LONGUEUR_PIN ? actuel + c : actuel))
          }
          onEffacer={() => setPin('')}
          onEntrer={() => setPin('')}
        />

        <View className="mt-auto flex-row items-center justify-center gap-[6px]">
          <IconeCoche />
          <Text className="font-sans text-[12px] text-texte-secondaire">
            {t('pin.registeredDevice')} · {EXEMPLE_MAQUETTE.appareil}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
