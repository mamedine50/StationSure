import { formatLitres, formatPourcent } from '@stationsure/core';
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
import { BarreProgression, EnTeteEcran, ListeEtapes } from '@/components/liste-etapes';
import { chargerCuves, type Cuve, rpc } from '@/lib/carburant';
import { contexteOperation } from '@/lib/contexte-operation';
import { creerPreuve } from '@/lib/preuves';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type Kind = 'open' | 'close' | 'delivery_before' | 'delivery_after';

interface Resultat {
  tankId: string;
  volumeCl: number;
  expectedCl: number | null;
  varianceCl: number | null;
  heure: string;
}

/**
 * Écran 11 — Jaugeage : hauteur en mm + photo de la réglette. Le volume affiché vient du SERVEUR
 * (volume_from_calibration, version de barémage à la date), jamais calculé sur le téléphone.
 */
export default function EcranJaugeage() {
  const { t } = useTranslation();
  const { session } = useSession();
  const router = useRouter();
  const params = useLocalSearchParams<{
    kind: Kind;
    shift?: string;
    tank?: string;
    delivery?: string;
  }>();
  const kind = (params.kind ?? 'open') as Kind;
  const ctx = contexteOperation(session);

  const [cuves, setCuves] = useState<Cuve[] | null>(null);
  const [resultats, setResultats] = useState<Resultat[]>([]);
  const [courant, setCourant] = useState(0);
  const [photo, setPhoto] = useState<PhotoPrise | null>(null);
  const [camera, setCamera] = useState(false);
  const [hauteur, setHauteur] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);
  const [dernier, setDernier] = useState<Resultat | null>(null);
  const [finalisation, setFinalisation] = useState<string | null>(null);
  const [finalisationOk, setFinalisationOk] = useState(false);

  const charger = useCallback(async () => {
    const toutes = await chargerCuves();
    const liste = params.tank ? toutes.filter((c) => c.id === params.tank) : toutes;
    let faits: Resultat[] = [];
    if (params.shift && (kind === 'open' || kind === 'close')) {
      const { data } = await supabase
        .from('tank_readings')
        .select('tank_id, volume_cl, expected_cl, variance_cl, device_created_at')
        .eq('shift_id', params.shift)
        .eq('kind', kind);
      faits = (data ?? []).map((r) => ({
        tankId: r.tank_id,
        volumeCl: r.volume_cl,
        expectedCl: r.expected_cl,
        varianceCl: r.variance_cl,
        heure: r.device_created_at,
      }));
    }
    const premier = liste.findIndex((c) => !faits.some((f) => f.tankId === c.id));
    setCuves(liste);
    setResultats(faits);
    setCourant(premier === -1 ? liste.length : premier);
  }, [kind, params.shift, params.tank]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void charger();
  }, [charger]);

  const cuve = cuves?.[courant] ?? null;
  const hauteurMm = /^\d{1,5}$/.test(hauteur.trim()) ? Number(hauteur.trim()) : null;

  const valider = async () => {
    if (!ctx || !cuve) return;
    setErreur(null);
    if (!photo) return setErreur(t('gauge.photoRequired'));
    if (hauteurMm === null) return setErreur(t('gauge.heightRequired'));
    setEnregistrement(true);
    try {
      const evidenceId = await creerPreuve(
        { kind: 'tank_gauge', uri: photo.uri, capturedAt: photo.capturedAt, gps: photo.gps },
        ctx,
      );
      const { data, error } = await supabase
        .from('tank_readings')
        .insert({
          organization_id: ctx.organizationId,
          station_id: ctx.stationId,
          device_id: ctx.deviceId,
          employee_id: ctx.employeeId,
          tank_id: cuve.id,
          shift_id: params.shift ?? null,
          kind,
          height_mm: hauteurMm,
          // Valeur volontairement nulle : le serveur impose le volume via le barémage.
          volume_cl: 0,
          evidence_id: evidenceId,
          device_created_at: photo.capturedAt.toISOString(),
          gps_lat: photo.gps?.lat ?? null,
          gps_lng: photo.gps?.lng ?? null,
        })
        .select('id, volume_cl, expected_cl, variance_cl, device_created_at')
        .single();
      if (error || !data) {
        setErreur(
          error?.message.startsWith('BAREMAGE_HORS_TABLE')
            ? t('gauge.outOfTable')
            : t('common.error'),
        );
        return;
      }
      const r: Resultat = {
        tankId: cuve.id,
        volumeCl: data.volume_cl,
        expectedCl: data.expected_cl,
        varianceCl: data.variance_cl,
        heure: data.device_created_at,
      };
      setDernier(r);
      setResultats((x) => [...x, r]);
      setPhoto(null);
      setHauteur('');
      if (kind === 'delivery_before' || kind === 'delivery_after') {
        router.replace({
          pathname: '/livraison',
          params: { delivery: params.delivery, reading: data.id, step: kind },
        });
        return;
      }
      setCourant((c) => c + 1);
    } finally {
      setEnregistrement(false);
    }
  };

  useEffect(() => {
    if (!cuves || cuves.length === 0 || courant < cuves.length || finalisation !== null) return;
    if (kind !== 'open' && kind !== 'close') return;
    let annule = false;
    void rpc(kind === 'open' ? 'open_shift' : 'close_shift_fuel', {
      p_shift_id: params.shift,
    }).then((res) => {
      if (annule) return;
      if (res.ok) {
        setFinalisationOk(true);
        setFinalisation(kind === 'open' ? t('shift.opened') : t('shift.closed'));
        setTimeout(() => router.replace('/accueil'), 1500);
      } else if (res.error === 'SHIFT_INCOMPLETE') {
        const missing = res.missing as {
          nozzles: { label: string; reason: string }[];
          tanks: { label: string; reason: string }[];
        };
        const liste = [...missing.nozzles, ...missing.tanks]
          .map(
            (m) =>
              `${m.label} (${m.reason === 'missing_photo' ? t('shift.missingPhoto') : t('shift.missingReading')})`,
          )
          .join(', ');
        setFinalisation(`${t('shift.incomplete')} ${liste}`);
      } else {
        setFinalisation(t('common.error'));
      }
    });
    return () => {
      annule = true;
    };
  }, [courant, cuves, kind, params.shift, router, t, finalisation]);

  if (!ctx) return null;
  const libelleKind =
    kind === 'open'
      ? t('gauge.kindOpen')
      : kind === 'close'
        ? t('gauge.kindClose')
        : kind === 'delivery_before'
          ? t('gauge.kindBefore')
          : t('gauge.kindAfter');
  const heureCourte = (iso: string) =>
    new Intl.DateTimeFormat('fr-SN', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

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
            titre={t('gauge.title')}
            sousTitre={t('gauge.subtitle', { kind: libelleKind, name: ctx.employeeName })}
            compteur={
              cuves
                ? t('reading.progress', {
                    done: Math.min(courant + 1, cuves.length),
                    total: cuves.length,
                  })
                : undefined
            }
            onRetour={() => router.back()}
          />
          <BarreProgression
            ratio={cuves && cuves.length > 0 ? resultats.length / cuves.length : 0}
          />
          {cuves === null && <ActivityIndicator color={couleurs.accent} />}

          {finalisation && (
            <View className="rounded-lg border border-bordure bg-surface p-4">
              <Text
                className={`font-sans-semibold text-[14px] ${finalisationOk ? 'text-succes' : 'text-accent'}`}
              >
                {finalisation}
              </Text>
              {!finalisationOk && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setFinalisation(null);
                    void charger();
                  }}
                  className="mt-3 h-12 items-center justify-center rounded-lg border border-bordure-forte"
                >
                  <Text className="font-sans-semibold text-[14px] text-texte">
                    {t('common.retry')}
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {cuve && (
            <View className="gap-3 rounded-xl border border-bordure bg-surface p-4">
              <View className="flex-row items-center justify-between">
                <Text className="font-display-semibold text-[18px] text-texte">
                  {t('gauge.tank', {
                    label: cuve.label,
                    capacity: formatLitres(cuve.capacity_cl).replace(',00', ''),
                  })}
                </Text>
                <Text className="rounded-pilule bg-surface-2 px-2 py-1 font-sans-semibold text-[12px] text-info">
                  {t(`fuel.${cuve.fuel_product_code}`)}
                </Text>
              </View>
              <CartePhoto
                photo={photo}
                titre={t('gauge.levelRead')}
                valeur={hauteurMm !== null ? `${hauteurMm} mm` : undefined}
                onReprendre={() => setCamera(true)}
                station={ctx.stationName}
              />
              <Text className="font-sans text-[13px] text-texte-secondaire">
                {t('gauge.heightLabel')}
              </Text>
              <View className="flex-row items-center rounded-lg border border-bordure bg-fond px-4">
                <TextInput
                  value={hauteur}
                  onChangeText={setHauteur}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={couleurs.bordureForte}
                  accessibilityLabel={t('gauge.heightLabel')}
                  className="h-14 flex-1 font-mono-semibold text-[24px] text-texte"
                />
                <Text className="font-sans text-[14px] text-texte-secondaire">{t('gauge.mm')}</Text>
              </View>
              <Text className="font-sans text-[12px] text-texte-secondaire">
                {t('gauge.serverHint')}
              </Text>
              {erreur && <Text className="font-sans text-[13px] text-danger">{erreur}</Text>}
            </View>
          )}

          {dernier && (
            <View className="gap-2 rounded-xl border border-bordure bg-surface p-4">
              <Ligne libelle={t('gauge.volume')} valeur={`${formatLitres(dernier.volumeCl)} L`} />
              {dernier.expectedCl !== null && (
                <Ligne
                  libelle={t('gauge.theoretical')}
                  valeur={`${formatLitres(dernier.expectedCl)} L`}
                />
              )}
              {dernier.varianceCl !== null && dernier.expectedCl !== null && (
                <Ligne
                  libelle={t('gauge.variance')}
                  valeur={`${dernier.varianceCl > 0 ? '+' : ''}${formatLitres(dernier.varianceCl)} L${dernier.expectedCl > 0 ? ` · ${formatPourcent((dernier.varianceCl / dernier.expectedCl) * 100)}` : ''}`}
                  couleur={
                    Math.abs(dernier.varianceCl) > dernier.expectedCl * 0.005
                      ? couleurs.accent
                      : couleurs.succes
                  }
                />
              )}
            </View>
          )}

          {cuve && (
            <Pressable
              accessibilityRole="button"
              disabled={enregistrement}
              onPress={() => void valider()}
              className="h-14 items-center justify-center rounded-lg bg-accent"
            >
              {enregistrement ? (
                <ActivityIndicator color={couleurs.accentTexte} />
              ) : (
                <Text className="font-sans-semibold text-[17px] text-accent-texte">
                  {t('gauge.validate')}
                </Text>
              )}
            </Pressable>
          )}

          {cuves && cuves.length > 1 && (
            <ListeEtapes
              titre={t('gauge.tanksOfStation')}
              libelles={{
                done: t('reading.done'),
                current: t('reading.inProgress'),
                todo: t('reading.todo'),
              }}
              etapes={cuves.map((c, i) => {
                const fait = resultats.find((r) => r.tankId === c.id);
                return {
                  id: c.id,
                  label: `${c.label} · ${t(`fuel.${c.fuel_product_code}`)}`,
                  etat: fait ? 'done' : i === courant ? 'current' : 'todo',
                  detail: fait ? heureCourte(fait.heure) : undefined,
                };
              })}
            />
          )}
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

function Ligne({
  libelle,
  valeur,
  couleur,
}: {
  libelle: string;
  valeur: string;
  couleur?: string;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="font-sans text-[13px] text-texte-secondaire">{libelle}</Text>
      <Text className="font-mono-semibold text-[16px]" style={{ color: couleur ?? couleurs.texte }}>
        {valeur}
      </Text>
    </View>
  );
}
