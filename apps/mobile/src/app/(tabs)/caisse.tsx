import { aModule, formatFCFA } from '@stationsure/core';
import { useTranslation } from '@stationsure/i18n/react';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BoutonAction } from '@/components/bouton-action';
import { chargerTaches, rpc, type TachesShift } from '@/lib/carburant';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

interface PaiementMobile {
  id: string;
  method: string;
  external_ref: string | null;
  amount_fcfa: number;
  statut: string;
}

/** Écran 23 : actions de caisse selon les modules ; l'attendu n'apparaît qu'après le billetage. */
export default function OngletCaisse() {
  const { t } = useTranslation();
  const { session } = useSession();
  const router = useRouter();
  const [taches, setTaches] = useState<TachesShift | null>(null);
  const [paiements, setPaiements] = useState<PaiementMobile[]>([]);

  const charger = useCallback(async () => {
    const tc = await chargerTaches();
    setTaches(tc);
    if (!tc?.shift) {
      setPaiements([]);
      return;
    }
    const { data } = await supabase
      .from('payments')
      .select('id, method, external_ref, amount_fcfa, transactions!inner(shift_id)')
      .in('method', ['wave', 'orange_money'])
      .eq('transactions.shift_id', tc.shift.id)
      .order('device_created_at', { ascending: false })
      .limit(10);
    const liste = await Promise.all(
      (data ?? []).map(async (p) => {
        const r = await rpc<string>('payment_match_status', { p_payment_id: p.id });
        return {
          id: p.id,
          method: p.method,
          external_ref: p.external_ref,
          amount_fcfa: p.amount_fcfa,
          statut: String(r.data ?? 'pending'),
        };
      }),
    );
    setPaiements(liste);
  }, []);
  useFocusEffect(
    useCallback(() => {
      void charger();
    }, [charger]),
  );

  if (session.etat !== 'connecte') return null;
  const { employe } = session;
  const modules = employe.modules;
  const shift = taches?.shift ?? null;
  const bordereau = taches?.tasks.find((x) => x.key === 'deposit_previous');
  const caisse = taches?.tasks.find((x) => x.key === 'cash_close');
  const typeLibelle = employe.typeCode
    ? t(`employeeTypes.${employe.typeCode}`)
    : t(`pin.roles.${employe.role}`);
  const raisonShift = !shift || shift.status !== 'open' ? t('cashTab.needShift') : null;
  const statutLibelle = (s: string) =>
    s === 'matched'
      ? t('cashTab.matched')
      : s === 'unmatched'
        ? t('cashTab.unmatched')
        : t('cashTab.pending');

  return (
    <SafeAreaView className="flex-1 bg-fond" edges={['top']}>
      <ScrollView contentContainerClassName="gap-5 px-5 pb-8 pt-4">
        <View className="gap-1">
          <Text className="font-display text-[24px] text-texte" accessibilityRole="header">
            {t('cashTab.title')}
          </Text>
          <Text className="font-sans text-[14px] text-texte-secondaire">
            {shift
              ? t('cashTab.shiftLine', {
                  label: shift.label ?? 'shift',
                  name: employe.fullName,
                  type: typeLibelle,
                })
              : t('shift.none')}
          </Text>
        </View>
        <BoutonAction
          principal
          libelle={t('cashTab.sell')}
          raison={!aModule(modules, 'sell') ? t('modules.notGranted') : raisonShift}
          onPress={() => router.push('/encaisser')}
        />
        <View className="gap-2">
          <BoutonAction
            libelle={t('cashTab.creditSale')}
            detail={t('cashTab.creditHint')}
            raison={!aModule(modules, 'credit_sale') ? t('modules.notGranted') : raisonShift}
            onPress={() => router.push('/vente-credit')}
          />
          <BoutonAction
            libelle={t('cashTab.void')}
            detail={t('cashTab.voidHint')}
            raison={!aModule(modules, 'void_request') ? t('modules.notGranted') : raisonShift}
            onPress={() => router.push('/annulation')}
          />
          <BoutonAction
            libelle={t('cashTab.deposit')}
            detail={
              bordereau && !bordereau.complete
                ? t('cashTab.depositTodo', { count: 1 })
                : t('cashTab.depositNone')
            }
            raison={!aModule(modules, 'bank_deposit') ? t('modules.notGranted') : null}
            onPress={() => router.push('/versement')}
          />
          <BoutonAction
            libelle={t('cashTab.close')}
            detail={
              caisse?.complete
                ? t('cashTab.closeDone')
                : shift?.status === 'closing'
                  ? t('homeTab.taskState.todo')
                  : t('cashTab.closeAfter')
            }
            raison={
              !aModule(modules, 'cash_close')
                ? t('modules.notGranted')
                : caisse?.complete
                  ? t('cashTab.closeDone')
                  : shift?.status !== 'closing'
                    ? t('cashTab.closeAfter')
                    : null
            }
            onPress={() => router.push('/cloture')}
          />
        </View>
        <View className="gap-2">
          <Text className="font-sans-semibold text-[15px] text-texte">{t('cashTab.mobile')}</Text>
          <View className="rounded-xl border border-bordure bg-surface">
            {paiements.length === 0 && (
              <Text className="px-4 py-3 font-sans text-[13px] text-texte-secondaire">
                {t('cashTab.mobileEmpty')}
              </Text>
            )}
            {paiements.map((p, i) => (
              <View
                key={p.id}
                className={`flex-row items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-bordure' : ''}`}
              >
                <Text className="font-sans text-[14px] text-texte">
                  {t(`homeTab.methods.${p.method}`)} · {p.external_ref ?? ''}
                </Text>
                <View className="items-end">
                  <Text className="font-mono text-[15px] text-texte">
                    {formatFCFA(p.amount_fcfa)}
                  </Text>
                  <Text
                    className={`font-sans text-[12px] ${p.statut === 'matched' ? 'text-succes' : 'text-accent'}`}
                  >
                    {statutLibelle(p.statut)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
          <Text className="font-sans text-[12px] text-texte-secondaire">
            {t('cashTab.expectedHint')}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
