import { APP_NAME } from '@stationsure/core';
import { useTranslation } from '@stationsure/i18n/react';
import { couleurs } from '@stationsure/ui';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GrilleProfils, type Profil } from '@/components/grille-profils';
import { IconeCoche } from '@/components/icone-coche';
import { LogoPompe } from '@/components/logo-pompe';
import { PaveNumerique } from '@/components/pave-numerique';
import { PointsPin } from '@/components/points-pin';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const LONGUEUR_PIN = 4;

const ROLE_CLE: Record<string, string> = {
  manager: 'manager',
  pump_attendant: 'pumpAttendant',
  shop_cashier: 'shop',
  mechanic: 'mechanic',
  washer: 'washer',
};

function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase() ?? '')
    .join('');
}

/** Écran 01 — Connexion PIN : vrais employés actifs de la station, vérification serveur. */
export default function EcranConnexionPin() {
  const { t, i18n } = useTranslation();
  const { session, verifierPin, rafraichir } = useSession();
  const [profils, setProfils] = useState<Profil[] | null>(null);
  const [profilId, setProfilId] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState<{ type: 'erreur' | 'blocage'; texte: string } | null>(
    null,
  );
  const [verification, setVerification] = useState(false);

  const stationName =
    session.etat === 'pin' || session.etat === 'connecte' ? session.appareil.stationName : '';

  const charger = useCallback(async () => {
    const { data, error } = await supabase
      .from('employees')
      .select('id, full_name, role')
      .eq('active', true)
      .order('full_name');
    if (error) {
      await rafraichir();
      return;
    }
    const liste = (data ?? []).map((e) => ({
      id: e.id,
      initiales: initiales(e.full_name),
      nom: e.full_name,
      role: t(`pin.roles.${ROLE_CLE[e.role] ?? e.role}`),
    }));
    setProfils(liste);
    setProfilId((actuel) => actuel ?? liste[0]?.id ?? null);
  }, [rafraichir, t]);

  useEffect(() => {
    // charger() ne met à jour l'état qu'après la réponse réseau (asynchrone), pas pendant l'effet.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void charger();
  }, [charger]);

  const soumettre = async (valeur: string) => {
    if (!profilId || valeur.length !== LONGUEUR_PIN) return;
    setVerification(true);
    const res = await verifierPin(profilId, valeur);
    setVerification(false);
    setPin('');
    if (res.ok) {
      setMessage(null);
      return;
    }
    if (res.erreur === 'PIN_LOCKED') {
      setMessage({
        type: 'blocage',
        texte: t('pin.locked', { minutes: Math.max(1, Math.ceil(res.secondesRestantes / 60)) }),
      });
    } else if (res.erreur === 'PIN_INVALID') {
      setMessage({ type: 'erreur', texte: t('pin.invalid') });
    } else if (res.erreur === 'DEVICE_NOT_PAIRED') {
      setMessage({ type: 'erreur', texte: t('pin.deviceRevoked') });
    } else {
      setMessage({ type: 'erreur', texte: t('common.error') });
    }
  };

  const surChiffre = (c: string) => {
    if (verification) return;
    setMessage(null);
    const suivant = pin.length < LONGUEUR_PIN ? pin + c : pin;
    setPin(suivant);
    if (suivant.length === LONGUEUR_PIN) void soumettre(suivant);
  };

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
          <Text className="font-sans text-[13px] text-texte-secondaire">{stationName}</Text>
        </View>

        <View className="gap-[6px]">
          <Text className="font-display text-[26px] text-texte" accessibilityRole="header">
            {t('pin.title')}
          </Text>
          <Text className="font-sans text-[14px] capitalize text-texte-secondaire">
            {dateDuJour}
          </Text>
        </View>

        {profils === null ? (
          <View className="min-h-[68px] items-center justify-center">
            <ActivityIndicator color={couleurs.accent} />
            <Text className="mt-2 font-sans text-[13px] text-texte-secondaire">
              {t('pin.loading')}
            </Text>
          </View>
        ) : profils.length === 0 ? (
          <View className="gap-3 rounded-lg border border-bordure bg-surface p-4">
            <Text className="font-sans text-[13px] text-texte-secondaire">
              {t('pin.noEmployees')}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void charger()}
              className="h-12 items-center justify-center rounded-lg border border-bordure-forte"
            >
              <Text className="font-sans-semibold text-[14px] text-texte">{t('pin.refresh')}</Text>
            </Pressable>
          </View>
        ) : (
          <GrilleProfils
            profils={profils}
            selectionId={profilId}
            onSelection={(id) => {
              setProfilId(id);
              setPin('');
              setMessage(null);
            }}
          />
        )}

        <View className="items-center gap-[14px]">
          <Text className="font-sans text-[14px] text-texte-secondaire">
            {verification ? t('pin.checking') : t('pin.enterPin')}
          </Text>
          <PointsPin longueur={LONGUEUR_PIN} remplis={pin.length} />
          {message && (
            <Text
              accessibilityLiveRegion="polite"
              className={`text-center font-sans-semibold text-[13px] ${message.type === 'blocage' ? 'text-accent' : 'text-danger'}`}
            >
              {message.texte}
            </Text>
          )}
        </View>

        <PaveNumerique
          libelleEffacer={t('pin.clear')}
          libelleEntrer={t('pin.enter')}
          onChiffre={surChiffre}
          onEffacer={() => {
            setPin('');
            setMessage(null);
          }}
          onEntrer={() => void soumettre(pin)}
        />

        <View className="mt-auto flex-row items-center justify-center gap-[6px]">
          <IconeCoche />
          <Text className="font-sans text-[12px] text-texte-secondaire">
            {t('pin.registeredDevice')} · {stationName}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
