import { formatFCFA } from '@stationsure/core';
import { useTranslation } from '@stationsure/i18n/react';
import { couleurs } from '@stationsure/ui';
import { useRouter } from 'expo-router';
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
import { chargerShiftCourant, rpc } from '@/lib/carburant';
import { contexteOperation } from '@/lib/contexte-operation';
import { creerPreuve } from '@/lib/preuves';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

interface Compte {
  id: string;
  customer_name: string;
  limit_fcfa: number;
  status: string;
  requested_at: string | null;
  solde: number;
}

/** Écran 16 — Vente à crédit (gérant) : compte actif, plafond, plaque, photo du bon signé ; demande de compte. */
export default function EcranVenteCredit() {
  const { t } = useTranslation();
  const { session } = useSession();
  const router = useRouter();
  const ctx = contexteOperation(session);
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [compteId, setCompteId] = useState<string | null>(null);
  const [plaque, setPlaque] = useState('');
  const [produit, setProduit] = useState('');
  const [montant, setMontant] = useState('');
  const [photo, setPhoto] = useState<PhotoPrise | null>(null);
  const [camera, setCamera] = useState(false);
  const [nouveauNom, setNouveauNom] = useState('');
  const [nouveauTel, setNouveauTel] = useState('');
  const [remboursement, setRemboursement] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const charger = useCallback(async () => {
    const [{ data: accs }, { data: entries }] = await Promise.all([
      supabase
        .from('credit_accounts')
        .select('id, customer_name, limit_fcfa, status, requested_at')
        .order('customer_name'),
      supabase.from('credit_entries').select('credit_account_id, amount_fcfa'),
    ]);
    const liste = (accs ?? []).map((a) => ({
      ...a,
      solde: (entries ?? [])
        .filter((e) => e.credit_account_id === a.id)
        .reduce((s, e) => s + e.amount_fcfa, 0),
    }));
    setComptes(liste);
    setCompteId((c) => c ?? liste.find((a) => a.status === 'active')?.id ?? null);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void charger();
  }, [charger]);

  if (!ctx) return null;
  if (ctx.role !== 'manager') {
    return (
      <SafeAreaView className="flex-1 bg-fond">
        <View className="gap-4 px-5 pt-4">
          <EnTeteEcran titre={t('credit.title')} onRetour={() => router.back()} />
          <Text className="font-sans text-[14px] text-texte-secondaire">
            {t('credit.managerOnly')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }
  const compte = comptes.find((c) => c.id === compteId);
  const montantFcfa = Number(montant.replace(/\s/g, '')) || 0;
  const disponible = compte ? compte.limit_fcfa - compte.solde : 0;

  const enregistrer = async () => {
    if (!compte) return;
    if (!photo) return setErreur(t('credit.notePhoto'));
    if (montantFcfa <= 0) return setErreur(t('validation.amount'));
    setErreur(null);
    setOccupe(true);
    try {
      const shift = await chargerShiftCourant();
      if (!shift || shift.status !== 'open') return setErreur(t('sale.noShift'));
      const evidenceId = await creerPreuve(
        { kind: 'credit_note', uri: photo.uri, capturedAt: photo.capturedAt, gps: photo.gps },
        ctx,
      );
      const res = await rpc('record_sale', {
        p: {
          kind: 'fuel',
          shift_id: shift.id,
          amount_fcfa: montantFcfa,
          method: 'credit',
          credit_account_id: compte.id,
          vehicle_plate: plaque.trim() || null,
          evidence_id: evidenceId,
          description: produit || 'Carburant',
        },
      });
      if (!res.ok)
        return setErreur(
          res.error === 'CREDIT_LIMIT'
            ? t('credit.overLimit', { amount: formatFCFA(Number(res.available_fcfa ?? 0)) })
            : t('common.error'),
        );
      setMessage(t('credit.recorded'));
      setMontant('');
      setPhoto(null);
      setPlaque('');
      await charger();
    } finally {
      setOccupe(false);
    }
  };
  const demander = async () => {
    if (nouveauNom.trim().length < 2) return;
    setOccupe(true);
    const { error } = await supabase.rpc('request_credit_account', {
      p_customer_name: nouveauNom.trim(),
      ...(nouveauTel.trim() ? { p_phone: nouveauTel.trim() } : {}),
    });
    setOccupe(false);
    if (error) return setErreur(t('common.error'));
    setMessage(t('credit.requested'));
    setNouveauNom('');
    setNouveauTel('');
    await charger();
  };
  const rembourser = async () => {
    if (!compte) return;
    const m = Number(remboursement.replace(/\s/g, '')) || 0;
    if (m <= 0) return;
    setOccupe(true);
    const res = await rpc('record_credit_repayment', {
      p_account_id: compte.id,
      p_amount_fcfa: m,
      p_method: 'cash',
    });
    setOccupe(false);
    if (!res.ok) return setErreur(t('common.error'));
    setMessage(t('credit.repaid', { balance: formatFCFA(Number(res.balance_fcfa ?? 0)) }));
    setRemboursement('');
    await charger();
  };
  const heure = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat('fr-SN', { hour: '2-digit', minute: '2-digit' }).format(
          new Date(iso),
        )
      : '';

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
            titre={t('credit.title')}
            sousTitre={t('credit.subtitle', { name: ctx.employeeName })}
            onRetour={() => router.back()}
          />
          <View className="flex-row flex-wrap gap-2">
            {comptes
              .filter((c) => c.status === 'active')
              .map((c) => (
                <Pressable
                  key={c.id}
                  accessibilityRole="button"
                  onPress={() => setCompteId(c.id)}
                  className={`min-h-[48px] justify-center rounded-lg border px-4 ${compteId === c.id ? 'border-accent bg-accent-fond' : 'border-bordure bg-surface'}`}
                >
                  <Text
                    className={`font-sans-semibold text-[14px] ${compteId === c.id ? 'text-accent' : 'text-texte'}`}
                  >
                    {c.customer_name}
                  </Text>
                </Pressable>
              ))}
          </View>
          {compte && (
            <View className="gap-3 rounded-xl border border-bordure bg-surface p-4">
              <View className="flex-row justify-between">
                <Text className="font-display-semibold text-[18px] text-texte">
                  {compte.customer_name}
                </Text>
                <Text className="rounded-pilule bg-surface-2 px-2 py-1 font-sans-semibold text-[12px] text-info">
                  {t('credit.fleet')}
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Colonne l={t('credit.limit')} v={formatFCFA(compte.limit_fcfa)} />
                <Colonne l={t('credit.due')} v={formatFCFA(compte.solde)} />
                <Colonne
                  l={t('credit.available')}
                  v={formatFCFA(disponible)}
                  couleur={couleurs.succes}
                />
              </View>
              <Saisie
                valeur={plaque}
                onChange={(v) => setPlaque(v.toUpperCase())}
                placeholder={t('credit.vehicle')}
              />
              <Saisie valeur={produit} onChange={setProduit} placeholder={t('credit.product')} />
              <Saisie
                valeur={montant}
                onChange={setMontant}
                placeholder={`${t('credit.amount')} (FCFA)`}
                numerique
              />
              <CartePhoto
                photo={photo}
                titre={t('credit.notePhoto')}
                onReprendre={() => setCamera(true)}
                station={ctx.stationName}
              />
              <View className="flex-row justify-between">
                <Text className="font-sans text-[13px] text-texte-secondaire">
                  {t('credit.afterSale')}
                </Text>
                <Text
                  className={`font-mono-semibold text-[16px] ${disponible - montantFcfa < 0 ? 'text-danger' : 'text-texte'}`}
                >
                  {formatFCFA(disponible - montantFcfa)}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={occupe}
                onPress={() => void enregistrer()}
                className="h-14 items-center justify-center rounded-lg bg-accent"
              >
                {occupe ? (
                  <ActivityIndicator color={couleurs.accentTexte} />
                ) : (
                  <Text className="font-sans-semibold text-[16px] text-accent-texte">
                    {t('credit.confirm')}
                  </Text>
                )}
              </Pressable>
              <View className="flex-row items-center gap-2">
                <TextInput
                  value={remboursement}
                  onChangeText={setRemboursement}
                  keyboardType="number-pad"
                  placeholder={t('credit.repayAmount')}
                  placeholderTextColor={couleurs.bordureForte}
                  className="h-12 flex-1 rounded-lg border border-bordure bg-fond px-3 font-mono text-[15px] text-texte"
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={occupe}
                  onPress={() => void rembourser()}
                  className="h-12 justify-center rounded-lg border border-bordure-forte px-3"
                >
                  <Text className="font-sans-semibold text-[13px] text-texte">
                    {t('credit.repay')}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
          <View className="gap-3 rounded-xl border border-bordure bg-surface p-4">
            <Text className="font-sans-semibold text-[15px] text-texte">
              {t('credit.newCustomer')}
            </Text>
            {comptes
              .filter((c) => c.status === 'pending')
              .map((c) => (
                <View
                  key={c.id}
                  className="flex-row items-center justify-between rounded-lg border border-bordure bg-fond px-3 py-2"
                >
                  <Text className="font-sans-semibold text-[14px] text-texte">
                    {c.customer_name}
                  </Text>
                  <Text className="font-sans text-[12px] text-accent">
                    {t('validate.pending')} ·{' '}
                    {t('credit.pendingSince', { time: heure(c.requested_at) })}
                  </Text>
                </View>
              ))}
            <Saisie
              valeur={nouveauNom}
              onChange={setNouveauNom}
              placeholder={t('credit.customerName')}
            />
            <Saisie valeur={nouveauTel} onChange={setNouveauTel} placeholder={t('credit.phone')} />
            <Pressable
              accessibilityRole="button"
              disabled={occupe || nouveauNom.trim().length < 2}
              onPress={() => void demander()}
              className="h-12 items-center justify-center rounded-lg border border-bordure-forte bg-surface"
            >
              <Text className="font-sans-semibold text-[14px] text-texte">
                {t('credit.requestAccount')}
              </Text>
            </Pressable>
          </View>
          {erreur && <Text className="font-sans text-[13px] text-danger">{erreur}</Text>}
          {message && <Text className="font-sans-semibold text-[13px] text-succes">{message}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
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

function Colonne({ l, v, couleur }: { l: string; v: string; couleur?: string }) {
  return (
    <View>
      <Text className="font-sans text-[11px] text-texte-secondaire">{l}</Text>
      <Text className="font-mono-semibold text-[16px]" style={{ color: couleur ?? couleurs.texte }}>
        {v}
      </Text>
    </View>
  );
}
function Saisie({
  valeur,
  onChange,
  placeholder,
  numerique,
}: {
  valeur: string;
  onChange: (v: string) => void;
  placeholder: string;
  numerique?: boolean;
}) {
  return (
    <TextInput
      value={valeur}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={couleurs.bordureForte}
      keyboardType={numerique ? 'number-pad' : 'default'}
      accessibilityLabel={placeholder}
      className={`h-12 rounded-lg border border-bordure bg-fond px-3 text-[15px] text-texte ${numerique ? 'font-mono' : 'font-sans'}`}
    />
  );
}
