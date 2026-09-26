import { formatFCFA } from '@stationsure/core';
import { useTranslation } from '@stationsure/i18n/react';
import { couleurs } from '@stationsure/ui';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CapturePhoto, CartePhoto, type PhotoPrise } from '@/components/capture-photo';
import { EnTeteEcran } from '@/components/liste-etapes';
import { rpc } from '@/lib/carburant';
import { contexteOperation } from '@/lib/contexte-operation';
import { creerPreuve } from '@/lib/preuves';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

interface ShiftAVerser {
  id: string;
  label: string | null;
  closed_at: string | null;
  counted: number;
}

/** Versement bancaire (gérant) : montant + photo du bordereau, lié à un ou plusieurs shifts clos. */
export default function EcranVersement() {
  const { t } = useTranslation();
  const { session } = useSession();
  const router = useRouter();
  const ctx = contexteOperation(session);
  const [shifts, setShifts] = useState<ShiftAVerser[]>([]);
  const [choisis, setChoisis] = useState<string[]>([]);
  const [montant, setMontant] = useState('');
  const [ref, setRef] = useState('');
  const [photo, setPhoto] = useState<PhotoPrise | null>(null);
  const [camera, setCamera] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    let annule = false;
    void Promise.all([
      supabase
        .from('shifts')
        .select('id, label, closed_at')
        .eq('status', 'closed')
        .order('closed_at', { ascending: false })
        .limit(20),
      supabase
        .from('cash_closings')
        .select('shift_id, counted_cash_fcfa, closed_at')
        .order('closed_at', { ascending: false }),
      supabase.from('bank_deposit_shifts').select('shift_id'),
    ]).then(([{ data: s }, { data: c }, { data: d }]) => {
      if (annule) return;
      const deja = new Set((d ?? []).map((x) => x.shift_id));
      setShifts(
        (s ?? [])
          .filter((x) => !deja.has(x.id))
          .map((x) => ({
            id: x.id,
            label: x.label,
            closed_at: x.closed_at,
            counted: c?.find((y) => y.shift_id === x.id)?.counted_cash_fcfa ?? 0,
          }))
          .filter((x) => c?.some((y) => y.shift_id === x.id)),
      );
    });
    return () => {
      annule = true;
    };
  }, []);

  if (!ctx) return null;
  if (ctx.role !== 'manager') {
    return (
      <SafeAreaView className="flex-1 bg-fond">
        <View className="gap-4 px-5 pt-4">
          <EnTeteEcran titre={t('deposit.title')} onRetour={() => router.back()} />
          <Text className="font-sans text-[14px] text-texte-secondaire">
            {t('deposit.managerOnly')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }
  const totalCompte = shifts
    .filter((s) => choisis.includes(s.id))
    .reduce((a, s) => a + s.counted, 0);

  const declarer = async () => {
    if (!photo) return setErreur(t('deposit.slipPhoto'));
    const m = Number(montant.replace(/\s/g, '')) || 0;
    if (m <= 0 || choisis.length === 0) return setErreur(t('validation.amount'));
    setErreur(null);
    setOccupe(true);
    try {
      const evidenceId = await creerPreuve(
        { kind: 'bank_slip', uri: photo.uri, capturedAt: photo.capturedAt, gps: photo.gps },
        ctx,
      );
      const res = await rpc('declare_bank_deposit', {
        p_amount_fcfa: m,
        p_evidence_id: evidenceId,
        p_shift_ids: choisis,
        p_bank_ref: ref.trim() || null,
      });
      if (!res.ok)
        return setErreur(
          res.error === 'SLIP_PHOTO_MISSING' ? t('reading.pendingUpload') : t('common.error'),
        );
      const diff = Number(res.difference_fcfa ?? 0);
      setMessage(
        diff === 0
          ? t('deposit.recorded')
          : `${t('deposit.recorded')} ${t('deposit.mismatch', { amount: formatFCFA(Math.abs(diff)) })}`,
      );
      setTimeout(() => router.replace('/accueil'), 2500);
    } finally {
      setOccupe(false);
    }
  };
  const date = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat('fr-SN', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(iso))
      : '';

  return (
    <SafeAreaView className="flex-1 bg-fond">
      <ScrollView
        contentContainerClassName="gap-4 px-5 pb-6 pt-4"
        keyboardShouldPersistTaps="handled"
      >
        <EnTeteEcran
          titre={t('deposit.title')}
          sousTitre={t('deposit.subtitle', { name: ctx.employeeName })}
          onRetour={() => router.back()}
        />
        <Text className="font-sans text-[13px] text-texte-secondaire">{t('deposit.shifts')}</Text>
        {shifts.length === 0 && (
          <Text className="font-sans text-[13px] text-texte-secondaire">{t('deposit.none')}</Text>
        )}
        {shifts.map((s) => (
          <Pressable
            key={s.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: choisis.includes(s.id) }}
            onPress={() =>
              setChoisis((c) => (c.includes(s.id) ? c.filter((x) => x !== s.id) : [...c, s.id]))
            }
            className={`min-h-[52px] flex-row items-center justify-between rounded-lg border px-4 ${choisis.includes(s.id) ? 'border-accent bg-accent-fond' : 'border-bordure bg-surface'}`}
          >
            <Text className="font-sans text-[14px] text-texte">
              {s.label ?? 'Shift'} · {date(s.closed_at)}
            </Text>
            <Text className="font-mono text-[13px] text-texte-secondaire">
              {t('deposit.counted', { amount: formatFCFA(s.counted) })}
            </Text>
          </Pressable>
        ))}
        {choisis.length > 0 && (
          <View className="gap-3 rounded-xl border border-bordure bg-surface p-4">
            <Text className="font-sans text-[13px] text-texte-secondaire">
              {t('deposit.counted', { amount: formatFCFA(totalCompte) })}
            </Text>
            <TextInput
              value={montant}
              onChangeText={setMontant}
              keyboardType="number-pad"
              placeholder={t('deposit.amount')}
              placeholderTextColor={couleurs.bordureForte}
              className="h-14 rounded-lg border border-bordure bg-fond px-3 font-mono-semibold text-[22px] text-texte"
            />
            <TextInput
              value={ref}
              onChangeText={setRef}
              placeholder={t('deposit.bankRef')}
              placeholderTextColor={couleurs.bordureForte}
              className="h-12 rounded-lg border border-bordure bg-fond px-3 font-sans text-[14px] text-texte"
            />
            <CartePhoto
              photo={photo}
              titre={t('deposit.slipPhoto')}
              onReprendre={() => setCamera(true)}
              station={ctx.stationName}
            />
            <Pressable
              accessibilityRole="button"
              disabled={occupe}
              onPress={() => void declarer()}
              className="h-14 items-center justify-center rounded-lg bg-accent"
            >
              {occupe ? (
                <ActivityIndicator color={couleurs.accentTexte} />
              ) : (
                <Text className="font-sans-semibold text-[16px] text-accent-texte">
                  {t('deposit.confirm')}
                </Text>
              )}
            </Pressable>
          </View>
        )}
        {erreur && <Text className="font-sans text-[13px] text-danger">{erreur}</Text>}
        {message && <Text className="font-sans-semibold text-[13px] text-succes">{message}</Text>}
      </ScrollView>
      <CapturePhoto
        visible={camera}
        onPhoto={(p) => {
          setPhoto(p);
          setCamera(false);
        }}
        onAnnuler={() => setCamera(false)}
      />
    </SafeAreaView>
  );
}
