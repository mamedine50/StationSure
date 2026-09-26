import { COUPURES_FCFA, type Coupure, formatFCFA, totalBilletage } from '@stationsure/core';
import { useTranslation } from '@stationsure/i18n/react';
import { couleurs } from '@stationsure/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CapturePhoto, CartePhoto, type PhotoPrise } from '@/components/capture-photo';
import { EnTeteEcran } from '@/components/liste-etapes';
import { rpc } from '@/lib/carburant';
import { contexteOperation } from '@/lib/contexte-operation';
import { creerPreuve } from '@/lib/preuves';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

interface Resume {
  ok: boolean;
  missing: { label: string; reason: string }[];
  expected: Record<string, number>;
  collected: Record<string, number>;
  counted_cash_fcfa: number | null;
  variance_fcfa: number | null;
}

/**
 * Écrans 14 et 04 — Clôture : billetage à l'aveugle (l'attendu n'est jamais reçu avant validation),
 * puis résultat serveur (attendu / encaissé / écart), justification, preuves, clôture.
 */
export default function EcranCloture() {
  const { t } = useTranslation();
  const { session } = useSession();
  const router = useRouter();
  const params = useLocalSearchParams<{ shift: string }>();
  const ctx = contexteOperation(session);
  const [etape, setEtape] = useState<'chargement' | 'billetage' | 'resultat' | 'fini'>(
    'chargement',
  );
  const [quantites, setQuantites] = useState<Record<Coupure, number>>(
    Object.fromEntries(COUPURES_FCFA.map((c) => [c, 0])) as Record<Coupure, number>,
  );
  const [resume, setResume] = useState<Resume | null>(null);
  const [preuves, setPreuves] = useState<{
    nozzles: number;
    tanks: number;
    total: number;
    complete: boolean;
  } | null>(null);
  const [justification, setJustification] = useState('');
  const [modeVersement, setModeVersement] = useState<'slip' | 'later'>('later');
  const [photoBordereau, setPhotoBordereau] = useState<PhotoPrise | null>(null);
  const [camera, setCamera] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const chargerResume = useCallback(async () => {
    const res = await rpc<Resume>('shift_cash_summary', { p_shift_id: params.shift });
    if (res.error === 'CASH_COUNT_REQUIRED') return setEtape('billetage');
    if (!res.ok && res.error) return setErreur(t('common.error'));
    setResume(res as unknown as Resume);
    const miss = await rpc('shift_missing_items', { p_shift_id: params.shift, p_kind: 'close' });
    const m = (miss.data ?? miss) as unknown as {
      nozzles: unknown[];
      tanks: unknown[];
      complete: boolean;
    };
    const [{ count: nz }, { count: tk }] = await Promise.all([
      supabase.from('nozzles').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('tanks').select('id', { count: 'exact', head: true }).eq('active', true),
    ]);
    setPreuves({
      nozzles: (nz ?? 0) - (m.nozzles?.length ?? 0),
      tanks: (tk ?? 0) - (m.tanks?.length ?? 0),
      total: (nz ?? 0) + (tk ?? 0),
      complete: m.complete,
    });
    setEtape('resultat');
  }, [params.shift, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void chargerResume();
  }, [chargerResume]);

  if (!ctx) return null;
  const total = totalBilletage(quantites);

  const validerComptage = async () => {
    setErreur(null);
    setOccupe(true);
    const { error } = await supabase.from('cash_counts').insert({
      organization_id: ctx.organizationId,
      station_id: ctx.stationId,
      device_id: ctx.deviceId,
      employee_id: ctx.employeeId,
      shift_id: params.shift ?? '',
      denominations: Object.fromEntries(Object.entries(quantites).filter(([, n]) => n > 0)),
      device_created_at: new Date().toISOString(),
    });
    setOccupe(false);
    if (error)
      return setErreur(
        error.message.startsWith('SHIFT_NOT_CLOSING')
          ? t('closing.fuelNotClosed')
          : error.message.startsWith('CASH_COUNT_FROZEN')
            ? t('closing.frozenHint')
            : t('common.error'),
      );
    await chargerResume();
  };

  const cloturer = async () => {
    if (!resume) return;
    setErreur(null);
    if (resume.variance_fcfa !== 0 && justification.trim().length < 3)
      return setErreur(t('closing.justificationRequired'));
    setOccupe(true);
    try {
      if (modeVersement === 'slip' && photoBordereau) {
        await creerPreuve(
          {
            kind: 'bank_slip',
            uri: photoBordereau.uri,
            capturedAt: photoBordereau.capturedAt,
            gps: photoBordereau.gps,
          },
          ctx,
        );
      }
      const res = await rpc('close_shift_cash', {
        p_shift_id: params.shift,
        p_justification: justification.trim() || null,
        p_deposit_mode: modeVersement === 'slip' && photoBordereau ? 'slip' : 'later',
      });
      if (!res.ok) {
        const m = res.missing as { label: string }[] | undefined;
        setErreur(
          res.error === 'PRICE_CHANGE_READING_MISSING'
            ? t('closing.priceMissing', { list: (m ?? []).map((x) => x.label).join(', ') })
            : res.error === 'EVIDENCE_MISSING'
              ? t('closing.footer')
              : res.error === 'JUSTIFICATION_REQUIRED'
                ? t('closing.justificationRequired')
                : res.error === 'CASH_COUNT_REQUIRED'
                  ? t('closing.needCount')
                  : t('common.error'),
        );
        return;
      }
      setEtape('fini');
      setTimeout(() => router.replace('/accueil'), 2000);
    } finally {
      setOccupe(false);
    }
  };

  const changer = (c: Coupure, delta: number) =>
    setQuantites((q) => ({ ...q, [c]: Math.max(0, (q[c] ?? 0) + delta) }));
  return (
    <SafeAreaView className="flex-1 bg-fond">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="gap-4 px-5 pb-6 pt-4"
          keyboardShouldPersistTaps="handled"
        >
          {etape === 'chargement' && <ActivityIndicator color={couleurs.accent} />}

          {etape === 'billetage' && (
            <>
              <EnTeteEcran
                titre={t('closing.countTitle')}
                sousTitre={t('closing.countSubtitle', { name: ctx.employeeName })}
                onRetour={() => router.back()}
              />
              <Text className="font-sans text-[13px] text-texte-secondaire">
                {t('closing.blindHint')}
              </Text>
              {(['notes', 'coins'] as const).map((groupe) => (
                <View key={groupe} className="gap-2">
                  <Text className="font-sans text-[11px] tracking-widest text-texte-secondaire">
                    {t(`closing.${groupe}`)}
                  </Text>
                  {COUPURES_FCFA.filter((c) => (groupe === 'notes' ? c >= 500 : c < 500)).map(
                    (c) => (
                      <View
                        key={c}
                        className="flex-row items-center gap-2 rounded-lg border border-bordure bg-surface px-3 py-2"
                      >
                        <Text className="w-16 font-mono text-[15px] text-texte">
                          {formatFCFA(c)}
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => changer(c, -1)}
                          className="h-12 w-12 items-center justify-center rounded-md border border-bordure-forte"
                        >
                          <Text className="font-mono text-[20px] text-texte">−</Text>
                        </Pressable>
                        <TextInput
                          value={String(quantites[c] ?? 0)}
                          onChangeText={(v) =>
                            setQuantites((q) => ({
                              ...q,
                              [c]: Math.max(0, Number(v.replace(/\D/g, '')) || 0),
                            }))
                          }
                          keyboardType="number-pad"
                          className="h-12 w-16 rounded-md border border-bordure bg-fond text-center font-mono-semibold text-[18px] text-texte"
                        />
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => changer(c, 1)}
                          className="h-12 w-12 items-center justify-center rounded-md border border-bordure-forte"
                        >
                          <Text className="font-mono text-[20px] text-texte">+</Text>
                        </Pressable>
                        <Text className="flex-1 text-right font-mono text-[14px] text-texte-secondaire">
                          {formatFCFA(c * (quantites[c] ?? 0))}
                        </Text>
                      </View>
                    ),
                  )}
                </View>
              ))}
              <View className="flex-row items-baseline justify-between rounded-xl border border-bordure bg-surface p-4">
                <Text className="font-sans-semibold text-[15px] text-texte">
                  {t('closing.totalCounted')}
                </Text>
                <Text className="font-mono-semibold text-[30px] text-texte">
                  {formatFCFA(total)}{' '}
                  <Text className="font-sans text-[13px] text-texte-secondaire">FCFA</Text>
                </Text>
              </View>
              {erreur && <Text className="font-sans text-[13px] text-danger">{erreur}</Text>}
              <Pressable
                accessibilityRole="button"
                disabled={occupe}
                onPress={() => void validerComptage()}
                className="h-14 items-center justify-center rounded-lg bg-accent"
              >
                {occupe ? (
                  <ActivityIndicator color={couleurs.accentTexte} />
                ) : (
                  <Text className="font-sans-semibold text-[17px] text-accent-texte">
                    {t('closing.validateCount')}
                  </Text>
                )}
              </Pressable>
              <Text className="text-center font-sans text-[12px] text-texte-secondaire">
                {t('closing.frozenHint')}
              </Text>
            </>
          )}

          {etape === 'resultat' && resume && (
            <>
              <EnTeteEcran
                titre={t('closing.title')}
                sousTitre={`${ctx.employeeName}`}
                onRetour={() => router.back()}
              />
              <View className="gap-1 rounded-xl border border-bordure bg-surface p-4">
                <Text className="font-sans text-[13px] text-texte-secondaire">
                  {t('closing.expected')}
                </Text>
                <Text className="font-mono-semibold text-[30px] text-texte">
                  {formatFCFA(resume.expected.total_fcfa ?? 0)}{' '}
                  <Text className="font-sans text-[13px] text-texte-secondaire">FCFA</Text>
                </Text>
                <Text className="font-sans text-[12px] text-texte-secondaire">
                  {t('closing.breakdown', {
                    fuel: formatFCFA(resume.expected.fuel_fcfa ?? 0),
                    shop: formatFCFA(resume.expected.shop_fcfa ?? 0),
                    wash: formatFCFA(resume.expected.wash_fcfa ?? 0),
                  })}
                </Text>
              </View>
              <View className="rounded-xl border border-bordure bg-surface px-4 py-2">
                <Ligne
                  l={t('closing.countedCash')}
                  v={formatFCFA(resume.counted_cash_fcfa ?? 0)}
                  fort
                />
                <Ligne
                  l={t('closing.wave')}
                  v={formatFCFA(resume.collected.wave_fcfa ?? 0)}
                  sub={`· ${t('closing.pending')}`}
                />
                <Ligne
                  l={t('closing.om')}
                  v={formatFCFA(resume.collected.orange_money_fcfa ?? 0)}
                  sub={`· ${t('closing.pending')}`}
                />
                <Ligne l={t('closing.card')} v={formatFCFA(resume.collected.card_fcfa ?? 0)} />
                <Ligne l={t('closing.credit')} v={formatFCFA(resume.collected.credit_fcfa ?? 0)} />
                <View className="my-1 h-px bg-bordure" />
                <Ligne
                  l={t('closing.totalCollected')}
                  v={formatFCFA(resume.collected.total_fcfa ?? 0)}
                  fort
                />
              </View>
              <View
                className={`gap-2 rounded-xl border p-4 ${resume.variance_fcfa ? 'border-danger-bordure bg-danger-fond' : 'border-bordure bg-surface'}`}
              >
                <Ligne
                  l={t('closing.variance')}
                  v={formatFCFA(resume.variance_fcfa ?? 0)}
                  sub={resume.variance_fcfa ? t('closing.justificationRequired') : undefined}
                  rouge={!!resume.variance_fcfa}
                  fort
                />
                {resume.variance_fcfa ? (
                  <TextInput
                    value={justification}
                    onChangeText={setJustification}
                    placeholder={t('closing.justification')}
                    placeholderTextColor={couleurs.bordureForte}
                    multiline
                    className="min-h-[56px] rounded-lg border border-danger-bordure bg-fond px-3 py-2 font-sans text-[14px] text-texte"
                  />
                ) : null}
              </View>
              <View className="gap-2 rounded-xl border border-bordure bg-surface p-4">
                <Text className="font-sans-semibold text-[14px] text-texte">
                  {t('closing.proofs')}
                </Text>
                <Ligne
                  l={t('closing.closeReadings')}
                  v={
                    preuves
                      ? `${preuves.nozzles}/${preuves.total - preuves.tanks - (preuves.total - preuves.nozzles - preuves.tanks)}`
                      : ''
                  }
                />
                <Ligne l={t('closing.closeGauges')} v={preuves ? `${preuves.tanks}` : ''} />
                <View className="flex-row items-center justify-between py-1">
                  <Text className="font-sans text-[14px] text-texte-secondaire">
                    {t('closing.slip')}
                  </Text>
                  <View className="flex-row gap-2">
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setModeVersement('slip');
                        setCamera(true);
                      }}
                      className={`h-11 justify-center rounded-md border px-3 ${modeVersement === 'slip' ? 'border-accent bg-accent-fond' : 'border-bordure-forte'}`}
                    >
                      <Text className="font-sans-semibold text-[13px] text-texte">
                        {t('closing.slipNow')}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setModeVersement('later');
                        setPhotoBordereau(null);
                      }}
                      className={`h-11 justify-center rounded-md border px-3 ${modeVersement === 'later' ? 'border-accent bg-accent-fond' : 'border-bordure-forte'}`}
                    >
                      <Text className="font-sans-semibold text-[13px] text-texte">
                        {t('closing.slipLater')}
                      </Text>
                    </Pressable>
                  </View>
                </View>
                {modeVersement === 'slip' && (
                  <CartePhoto
                    photo={photoBordereau}
                    titre={t('closing.slip')}
                    onReprendre={() => setCamera(true)}
                    station={ctx.stationName}
                  />
                )}
              </View>
              {erreur && <Text className="font-sans text-[13px] text-danger">{erreur}</Text>}
              <Pressable
                accessibilityRole="button"
                disabled={occupe || (modeVersement === 'slip' && !photoBordereau)}
                onPress={() => void cloturer()}
                className="h-14 items-center justify-center rounded-lg bg-accent"
              >
                {occupe ? (
                  <ActivityIndicator color={couleurs.accentTexte} />
                ) : (
                  <Text className="font-sans-semibold text-[17px] text-accent-texte">
                    {t('closing.close')}
                  </Text>
                )}
              </Pressable>
              <Text className="text-center font-sans text-[12px] text-texte-secondaire">
                {t('closing.footer')}
              </Text>
            </>
          )}

          {etape === 'fini' && (
            <Text className="font-sans-semibold text-[16px] text-succes">
              {t('closing.closed')}
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <CapturePhoto
        visible={camera}
        onPhoto={(p) => {
          setPhotoBordereau(p);
          setCamera(false);
        }}
        onAnnuler={() => setCamera(false)}
      />
    </SafeAreaView>
  );
}

function Ligne({
  l,
  v,
  sub,
  rouge,
  fort,
}: {
  l: string;
  v: string;
  sub?: string | undefined;
  rouge?: boolean;
  fort?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between py-1">
      <View>
        <Text
          className={`font-sans text-[14px] ${fort ? 'font-sans-semibold text-texte' : 'text-texte-secondaire'}`}
        >
          {l}
        </Text>
        {sub ? <Text className="font-sans text-[11px] text-texte-secondaire">{sub}</Text> : null}
      </View>
      <Text className={`font-mono-semibold text-[16px] ${rouge ? 'text-danger' : 'text-texte'}`}>
        {v}
      </Text>
    </View>
  );
}
