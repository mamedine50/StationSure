import { formatFCFA, litresToCl } from '@stationsure/core';
import { useTranslation } from '@stationsure/i18n/react';
import { couleurs } from '@stationsure/ui';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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

import { EnTeteEcran } from '@/components/liste-etapes';
import { chargerPistolets, chargerShiftCourant, type Pistolet, rpc } from '@/lib/carburant';
import { contexteOperation } from '@/lib/contexte-operation';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type Kind = 'fuel' | 'shop' | 'wash' | 'garage';
type Method = 'cash' | 'wave' | 'orange_money' | 'card';

/** Écran 15 — Encaisser : montant, nature, mode (espèces, Wave, OM, carte). Le crédit a son écran. */
export default function EcranEncaisser() {
  const { t } = useTranslation();
  const { session } = useSession();
  const router = useRouter();
  const ctx = contexteOperation(session);
  const [shiftId, setShiftId] = useState<string | null | undefined>(undefined);
  const [pistolets, setPistolets] = useState<Pistolet[]>([]);
  const [prix, setPrix] = useState<Record<string, number>>({});
  const [montant, setMontant] = useState('');
  const [litres, setLitres] = useState('');
  const [kind, setKind] = useState<Kind>('fuel');
  const [nozzleId, setNozzleId] = useState<string | null>(null);
  const [method, setMethod] = useState<Method>('cash');
  const [reference, setReference] = useState('');
  const [last4, setLast4] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    let annule = false;
    void Promise.all([
      chargerShiftCourant(),
      chargerPistolets(),
      supabase.from('current_fuel_prices').select('fuel_product_code, price_fcfa_per_litre'),
    ]).then(([s, p, { data: px }]) => {
      if (annule) return;
      setShiftId(s?.status === 'open' ? s.id : null);
      setPistolets(p);
      setNozzleId(p[0]?.id ?? null);
      setPrix(
        Object.fromEntries(
          (px ?? []).map((x) => [x.fuel_product_code ?? '', x.price_fcfa_per_litre ?? 0]),
        ),
      );
    });
    return () => {
      annule = true;
    };
  }, []);

  if (!ctx) return null;
  const pistolet = pistolets.find((p) => p.id === nozzleId);
  const prixLitre = pistolet ? (prix[pistolet.produit] ?? 0) : 0;
  const montantCalcule =
    kind === 'fuel' && litres && prixLitre
      ? Math.round((litresToCl(Number(litres.replace(',', '.'))) * prixLitre) / 100)
      : null;
  const montantFcfa = montantCalcule ?? (Number(montant.replace(/\s/g, '')) || 0);

  const enregistrer = async () => {
    if (!shiftId) return setErreur(t('sale.noShift'));
    if (montantFcfa <= 0) return setErreur(t('validation.amount'));
    if ((method === 'wave' || method === 'orange_money') && reference.trim().length < 4)
      return setErreur(t('validation.reference'));
    if (method === 'card' && !/^\d{4}$/.test(last4)) return setErreur(t('validation.card4'));
    setErreur(null);
    setOccupe(true);
    const res = await rpc('record_sale', {
      p: {
        kind,
        shift_id: shiftId,
        amount_fcfa: montantFcfa,
        method,
        external_ref: reference.trim() || null,
        card_last4: last4 || null,
        nozzle_id: kind === 'fuel' ? nozzleId : null,
        litres_cl: kind === 'fuel' && litres ? litresToCl(Number(litres.replace(',', '.'))) : null,
        unit_price_fcfa: kind === 'fuel' ? prixLitre : null,
      },
    });
    setOccupe(false);
    if (!res.ok) {
      setErreur(
        res.error === 'REFERENCE_DUPLICATE'
          ? t('sale.duplicate')
          : res.error === 'NOZZLE_PAUSED'
            ? t('sale.paused')
            : res.error === 'SHIFT_NOT_OPEN'
              ? t('sale.noShift')
              : t('common.error'),
      );
      return;
    }
    setMessage(t('sale.recorded'));
    setMontant('');
    setLitres('');
    setReference('');
    setLast4('');
    setTimeout(() => setMessage(null), 2500);
  };

  const methodes: Method[] = ['cash', 'wave', 'orange_money', 'card'];
  const kinds: Kind[] = ['fuel', 'shop', 'wash', 'garage'];

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
          <EnTeteEcran
            titre={t('sale.title')}
            sousTitre={t('sale.subtitle', { name: ctx.employeeName, station: ctx.stationName })}
            onRetour={() => router.back()}
          />
          {shiftId === null && (
            <Text className="font-sans text-[13px] text-danger">{t('sale.noShift')}</Text>
          )}

          <View className="flex-row gap-2">
            {kinds.map((k) => (
              <Pressable
                key={k}
                accessibilityRole="button"
                onPress={() => setKind(k)}
                className={`h-12 flex-1 items-center justify-center rounded-lg border ${kind === k ? 'border-accent bg-accent-fond' : 'border-bordure bg-surface'}`}
              >
                <Text
                  className={`font-sans-semibold text-[13px] ${kind === k ? 'text-accent' : 'text-texte'}`}
                >
                  {t(`sale.kinds.${k}`)}
                </Text>
              </Pressable>
            ))}
          </View>

          {kind === 'fuel' && (
            <View className="gap-2">
              <Text className="font-sans text-[13px] text-texte-secondaire">
                {t('sale.nozzle')}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {pistolets.map((p) => (
                  <Pressable
                    key={p.id}
                    accessibilityRole="button"
                    onPress={() => setNozzleId(p.id)}
                    className={`h-12 min-w-[30%] flex-1 items-center justify-center rounded-lg border ${nozzleId === p.id ? 'border-accent bg-accent-fond' : 'border-bordure bg-surface'}`}
                  >
                    <Text
                      className={`font-sans-semibold text-[13px] ${nozzleId === p.id ? 'text-accent' : 'text-texte'}`}
                    >
                      {p.label} · {t(`fuel.${p.produit}`)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View className="flex-row items-center rounded-lg border border-bordure bg-surface px-4">
                <TextInput
                  value={litres}
                  onChangeText={setLitres}
                  keyboardType="decimal-pad"
                  placeholder="0,00"
                  placeholderTextColor={couleurs.bordureForte}
                  className="h-14 flex-1 font-mono-semibold text-[22px] text-texte"
                />
                <Text className="font-sans text-[14px] text-texte-secondaire">L × {prixLitre}</Text>
              </View>
            </View>
          )}

          <View className="gap-1 rounded-xl border border-bordure bg-surface p-4">
            <Text className="font-sans text-[13px] text-texte-secondaire">{t('sale.amount')}</Text>
            {montantCalcule !== null ? (
              <Text className="font-mono-semibold text-[34px] text-texte">
                {formatFCFA(montantCalcule)}{' '}
                <Text className="font-sans text-[14px] text-texte-secondaire">FCFA</Text>
              </Text>
            ) : (
              <View className="flex-row items-center">
                <TextInput
                  value={montant}
                  onChangeText={setMontant}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={couleurs.bordureForte}
                  className="h-14 flex-1 font-mono-semibold text-[34px] text-texte"
                />
                <Text className="font-sans text-[14px] text-texte-secondaire">FCFA</Text>
              </View>
            )}
          </View>

          <View className="flex-row gap-2">
            {methodes.map((m) => (
              <Pressable
                key={m}
                accessibilityRole="button"
                onPress={() => setMethod(m)}
                className={`h-12 flex-1 items-center justify-center rounded-lg border ${method === m ? 'border-accent bg-accent-fond' : 'border-bordure bg-surface'}`}
              >
                <Text
                  className={`font-sans-semibold text-[12px] ${method === m ? 'text-accent' : 'text-texte'}`}
                >
                  {t(`sale.methods.${m}`)}
                </Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/vente-credit')}
              className="h-12 flex-1 items-center justify-center rounded-lg border border-bordure bg-surface"
            >
              <Text className="font-sans-semibold text-[12px] text-texte">
                {t('sale.methods.credit')}
              </Text>
            </Pressable>
          </View>

          {(method === 'wave' || method === 'orange_money') && (
            <View className="gap-3 rounded-xl border border-bordure bg-surface p-4">
              <Text className="font-sans-semibold text-[14px] text-texte">{t('sale.step1')}</Text>
              <View className="items-center gap-1 rounded-lg bg-fond p-4">
                <View className="h-24 w-24 items-center justify-center rounded-md bg-white">
                  <Text className="font-mono text-[10px] text-fond">QR</Text>
                </View>
                <Text className="font-sans-semibold text-[13px] text-texte">
                  {t('sale.merchantOf', {
                    provider: method === 'wave' ? 'Wave' : 'Orange Money',
                    station: ctx.stationName,
                  })}
                </Text>
                <Text className="font-sans text-[12px] text-texte-secondaire">
                  {t('sale.merchantAccount')}
                </Text>
              </View>
              <Text className="font-sans-semibold text-[14px] text-texte">{t('sale.step2')}</Text>
              <TextInput
                value={reference}
                onChangeText={setReference}
                autoCapitalize="characters"
                placeholder={t('sale.reference')}
                placeholderTextColor={couleurs.bordureForte}
                className="h-12 rounded-lg border border-bordure bg-fond px-3 font-mono text-[15px] text-texte"
              />
            </View>
          )}
          {method === 'card' && (
            <TextInput
              value={last4}
              onChangeText={(v) => setLast4(v.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              placeholder={t('sale.card4')}
              placeholderTextColor={couleurs.bordureForte}
              className="h-12 rounded-lg border border-bordure bg-surface px-3 font-mono text-[15px] text-texte"
            />
          )}

          {erreur && <Text className="font-sans text-[13px] text-danger">{erreur}</Text>}
          {message && <Text className="font-sans-semibold text-[13px] text-succes">{message}</Text>}
          <Pressable
            accessibilityRole="button"
            disabled={occupe || (shiftId !== null && !shiftId)}
            onPress={() => void enregistrer()}
            className="h-14 items-center justify-center rounded-lg bg-accent"
          >
            {occupe ? (
              <ActivityIndicator color={couleurs.accentTexte} />
            ) : (
              <Text className="font-sans-semibold text-[17px] text-accent-texte">
                {t('sale.confirm')}
              </Text>
            )}
          </Pressable>
          <Text className="text-center font-sans text-[12px] text-texte-secondaire">
            {t('sale.ownerHint')}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/annulation')}
            className="h-12 items-center justify-center rounded-lg border border-bordure-forte bg-surface"
          >
            <Text className="font-sans-semibold text-[14px] text-texte">{t('sale.void')}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
