import {
  ecartLivraisonPourcent,
  formatLitres,
  formatPourcent,
  litresToCl,
  livraisonAvecReserve,
  volumeLivre,
} from '@stationsure/core';
import { useTranslation } from '@stationsure/i18n/react';
import { couleurs } from '@stationsure/ui';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CapturePhoto, CartePhoto, type PhotoPrise } from '@/components/capture-photo';
import { EnTeteEcran } from '@/components/liste-etapes';
import { chargerCuves, type Cuve, rpc } from '@/lib/carburant';
import { contexteOperation } from '@/lib/contexte-operation';
import { creerPreuve } from '@/lib/preuves';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

interface SessionLivraison {
  id: string;
  tank_id: string;
  status: 'gauging_before' | 'unloading' | 'gauging_after' | 'signing' | 'signed' | 'cancelled';
  before_reading_id: string | null;
  after_reading_id: string | null;
  unloading_started_at: string | null;
  supplier: string | null;
  truck_plate: string | null;
  driver_name: string | null;
}

/**
 * Écran 12 — Réception de livraison (gérant) : jauge avant → dépotage (pistolets en pause) →
 * jauge après → photo du bon + volume facturé → signature (avec réserve si écart > 0,3 %).
 */
export default function EcranLivraison() {
  const { t } = useTranslation();
  const { session } = useSession();
  const router = useRouter();
  const params = useLocalSearchParams<{ delivery?: string; reading?: string; step?: string }>();
  const ctx = contexteOperation(session);

  const [cuves, setCuves] = useState<Cuve[]>([]);
  const [cuveId, setCuveId] = useState<string | null>(null);
  const [fournisseur, setFournisseur] = useState('');
  const [camion, setCamion] = useState('');
  const [chauffeur, setChauffeur] = useState('');
  const [livraison, setLivraison] = useState<SessionLivraison | null | undefined>(undefined);
  const [volumes, setVolumes] = useState<{
    avant: number | null;
    apres: number | null;
    hAvant: number | null;
    hApres: number | null;
  }>({ avant: null, apres: null, hAvant: null, hApres: null });
  const [pistoletsPause, setPistoletsPause] = useState<string[]>([]);
  const [photoBon, setPhotoBon] = useState<PhotoPrise | null>(null);
  const [camera, setCamera] = useState(false);
  const [refBon, setRefBon] = useState('');
  const [facture, setFacture] = useState('');
  const [motifReserve, setMotifReserve] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [readingTraite, setReadingTraite] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const liste = await chargerCuves();
    setCuves(liste);
    const { data } = await supabase
      .from('fuel_delivery_sessions')
      .select(
        'id, tank_id, status, before_reading_id, after_reading_id, unloading_started_at, supplier, truck_plate, driver_name',
      )
      .not('status', 'in', '("signed","cancelled")')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const s = (data as SessionLivraison | null) ?? null;
    setLivraison(s);
    if (s) {
      const ids = [s.before_reading_id, s.after_reading_id].filter((x): x is string => !!x);
      if (ids.length > 0) {
        const { data: lectures } = await supabase
          .from('tank_readings')
          .select('id, volume_cl, height_mm')
          .in('id', ids);
        const avant = lectures?.find((l) => l.id === s.before_reading_id);
        const apres = lectures?.find((l) => l.id === s.after_reading_id);
        setVolumes({
          avant: avant?.volume_cl ?? null,
          apres: apres?.volume_cl ?? null,
          hAvant: avant?.height_mm ?? null,
          hApres: apres?.height_mm ?? null,
        });
      }
      const { data: n } = await supabase
        .from('nozzles')
        .select('label')
        .eq('tank_id', s.tank_id)
        .eq('active', true)
        .order('label');
      setPistoletsPause((n ?? []).map((x) => x.label));
    }
  }, []);

  // Retour du jaugeage : on avance la session avec le relevé créé.
  const avancerApresJauge = useCallback(async () => {
    if (!params.delivery || !params.reading || readingTraite === params.reading) return;
    setReadingTraite(params.reading);
    const etape = params.step === 'delivery_before' ? 'before_gauged' : 'after_gauged';
    const res = await rpc('advance_delivery', {
      p_session_id: params.delivery,
      p_step: etape,
      p_reading_id: params.reading,
    });
    if (!res.ok)
      setErreur(res.error === 'READING_MISSING' ? t('reading.pendingUpload') : t('common.error'));
    await charger();
  }, [params.delivery, params.reading, params.step, readingTraite, charger, t]);

  useFocusEffect(
    useCallback(() => {
      void charger().then(() => avancerApresJauge());
    }, [charger, avancerApresJauge]),
  );

  if (!ctx) return null;
  if (ctx.role !== 'manager') {
    return (
      <SafeAreaView className="flex-1 bg-fond">
        <View className="gap-4 px-5 pt-4">
          <EnTeteEcran titre={t('delivery.title')} onRetour={() => router.back()} />
          <Text className="font-sans text-[14px] text-texte-secondaire">
            {t('delivery.managerOnly')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }
  const cuve = cuves.find((c) => c.id === (livraison?.tank_id ?? cuveId));

  const demarrer = async () => {
    if (!cuveId) return;
    setOccupe(true);
    const res = await rpc<{ session_id: string }>('start_delivery', {
      p_tank_id: cuveId,
      p_supplier: fournisseur || null,
      p_truck_plate: camion || null,
      p_driver_name: chauffeur || null,
    });
    setOccupe(false);
    if (!res.ok) return setErreur(t('common.error'));
    await charger();
  };

  const jauger = (kind: 'delivery_before' | 'delivery_after') => {
    if (!livraison) return;
    router.push({
      pathname: '/jaugeage',
      params: { kind, tank: livraison.tank_id, delivery: livraison.id },
    });
  };

  const finDepotage = async () => {
    if (!livraison) return;
    setOccupe(true);
    const res = await rpc('advance_delivery', {
      p_session_id: livraison.id,
      p_step: 'unloading_done',
    });
    setOccupe(false);
    if (!res.ok) return setErreur(t('common.error'));
    await charger();
  };

  const factureCl = /^\d+(?:[.,]\d{1,2})?$/.test(facture.replace(/\s/g, ''))
    ? litresToCl(Number(facture.replace(/\s/g, '').replace(',', '.')))
    : null;
  const recu =
    volumes.avant !== null && volumes.apres !== null
      ? volumeLivre(volumes.avant, volumes.apres)
      : null;
  const ecart = recu !== null && factureCl ? ecartLivraisonPourcent(recu, factureCl) : null;
  const reserve = ecart !== null && livraisonAvecReserve(ecart);

  const signer = async (avecReserve: boolean) => {
    if (!livraison || !photoBon || !factureCl) return setErreur(t('reading.photoRequired'));
    setOccupe(true);
    setErreur(null);
    try {
      const evidenceId = await creerPreuve(
        {
          kind: 'delivery_note',
          uri: photoBon.uri,
          capturedAt: photoBon.capturedAt,
          gps: photoBon.gps,
        },
        ctx,
      );
      const res = await rpc('sign_delivery', {
        p_session_id: livraison.id,
        p_invoiced_cl: factureCl,
        p_invoice_evidence_id: evidenceId,
        p_invoice_ref: refBon || null,
        p_with_reserve: avecReserve,
        p_reserve_reason: motifReserve || null,
      });
      if (!res.ok) {
        setErreur(
          res.error === 'INVOICE_PHOTO_MISSING'
            ? t('reading.pendingUpload')
            : res.error === 'RESERVE_REQUIRED'
              ? t('delivery.reserveHint')
              : res.error === 'REASON_REQUIRED'
                ? t('delivery.reserveReason')
                : t('common.error'),
        );
        return;
      }
      setMessage(t('delivery.signed'));
      setTimeout(() => router.replace('/accueil'), 1500);
    } finally {
      setOccupe(false);
    }
  };

  const etapes = ['before', 'unloading', 'after', 'sign'] as const;
  const indexEtape = livraison
    ? { gauging_before: 0, unloading: 1, gauging_after: 2, signing: 3, signed: 3, cancelled: 0 }[
        livraison.status
      ]
    : -1;
  const heure = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat('fr-SN', { hour: '2-digit', minute: '2-digit' }).format(
          new Date(iso),
        )
      : '';

  return (
    <SafeAreaView className="flex-1 bg-fond">
      <ScrollView
        contentContainerClassName="gap-4 px-5 pb-6 pt-4"
        keyboardShouldPersistTaps="handled"
      >
        <EnTeteEcran
          titre={t('delivery.title')}
          sousTitre={
            cuve
              ? t('delivery.subtitle', {
                  tank: `${cuve.label} · ${t(`fuel.${cuve.fuel_product_code}`)}`,
                  name: ctx.employeeName,
                })
              : undefined
          }
          onRetour={() => router.replace('/accueil')}
        />

        {livraison && (
          <View className="flex-row gap-2">
            {etapes.map((e, i) => (
              <View key={e} className="flex-1 gap-1">
                <View
                  className={`h-1.5 rounded-pilule ${i < indexEtape ? 'bg-succes' : i === indexEtape ? 'bg-accent' : 'bg-surface-2'}`}
                />
                <Text
                  className={`font-sans text-[11px] ${i === indexEtape ? 'font-sans-semibold text-accent' : 'text-texte-secondaire'}`}
                >
                  {t(`delivery.steps.${e}`)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {livraison === undefined && <ActivityIndicator color={couleurs.accent} />}

        {livraison === null && (
          <View className="gap-3">
            <Text className="font-sans-semibold text-[15px] text-texte">
              {t('delivery.chooseTank')}
            </Text>
            {cuves.map((c) => (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                onPress={() => setCuveId(c.id)}
                className={`min-h-[52px] justify-center rounded-lg border px-4 ${cuveId === c.id ? 'border-accent bg-accent-fond' : 'border-bordure bg-surface'}`}
              >
                <Text className="font-sans-semibold text-[15px] text-texte">
                  {c.label} · {t(`fuel.${c.fuel_product_code}`)}
                </Text>
              </Pressable>
            ))}
            <Saisie
              valeur={fournisseur}
              onChange={setFournisseur}
              placeholder={t('delivery.supplier')}
            />
            <Saisie valeur={camion} onChange={setCamion} placeholder={t('delivery.truck')} />
            <Saisie valeur={chauffeur} onChange={setChauffeur} placeholder={t('delivery.driver')} />
            <BoutonPlein
              libelle={t('delivery.start')}
              desactive={!cuveId || occupe}
              onPress={() => void demarrer()}
            />
          </View>
        )}

        {livraison?.status === 'gauging_before' && (
          <BoutonPlein
            libelle={`${t('delivery.before')} · ${t('gauge.takePhoto')}`}
            onPress={() => jauger('delivery_before')}
          />
        )}

        {livraison?.status === 'unloading' && (
          <View className="gap-3">
            <View className="gap-1 rounded-lg border border-bordure bg-surface p-4">
              <Text className="font-sans-semibold text-[14px] text-texte">
                ⏸ {t('delivery.unloadingTitle')}
              </Text>
              <Text className="font-sans text-[13px] text-texte-secondaire">
                {t('delivery.unloadingBody', {
                  nozzles: pistoletsPause.join(', '),
                  time: heure(livraison.unloading_started_at),
                })}
              </Text>
            </View>
            <BoutonPlein
              libelle={t('delivery.unloadingDone')}
              desactive={occupe}
              onPress={() => void finDepotage()}
            />
          </View>
        )}

        {livraison?.status === 'gauging_after' && (
          <BoutonPlein
            libelle={`${t('delivery.after')} · ${t('gauge.takePhoto')}`}
            onPress={() => jauger('delivery_after')}
          />
        )}

        {livraison?.status === 'signing' && (
          <View className="gap-4">
            <View className="gap-3 rounded-lg border border-bordure bg-surface p-4">
              <CartePhoto
                photo={photoBon}
                titre={t('delivery.deliveryNote')}
                onReprendre={() => setCamera(true)}
                station={ctx.stationName}
              />
              <Saisie valeur={refBon} onChange={setRefBon} placeholder={t('delivery.invoiceRef')} />
              <Saisie
                valeur={facture}
                onChange={setFacture}
                placeholder={t('delivery.invoicedL')}
                numerique
              />
            </View>
            <View className="overflow-hidden rounded-lg border border-bordure bg-surface">
              <LigneTableau
                libelle={t('delivery.before')}
                hauteur={volumes.hAvant}
                volume={volumes.avant}
              />
              <LigneTableau
                libelle={t('delivery.after')}
                hauteur={volumes.hApres}
                volume={volumes.apres}
              />
              <LigneTableau libelle={t('delivery.measured')} volume={recu} gras />
              <LigneTableau libelle={t('delivery.invoiced')} volume={factureCl} />
            </View>
            {ecart !== null && recu !== null && factureCl !== null && (
              <View
                className={`gap-1 rounded-lg border p-4 ${reserve ? 'border-danger-bordure bg-danger-fond' : 'border-bordure bg-surface'}`}
              >
                <Text
                  className={`font-sans-semibold text-[14px] ${reserve ? 'text-[#FFB4A8]' : 'text-succes'}`}
                >
                  {recu < factureCl
                    ? t('delivery.shortfall', {
                        litres: formatLitres(factureCl - recu),
                        pct: formatPourcent(ecart),
                      })
                    : t('delivery.surplus', {
                        litres: formatLitres(recu - factureCl),
                        pct: formatPourcent(ecart),
                      })}
                </Text>
                <Text className="font-sans text-[13px] text-texte-secondaire">
                  {reserve ? t('delivery.reserveHint') : t('delivery.okHint')}
                </Text>
              </View>
            )}
            {reserve && (
              <Saisie
                valeur={motifReserve}
                onChange={setMotifReserve}
                placeholder={t('delivery.reserveReason')}
              />
            )}
            <View className="flex-row gap-3">
              <Pressable
                accessibilityRole="button"
                onPress={() => jauger('delivery_after')}
                className="h-14 flex-1 items-center justify-center rounded-lg border border-bordure-forte bg-surface"
              >
                <Text className="font-sans-semibold text-[15px] text-texte">
                  {t('delivery.redoGauge')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={
                  occupe || !photoBon || !factureCl || (reserve && motifReserve.trim().length < 3)
                }
                onPress={() => void signer(reserve)}
                className={`h-14 flex-1 items-center justify-center rounded-lg bg-accent ${!photoBon || !factureCl ? 'opacity-50' : ''}`}
              >
                {occupe ? (
                  <ActivityIndicator color={couleurs.accentTexte} />
                ) : (
                  <Text className="font-sans-semibold text-[15px] text-accent-texte">
                    {reserve ? t('delivery.signReserve') : t('delivery.sign')}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        )}

        {message && <Text className="font-sans-semibold text-[14px] text-succes">{message}</Text>}
        {erreur && <Text className="font-sans text-[13px] text-danger">{erreur}</Text>}
      </ScrollView>
      <CapturePhoto
        visible={camera}
        onPhoto={(p) => {
          setPhotoBon(p);
          setCamera(false);
        }}
        onAnnuler={() => setCamera(false)}
      />
    </SafeAreaView>
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
      keyboardType={numerique ? 'decimal-pad' : 'default'}
      accessibilityLabel={placeholder}
      className={`h-12 rounded-lg border border-bordure bg-fond px-3 text-[15px] text-texte ${numerique ? 'font-mono' : 'font-sans'}`}
    />
  );
}

function BoutonPlein({
  libelle,
  onPress,
  desactive,
}: {
  libelle: string;
  onPress: () => void;
  desactive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={desactive}
      className={`h-14 items-center justify-center rounded-lg bg-accent ${desactive ? 'opacity-50' : ''}`}
    >
      <Text className="font-sans-semibold text-[16px] text-accent-texte">{libelle}</Text>
    </Pressable>
  );
}

function LigneTableau({
  libelle,
  hauteur,
  volume,
  gras,
}: {
  libelle: string;
  hauteur?: number | null;
  volume: number | null;
  gras?: boolean;
}) {
  return (
    <View className="flex-row items-center border-b border-bordure px-4 py-3">
      <Text
        className={`flex-1 text-[14px] text-texte ${gras ? 'font-sans-semibold' : 'font-sans'}`}
      >
        {libelle}
      </Text>
      {hauteur !== undefined && (
        <Text className="w-24 text-right font-mono text-[14px] text-texte">
          {hauteur !== null ? `${hauteur} mm` : '—'}
        </Text>
      )}
      <Text
        className={`w-28 text-right text-[14px] text-texte ${gras ? 'font-mono-semibold' : 'font-mono'}`}
      >
        {volume !== null ? `${formatLitres(volume).replace(',00', '')} L` : '—'}
      </Text>
    </View>
  );
}
