import { APP_NAME, formatFCFA, prochaineAction, type ProchaineAction } from '@stationsure/core';
import { useTranslation } from '@stationsure/i18n/react';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconeCoche } from '@/components/icone-coche';
import { LogoPompe } from '@/components/logo-pompe';
import {
  chargerOperationsRecentes,
  chargerStatutConfiguration,
  chargerTaches,
  creerShift,
  type OperationRecente,
  type StatutConfiguration,
  type TachesShift,
} from '@/lib/carburant';
import { nombreEnAttente, traiterFile } from '@/lib/preuves';
import { useEnLigne } from '@/lib/reseau';
import { useSession } from '@/lib/session';

/** Écran 21 : tableau de bord du shift. Jamais de montant attendu ni de total de caisse. */
export default function OngletAccueil() {
  const { t, i18n } = useTranslation();
  const { session } = useSession();
  const router = useRouter();
  const enLigne = useEnLigne();
  const [taches, setTaches] = useState<TachesShift | null | undefined>(undefined);
  const [operations, setOperations] = useState<OperationRecente[]>([]);
  const [configuration, setConfiguration] = useState<StatutConfiguration | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [photos, setPhotos] = useState(nombreEnAttente());

  const charger = useCallback(async () => {
    const [tc, ops, conf] = await Promise.all([
      chargerTaches(),
      chargerOperationsRecentes(5),
      chargerStatutConfiguration(),
    ]);
    setTaches(tc);
    setOperations(ops);
    setConfiguration(conf);
    setPhotos(nombreEnAttente());
  }, []);
  useFocusEffect(
    useCallback(() => {
      void charger();
      void traiterFile();
    }, [charger]),
  );

  if (session.etat !== 'connecte') return null;
  const { employe, appareil } = session;
  const modules = employe.modules;
  const heure = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(
      new Date(iso),
    );
  const shift = taches?.shift ?? null;
  const passation = taches?.tasks.find((x) => x.key === 'handover');
  const fermeture = taches?.tasks.find((x) => x.key === 'close_readings');
  const caisse = taches?.tasks.find((x) => x.key === 'cash_close');
  const action: ProchaineAction = taches
    ? prochaineAction(
        {
          statut: shift?.status ?? null,
          configurationComplete: taches.setup_complete,
          fermetureComplete: fermeture?.complete ?? false,
          passationAMoi: Boolean(passation?.mine),
          caisseCloturee: caisse?.complete ?? false,
        },
        modules,
      )
    : 'attendre';
  const typeLibelle = employe.typeCode
    ? t(`employeeTypes.${employe.typeCode}`)
    : t(`pin.roles.${employe.role}`);
  const sousTitre = !shift
    ? t('homeTab.noShift', { type: typeLibelle })
    : shift.status === 'opening'
      ? t('homeTab.shiftOpening', { type: typeLibelle })
      : shift.status === 'closing'
        ? t('homeTab.shiftClosing', { type: typeLibelle })
        : t('homeTab.shiftOpenSince', {
            type: typeLibelle,
            label: shift.label ?? 'shift',
            time: heure(shift.opened_at),
          });

  const executer = async () => {
    setErreur(null);
    switch (action) {
      case 'ouvrir_shift': {
        const r = await creerShift(appareil, employe.employeeId);
        if ('error' in r) {
          setErreur(r.error === 'MODULE_NOT_GRANTED' ? t('modules.notGranted') : t('common.error'));
          return;
        }
        router.push({ pathname: '/releves', params: { kind: 'open', shift: r.id } });
        return;
      }
      case 'continuer_ouverture':
        if (shift) router.push({ pathname: '/releves', params: { kind: 'open', shift: shift.id } });
        return;
      case 'passation':
        if (shift)
          router.push({
            pathname: '/passation',
            params: { handover: passation?.handover_id ?? '', shift: shift.id },
          });
        return;
      case 'encaisser':
        router.push('/encaisser');
        return;
      case 'fermer_shift':
        if (shift)
          router.push({ pathname: '/releves', params: { kind: 'close', shift: shift.id } });
        return;
      case 'cloturer_caisse':
        router.push('/cloture');
        return;
      default:
        return;
    }
  };
  const actionActive = !['configurer', 'attendre', 'aucune'].includes(action);

  const etatTache = (x: NonNullable<TachesShift>['tasks'][number]) => {
    if (x.key === 'deposit_previous')
      return x.complete ? t('homeTab.taskState.done') : t('homeTab.taskState.toPhotograph');
    if (x.key === 'cash_close')
      return x.complete
        ? t('homeTab.taskState.done')
        : x.available
          ? t('homeTab.taskState.todo')
          : t('homeTab.taskState.afterClose');
    if (x.key === 'handover')
      return x.complete ? t('homeTab.taskState.done') : t('homeTab.taskState.pending');
    if (x.total !== undefined) return `${x.done ?? 0}/${x.total}`;
    return x.complete ? t('homeTab.taskState.done') : t('homeTab.taskState.todo');
  };

  return (
    <SafeAreaView className="flex-1 bg-fond" edges={['top']}>
      <ScrollView contentContainerClassName="gap-5 px-5 pb-8 pt-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <LogoPompe />
            <Text className="font-display text-[15px] text-texte">{APP_NAME}</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <View
              className={`h-2.5 w-2.5 rounded-full ${enLigne === false ? 'bg-danger' : 'bg-succes'}`}
            />
            <Text className="font-sans text-[13px] text-texte-secondaire">
              {enLigne === false ? t('homeTab.offline') : t('homeTab.online')} ·{' '}
              {appareil.stationName}
            </Text>
          </View>
        </View>

        <View className="gap-1">
          <Text className="font-display text-[26px] text-texte" accessibilityRole="header">
            {t('home.title', { name: employe.fullName })}
          </Text>
          <Text className="font-sans text-[14px] text-texte-secondaire">{sousTitre}</Text>
        </View>

        <View className="gap-3 rounded-xl border border-accent bg-accent-fond px-4 py-4">
          <Text className="font-sans-semibold text-[12px] tracking-wider text-accent">
            {t('homeTab.nextAction')}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={!actionActive}
            onPress={() => void executer()}
            className={`h-16 items-center justify-center rounded-xl ${actionActive ? 'bg-accent' : 'bg-surface-2'}`}
          >
            <Text
              className={`font-sans-semibold text-[19px] ${actionActive ? 'text-accent-texte' : 'text-texte-secondaire'}`}
            >
              {t(`homeTab.actions.${action}`)}
            </Text>
          </Pressable>
          {action === 'configurer' && configuration && (
            <View className="gap-1">
              {configuration.manques.map((m) => (
                <Text key={m} className="font-sans text-[13px] text-texte">
                  · {m}
                </Text>
              ))}
            </View>
          )}
          {passation && !passation.complete && passation.incoming_name && (
            <Text className="font-sans text-[14px] text-texte">
              {t('homeTab.handoverPlanned', { name: passation.incoming_name })}
            </Text>
          )}
          {erreur && <Text className="font-sans text-[13px] text-danger">{erreur}</Text>}
        </View>

        <View className="gap-2">
          <Text className="font-sans-semibold text-[15px] text-texte">{t('homeTab.tasks')}</Text>
          <View className="rounded-xl border border-bordure bg-surface">
            {(taches?.tasks ?? []).map((x, i) => (
              <View
                key={x.key}
                className={`flex-row items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-bordure' : ''}`}
              >
                <View className="flex-row items-center gap-3">
                  {x.complete ? (
                    <View className="h-5 w-5 items-center justify-center rounded-full bg-succes-fond">
                      <IconeCoche />
                    </View>
                  ) : (
                    <View className="h-5 w-5 rounded-full border-2 border-accent" />
                  )}
                  <Text className="font-sans text-[15px] text-texte">
                    {t(`homeTab.task.${x.key}`)}
                  </Text>
                </View>
                <Text
                  className={`font-mono text-[14px] ${x.complete ? 'text-texte-secondaire' : 'text-accent'}`}
                >
                  {etatTache(x)}
                </Text>
              </View>
            ))}
            {photos > 0 && (
              <View className="flex-row items-center justify-between border-t border-bordure px-4 py-3">
                <Text className="font-sans text-[15px] text-texte">{t('meTab.photos')}</Text>
                <Text className="font-mono text-[14px] text-accent">{photos}</Text>
              </View>
            )}
            {(taches?.tasks ?? []).length === 0 && taches !== undefined && (
              <Text className="px-4 py-3 font-sans text-[13px] text-texte-secondaire">
                {t('shift.none')}
              </Text>
            )}
          </View>
        </View>

        <View className="gap-2">
          <Text className="font-sans-semibold text-[15px] text-texte">{t('homeTab.recent')}</Text>
          <View className="rounded-xl border border-bordure bg-surface">
            {operations.length === 0 && (
              <Text className="px-4 py-3 font-sans text-[13px] text-texte-secondaire">
                {t('homeTab.recentEmpty')}
              </Text>
            )}
            {operations.map((o, i) => (
              <View
                key={`${o.at}-${i}`}
                className={`flex-row items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-bordure' : ''}`}
              >
                <View className="flex-row items-center gap-3">
                  <Text className="font-mono text-[13px] text-texte-secondaire">{heure(o.at)}</Text>
                  <Text className="font-sans text-[15px] text-texte">
                    {o.method ? t(`homeTab.methods.${o.method}`) : o.kind} · {o.label}
                  </Text>
                </View>
                <Text className="font-mono text-[16px] text-texte">
                  {formatFCFA(o.amount_fcfa)}
                </Text>
              </View>
            ))}
          </View>
          <Text className="font-sans text-[12px] text-texte-secondaire">
            {t('homeTab.noTotals')}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
