import { aModule } from '@stationsure/core';
import { useTranslation } from '@stationsure/i18n/react';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BoutonAction } from '@/components/bouton-action';
import { chargerPistolets, chargerTaches, type Pistolet, type TachesShift } from '@/lib/carburant';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

/** Écran 22 : état des pistolets et actions carburant selon les modules et l'état du shift. */
export default function OngletCarburant() {
  const { t, i18n } = useTranslation();
  const { session } = useSession();
  const router = useRouter();
  const [taches, setTaches] = useState<TachesShift | null>(null);
  const [pistolets, setPistolets] = useState<Pistolet[]>([]);
  const [releves, setReleves] = useState<Record<string, string>>({});

  const charger = useCallback(async () => {
    const [tc, ps] = await Promise.all([chargerTaches(), chargerPistolets()]);
    setTaches(tc);
    setPistolets(ps);
    if (tc?.shift) {
      const { data } = await supabase
        .from('meter_readings')
        .select('nozzle_id, device_created_at')
        .eq('shift_id', tc.shift.id)
        .order('device_created_at', { ascending: false });
      const derniers: Record<string, string> = {};
      for (const r of data ?? [])
        if (!derniers[r.nozzle_id]) derniers[r.nozzle_id] = r.device_created_at;
      setReleves(derniers);
    } else {
      setReleves({});
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void charger();
    }, [charger]),
  );

  if (session.etat !== 'connecte') return null;
  const modules = session.employe.modules;
  const shift = taches?.shift ?? null;
  const heure = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(
      new Date(iso),
    );
  const gauging = taches?.tasks.find((x) => x.key === 'open_gauging');
  const passation = taches?.tasks.find((x) => x.key === 'handover');
  const setupOk = taches?.setup_complete ?? true;
  const raisonShift = !setupOk
    ? t('fuelTab.setupIncomplete')
    : !shift
      ? t('fuelTab.needShift')
      : null;

  return (
    <SafeAreaView className="flex-1 bg-fond" edges={['top']}>
      <ScrollView contentContainerClassName="gap-5 px-5 pb-8 pt-4">
        <View className="gap-1">
          <Text className="font-display text-[24px] text-texte" accessibilityRole="header">
            {t('fuelTab.title')}
          </Text>
          <Text className="font-sans text-[14px] text-texte-secondaire">
            {shift
              ? t('fuelTab.shiftLine', {
                  label: shift.label ?? 'shift',
                  time: heure(shift.opened_at),
                  name: shift.opened_by_name ?? '',
                })
              : t('shift.none')}
          </Text>
        </View>
        {!setupOk && (
          <View className="rounded-md border border-accent bg-accent-fond px-3 py-3">
            <Text className="font-sans-semibold text-[14px] text-accent">
              {t('shift.setupIncomplete')}
            </Text>
          </View>
        )}

        <View className="gap-2">
          <Text className="font-sans-semibold text-[15px] text-texte">{t('fuelTab.nozzles')}</Text>
          <View className="rounded-xl border border-bordure bg-surface">
            {pistolets.map((p, i) => (
              <View
                key={p.id}
                className={`flex-row items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-bordure' : ''}`}
              >
                <View className="flex-row items-center gap-3">
                  <Text className="font-mono text-[15px] text-texte">{p.label}</Text>
                  <Text className="font-sans text-[13px] text-texte-secondaire">
                    {t(`fuel.${p.produit}`)}
                  </Text>
                </View>
                <Text
                  className={`font-sans text-[13px] ${releves[p.id] ? 'text-succes' : 'text-texte-secondaire'}`}
                >
                  {releves[p.id]
                    ? t('fuelTab.reading', { time: heure(releves[p.id]!) })
                    : t('fuelTab.noReading')}
                </Text>
              </View>
            ))}
            {pistolets.length === 0 && (
              <Text className="px-4 py-3 font-sans text-[13px] text-texte-secondaire">
                {t('fuelSetup.stepState.todo')}
              </Text>
            )}
          </View>
        </View>

        <View className="gap-2">
          <Text className="font-sans-semibold text-[15px] text-texte">{t('fuelTab.actions')}</Text>
          <BoutonAction
            libelle={t('fuelTab.gauging')}
            detail={
              gauging?.complete
                ? t('fuelTab.gaugingDone', { time: shift ? heure(shift.opened_at) : '' })
                : t('fuelTab.gaugingTodo')
            }
            raison={!aModule(modules, 'gauging') ? t('modules.notGranted') : raisonShift}
            onPress={() =>
              shift &&
              router.push({ pathname: '/jaugeage', params: { shift: shift.id, kind: 'spot' } })
            }
          />
          <BoutonAction
            libelle={t('fuelTab.handover')}
            detail={
              passation && !passation.complete
                ? t('fuelTab.handoverPlanned', { name: passation.incoming_name ?? '' })
                : t('fuelTab.handoverHint')
            }
            raison={
              !aModule(modules, 'handover')
                ? t('modules.notGranted')
                : (raisonShift ?? (shift?.status !== 'open' ? t('fuelTab.needShift') : null))
            }
            onPress={() =>
              shift &&
              router.push({
                pathname: '/passation',
                params: { shift: shift.id, handover: passation?.handover_id ?? '' },
              })
            }
          />
          <BoutonAction
            libelle={t('fuelTab.delivery')}
            detail={t('fuelTab.deliveryHint')}
            raison={
              !aModule(modules, 'delivery')
                ? t('modules.notGranted')
                : !setupOk
                  ? t('fuelTab.setupIncomplete')
                  : null
            }
            onPress={() => router.push('/livraison')}
          />
          <BoutonAction
            libelle={t('fuelTab.closeShift')}
            detail={t('fuelTab.closeHint')}
            raison={
              !aModule(modules, 'shift')
                ? t('modules.notGranted')
                : (raisonShift ?? (shift?.status !== 'open' ? t('fuelTab.needShift') : null))
            }
            onPress={() =>
              shift &&
              router.push({ pathname: '/releves', params: { kind: 'close', shift: shift.id } })
            }
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
