import { APP_NAME } from '@stationsure/core';
import { useTranslation } from '@stationsure/i18n/react';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LogoPompe } from '@/components/logo-pompe';
import {
  chargerShiftCourant,
  chargerStatutConfiguration,
  type Shift,
  type StatutConfiguration,
} from '@/lib/carburant';
import { INACTIVITE_MINUTES } from '@/lib/env';
import { abonnerFile, nombreEnAttente, traiterFile } from '@/lib/preuves';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const ROLE_CLE: Record<string, string> = {
  manager: 'manager',
  pump_attendant: 'pumpAttendant',
  shop_cashier: 'shop',
  mechanic: 'mechanic',
  washer: 'washer',
};

interface PassationEnCours {
  id: string;
  status: string;
  incoming_employee_id: string;
  outgoing_employee_id: string;
  signed_out_at: string | null;
  from_shift_id: string;
}

/** Accueil : état du shift, actions carburant, photos en attente. */
export default function EcranAccueil() {
  const { t, i18n } = useTranslation();
  const { session, deconnecterEmploye } = useSession();
  const router = useRouter();
  const [shift, setShift] = useState<Shift | null | undefined>(undefined);
  const [passation, setPassation] = useState<PassationEnCours | null>(null);
  const [nomOuvreur, setNomOuvreur] = useState('');
  const [enAttente, setEnAttente] = useState(nombreEnAttente());
  const [erreur, setErreur] = useState<string | null>(null);
  const [configuration, setConfiguration] = useState<StatutConfiguration | null>(null);

  const charger = useCallback(async () => {
    setConfiguration(await chargerStatutConfiguration());
    const s = await chargerShiftCourant();
    setShift(s);
    if (s) {
      const { data: e } = await supabase
        .from('employees')
        .select('full_name')
        .eq('id', s.opened_by)
        .maybeSingle();
      setNomOuvreur(e?.full_name ?? '');
    }
    const { data: h } = await supabase
      .from('shift_handovers')
      .select(
        'id, status, incoming_employee_id, outgoing_employee_id, signed_out_at, from_shift_id',
      )
      .in('status', ['pending', 'disputed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setPassation(h ?? null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void charger();
      void traiterFile();
    }, [charger]),
  );
  useEffect(() => abonnerFile(() => setEnAttente(nombreEnAttente())), []);

  if (session.etat !== 'connecte') return null;
  const { employe, appareil } = session;
  const estGerant = employe.role === 'manager';
  const heure = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(
      new Date(iso),
    );

  const ouvrirShift = async () => {
    setErreur(null);
    const statut = await chargerStatutConfiguration();
    if (statut && !statut.complete) {
      setConfiguration(statut);
      setErreur(t('shift.setupIncomplete'));
      return;
    }
    const { data, error } = await supabase
      .from('shifts')
      .insert({
        organization_id: appareil.organizationId,
        station_id: appareil.stationId,
        device_id: appareil.deviceId,
        opened_by: employe.employeeId,
        opened_at: new Date().toISOString(),
        device_created_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error || !data) {
      setErreur(t('common.error'));
      return;
    }
    router.push({ pathname: '/releves', params: { kind: 'open', shift: data.id } });
  };

  const monPassation =
    passation &&
    (passation.incoming_employee_id === employe.employeeId ||
      passation.outgoing_employee_id === employe.employeeId);
  const libelleShift =
    shift === undefined
      ? t('common.loading')
      : shift === null
        ? t('shift.none')
        : shift.status === 'opening'
          ? t('shift.opening')
          : shift.status === 'open'
            ? t('shift.open')
            : t('shift.closing');

  return (
    <SafeAreaView className="flex-1 bg-fond">
      <ScrollView contentContainerClassName="gap-5 px-5 pb-6 pt-7">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <LogoPompe />
            <Text className="font-display text-[15px] text-texte">{APP_NAME}</Text>
          </View>
          <Text className="font-sans text-[13px] text-texte-secondaire">
            {appareil.stationName}
          </Text>
        </View>

        <View className="gap-1">
          <Text className="font-display text-[24px] text-texte" accessibilityRole="header">
            {t('home.title', { name: employe.fullName })}
          </Text>
          <Text className="font-sans text-[14px] text-texte-secondaire">
            {t('home.subtitle', { role: t(`pin.roles.${ROLE_CLE[employe.role] ?? employe.role}`) })}
          </Text>
        </View>

        {enAttente > 0 && (
          <Pressable
            onPress={() => void traiterFile()}
            className="flex-row items-center justify-between rounded-lg border border-accent bg-accent-fond px-4 py-3"
          >
            <Text className="font-sans text-[13px] text-accent">
              {t('photo.queue', { count: enAttente })}
            </Text>
            <Text className="font-sans-semibold text-[13px] text-accent">{t('photo.retry')}</Text>
          </Pressable>
        )}

        <View className="gap-2 rounded-lg border border-bordure bg-surface p-4">
          <Text className="font-sans-semibold text-[15px] text-texte">{libelleShift}</Text>
          {shift && (
            <Text className="font-sans text-[13px] text-texte-secondaire">
              {t('shift.openedBy', { name: nomOuvreur, time: heure(shift.opened_at) })}
            </Text>
          )}
          {erreur && <Text className="font-sans text-[13px] text-danger">{erreur}</Text>}
        </View>

        {monPassation && passation && (
          <Bouton
            principal
            libelle={t('shift.handover')}
            onPress={() =>
              router.push({
                pathname: '/passation',
                params: { handover: passation.id, shift: passation.from_shift_id },
              })
            }
          />
        )}
        {shift === null && configuration && !configuration.complete && (
          <View className="gap-1 rounded-md border border-accent bg-accent-fond px-3 py-3">
            <Text className="font-sans text-[14px] font-semibold text-accent">
              {t('shift.setupIncomplete')}
            </Text>
            {configuration.manques.map((m) => (
              <Text key={m} className="font-sans text-[13px] text-texte">
                · {m}
              </Text>
            ))}
          </View>
        )}
        {shift === null && (!configuration || configuration.complete) && (
          <Bouton principal libelle={t('shift.openShift')} onPress={() => void ouvrirShift()} />
        )}
        {shift?.status === 'opening' && (
          <Bouton
            principal
            libelle={t('shift.continueOpening')}
            onPress={() =>
              router.push({ pathname: '/releves', params: { kind: 'open', shift: shift.id } })
            }
          />
        )}
        {shift?.status === 'open' && !monPassation && (
          <>
            <Bouton
              libelle={t('shift.handover')}
              onPress={() => router.push({ pathname: '/passation', params: { shift: shift.id } })}
            />
            <Bouton
              libelle={t('shift.closeShift')}
              onPress={() =>
                router.push({ pathname: '/releves', params: { kind: 'close', shift: shift.id } })
              }
            />
          </>
        )}
        <Bouton
          libelle={
            estGerant ? t('shift.delivery') : `${t('shift.delivery')} · ${t('shift.managerOnly')}`
          }
          desactive={!estGerant}
          onPress={() => router.push('/livraison')}
        />

        <Text className="font-sans text-[12px] text-texte-secondaire">
          {t('home.inactivityHint', { minutes: INACTIVITE_MINUTES })}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void deconnecterEmploye('logout')}
          className="mt-2 h-14 items-center justify-center rounded-lg border border-bordure-forte bg-surface"
        >
          <Text className="font-sans-semibold text-[15px] text-texte">
            {t('home.changeEmployee')}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Bouton({
  libelle,
  onPress,
  principal,
  desactive,
}: {
  libelle: string;
  onPress: () => void;
  principal?: boolean;
  desactive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={desactive}
      className={`h-14 items-center justify-center rounded-lg ${principal ? 'bg-accent' : 'border border-bordure-forte bg-surface'} ${desactive ? 'opacity-50' : ''}`}
    >
      <Text
        className={`font-sans-semibold text-[16px] ${principal ? 'text-accent-texte' : 'text-texte'}`}
      >
        {libelle}
      </Text>
    </Pressable>
  );
}
