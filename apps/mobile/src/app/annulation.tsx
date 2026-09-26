import { formatFCFA } from '@stationsure/core';
import { useTranslation } from '@stationsure/i18n/react';
import { couleurs } from '@stationsure/ui';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EnTeteEcran } from '@/components/liste-etapes';
import { rpc } from '@/lib/carburant';
import { contexteOperation } from '@/lib/contexte-operation';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

interface Vente {
  id: string;
  kind: string;
  total_fcfa: number;
  note: string | null;
  device_created_at: string;
}

/** Demande d'annulation : vente visée, montant, motif obligatoire. Seul l'owner approuve. */
export default function EcranAnnulation() {
  const { t } = useTranslation();
  const { session } = useSession();
  const router = useRouter();
  const ctx = contexteOperation(session);
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [venteId, setVenteId] = useState<string | null>(null);
  const [montant, setMontant] = useState('');
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    let annule = false;
    void supabase
      .from('transactions')
      .select('id, kind, total_fcfa, note, device_created_at')
      .is('reverses_id', null)
      .order('device_created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (!annule) setVentes(data ?? []);
      });
    return () => {
      annule = true;
    };
  }, []);
  if (!ctx) return null;
  const vente = ventes.find((v) => v.id === venteId);

  const envoyer = async () => {
    if (!vente) return;
    setErreur(null);
    setOccupe(true);
    const res = await rpc('request_void', {
      p_transaction_id: vente.id,
      p_amount_fcfa: Number(montant.replace(/\s/g, '')) || vente.total_fcfa,
      p_reason: motif,
    });
    setOccupe(false);
    if (!res.ok)
      return setErreur(
        res.error === 'REASON_REQUIRED'
          ? t('void.reason')
          : res.error === 'VOID_EXISTS'
            ? t('void.exists')
            : res.error === 'AMOUNT_INVALID'
              ? t('validation.amount')
              : t('common.error'),
      );
    setMessage(`${t('void.sent')}${res.over_limit ? ` ${t('void.overLimit')}` : ''}`);
    setTimeout(() => router.back(), 2500);
  };
  const heure = (iso: string) =>
    new Intl.DateTimeFormat('fr-SN', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

  return (
    <SafeAreaView className="flex-1 bg-fond">
      <ScrollView
        contentContainerClassName="gap-4 px-5 pb-6 pt-4"
        keyboardShouldPersistTaps="handled"
      >
        <EnTeteEcran
          titre={t('void.title')}
          sousTitre={ctx.employeeName}
          onRetour={() => router.back()}
        />
        <Text className="font-sans text-[13px] text-texte-secondaire">{t('void.transaction')}</Text>
        {ventes.map((v) => (
          <Pressable
            key={v.id}
            accessibilityRole="button"
            onPress={() => {
              setVenteId(v.id);
              setMontant(String(v.total_fcfa));
            }}
            className={`min-h-[52px] flex-row items-center justify-between rounded-lg border px-4 ${venteId === v.id ? 'border-accent bg-accent-fond' : 'border-bordure bg-surface'}`}
          >
            <Text className="font-sans text-[14px] text-texte">
              {heure(v.device_created_at)} · {t(`sale.kinds.${v.kind}`, { defaultValue: v.kind })}
              {v.note ? ` · ${v.note}` : ''}
            </Text>
            <Text className="font-mono-semibold text-[14px] text-texte">
              {formatFCFA(v.total_fcfa)}
            </Text>
          </Pressable>
        ))}
        {vente && (
          <View className="gap-3 rounded-xl border border-bordure bg-surface p-4">
            <TextInput
              value={montant}
              onChangeText={setMontant}
              keyboardType="number-pad"
              placeholder={t('void.amount')}
              placeholderTextColor={couleurs.bordureForte}
              className="h-12 rounded-lg border border-bordure bg-fond px-3 font-mono text-[15px] text-texte"
            />
            <TextInput
              value={motif}
              onChangeText={setMotif}
              placeholder={t('void.reason')}
              placeholderTextColor={couleurs.bordureForte}
              multiline
              className="min-h-[64px] rounded-lg border border-bordure bg-fond px-3 py-2 font-sans text-[14px] text-texte"
            />
            <Pressable
              accessibilityRole="button"
              disabled={occupe || motif.trim().length < 3}
              onPress={() => void envoyer()}
              className={`h-14 items-center justify-center rounded-lg bg-accent ${motif.trim().length < 3 ? 'opacity-50' : ''}`}
            >
              {occupe ? (
                <ActivityIndicator color={couleurs.accentTexte} />
              ) : (
                <Text className="font-sans-semibold text-[16px] text-accent-texte">
                  {t('void.confirm')}
                </Text>
              )}
            </Pressable>
          </View>
        )}
        {erreur && <Text className="font-sans text-[13px] text-danger">{erreur}</Text>}
        {message && <Text className="font-sans-semibold text-[13px] text-succes">{message}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}
