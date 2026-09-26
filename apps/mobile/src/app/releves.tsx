import { formatLitres, litresToCl } from '@stationsure/core';
import { useTranslation } from '@stationsure/i18n/react';
import { couleurs } from '@stationsure/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { chargerPistolets, type Pistolet } from '@/lib/carburant';
import { contexteOperation } from '@/lib/contexte-operation';
import { creerPreuve } from '@/lib/preuves';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type Kind = 'open' | 'close' | 'handover';
type Side = 'outgoing' | 'incoming';

interface Fait {
  nozzleId: string;
  heure: string;
}

/**
 * Écran 02 — Relevé d'index photo : pour chaque pistolet actif, photo du totaliseur (caméra),
 * heure appareil + GPS, index en litres → centilitres, comparaison avec la dernière clôture.
 * Sert à l'ouverture (open), à la fermeture (close) et à la passation (handover, sortant / entrant à l'aveugle).
 */
export default function EcranReleves() {
  const { t } = useTranslation();
  const { session } = useSession();
  const router = useRouter();
  const params = useLocalSearchParams<{
    kind: Kind;
    shift: string;
    handover?: string;
    side?: Side;
  }>();
  const kind = (params.kind ?? 'open') as Kind;
  const ctx = contexteOperation(session);

  const [pistolets, setPistolets] = useState<Pistolet[] | null>(null);
  const [faits, setFaits] = useState<Fait[]>([]);
  const [courant, setCourant] = useState<number>(0);
  const [photo, setPhoto] = useState<PhotoPrise | null>(null);
  const [camera, setCamera] = useState(false);
  const [index, setIndex] = useState('');
  const [justification, setJustification] = useState('');
  const [precedent, setPrecedent] = useState<number | null | undefined>(undefined);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);

  const charger = useCallback(async () => {
    const liste = await chargerPistolets();
    let requete = supabase
      .from('meter_readings')
      .select('nozzle_id, device_created_at')
      .eq('kind', kind);
    requete =
      kind === 'handover'
        ? requete
            .eq('handover_id', params.handover ?? '')
            .eq('handover_side', params.side ?? 'outgoing')
        : requete.eq('shift_id', params.shift ?? '');
    const { data } = await requete;
    const dejaFaits = (data ?? []).map((r) => ({
      nozzleId: r.nozzle_id,
      heure: r.device_created_at,
    }));
    const premierAFaire = liste.findIndex((p) => !dejaFaits.some((f) => f.nozzleId === p.id));
    setPistolets(liste);
    setFaits(dejaFaits);
    setCourant(premierAFaire === -1 ? liste.length : premierAFaire);
  }, [kind, params.handover, params.shift, params.side]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void charger();
  }, [charger]);

  const pistolet = pistolets?.[courant] ?? null;
  const aveugle = kind === 'handover' && params.side === 'incoming';

  // Référence : dernier index de clôture connu (jamais demandé pour l'entrant d'une passation).
  useEffect(() => {
    if (!pistolet || aveugle) return;
    let annule = false;
    void supabase.rpc('last_closing_index', { p_nozzle_id: pistolet.id }).then(({ data }) => {
      if (annule) return;
      const ligne = (data as { index_cl: number }[] | null)?.[0];
      setPrecedent(ligne ? ligne.index_cl : null);
    });
    return () => {
      annule = true;
    };
  }, [pistolet, aveugle]);

  const indexCl = useMemo(() => {
    const propre = index.replace(/\s/g, '').replace(',', '.');
    return /^\d+(\.\d{1,2})?$/.test(propre) ? litresToCl(Number(propre)) : null;
  }, [index]);
  const ecart = indexCl !== null && typeof precedent === 'number' ? indexCl - precedent : null;

  const valider = async () => {
    if (!ctx || !pistolet || !pistolets) return;
    setErreur(null);
    if (!photo) return setErreur(t('reading.photoRequired'));
    if (indexCl === null) return setErreur(t('reading.indexRequired'));
    if (kind === 'open' && ecart !== null && ecart !== 0 && justification.trim().length < 3)
      return setErreur(t('reading.justification'));
    setEnregistrement(true);
    try {
      const evidenceId = await creerPreuve(
        { kind: 'meter_photo', uri: photo.uri, capturedAt: photo.capturedAt, gps: photo.gps },
        ctx,
      );
      const { error } = await supabase.from('meter_readings').insert({
        organization_id: ctx.organizationId,
        station_id: ctx.stationId,
        device_id: ctx.deviceId,
        employee_id: ctx.employeeId,
        shift_id: params.shift ?? '',
        nozzle_id: pistolet.id,
        kind,
        index_cl: indexCl,
        evidence_id: evidenceId,
        device_created_at: photo.capturedAt.toISOString(),
        gps_lat: photo.gps?.lat ?? null,
        gps_lng: photo.gps?.lng ?? null,
        justification: justification.trim() || null,
        handover_id: kind === 'handover' ? (params.handover ?? null) : null,
        handover_side: kind === 'handover' ? (params.side ?? null) : null,
      });
      if (error) {
        setErreur(
          error.message.startsWith('NOZZLE_PAUSED') ? t('reading.paused') : t('common.error'),
        );
        return;
      }
      const nouveauxFaits = [
        ...faits,
        { nozzleId: pistolet.id, heure: photo.capturedAt.toISOString() },
      ];
      const suivant = pistolets.findIndex((p) => !nouveauxFaits.some((f) => f.nozzleId === p.id));
      setFaits(nouveauxFaits);
      setPhoto(null);
      setIndex('');
      setJustification('');
      setPrecedent(undefined);
      setCourant(suivant === -1 ? pistolets.length : suivant);
    } finally {
      setEnregistrement(false);
    }
  };

  useEffect(() => {
    if (!pistolets || pistolets.length === 0 || courant < pistolets.length) return;
    // Tous les pistolets sont relevés : étape suivante selon le contexte.
    if (kind === 'open' || kind === 'close')
      router.replace({ pathname: '/jaugeage', params: { kind, shift: params.shift } });
    else
      router.replace({
        pathname: '/passation',
        params: { handover: params.handover, shift: params.shift },
      });
  }, [courant, pistolets, kind, params.shift, params.handover, router]);

  if (!ctx) return null;
  const titre =
    kind === 'open'
      ? t('reading.openTitle')
      : kind === 'close'
        ? t('reading.closeTitle')
        : t('reading.handoverTitle');
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
            titre={titre}
            sousTitre={ctx.employeeName}
            compteur={
              pistolets
                ? t('reading.progress', {
                    done: Math.min(courant + 1, pistolets.length),
                    total: pistolets.length,
                  })
                : undefined
            }
            onRetour={() => router.back()}
          />
          <BarreProgression
            ratio={pistolets && pistolets.length > 0 ? faits.length / pistolets.length : 0}
          />
          {pistolets === null && <ActivityIndicator color={couleurs.accent} />}

          {pistolet && (
            <View className="gap-3 rounded-xl border border-bordure bg-surface p-4">
              <View className="flex-row items-center justify-between">
                <Text className="font-display-semibold text-[18px] text-texte">
                  {t('reading.pump', { pump: pistolet.pompe, nozzle: pistolet.label })}
                </Text>
                <Text className="rounded-pilule bg-surface-2 px-2 py-1 font-sans-semibold text-[12px] text-info">
                  {t(`fuel.${pistolet.produit}`)}
                </Text>
              </View>
              <CartePhoto
                photo={photo}
                titre={t('reading.totalizer')}
                valeur={indexCl !== null ? formatLitres(indexCl) : undefined}
                onReprendre={() => setCamera(true)}
                station={ctx.stationName}
              />
              <Text className="font-sans text-[13px] text-texte-secondaire">
                {t('reading.indexLabel')}
              </Text>
              <View className="flex-row items-center rounded-lg border border-bordure bg-fond px-4">
                <TextInput
                  value={index}
                  onChangeText={setIndex}
                  keyboardType="decimal-pad"
                  placeholder="0,00"
                  placeholderTextColor={couleurs.bordureForte}
                  accessibilityLabel={t('reading.indexLabel')}
                  className="h-14 flex-1 font-mono-semibold text-[24px] text-texte"
                />
                <Text className="font-sans text-[14px] text-texte-secondaire">
                  {t('reading.litres')}
                </Text>
              </View>
              {aveugle ? (
                <Text className="font-sans text-[13px] text-texte-secondaire">
                  {t('reading.blind')}
                </Text>
              ) : precedent === undefined ? null : precedent === null ? (
                <Text className="font-sans text-[13px] text-texte-secondaire">
                  {t('reading.noPrevious')}
                </Text>
              ) : ecart === null ? null : ecart === 0 ? (
                <Text className="font-sans text-[13px] text-succes">
                  ✓ {t('reading.matches', { value: formatLitres(precedent) })}
                </Text>
              ) : (
                <View className="gap-2">
                  <Text className="font-sans text-[13px] text-accent">
                    {t('reading.mismatch', {
                      value: formatLitres(ecart),
                      previous: formatLitres(precedent),
                    })}
                  </Text>
                  {kind === 'open' && (
                    <TextInput
                      value={justification}
                      onChangeText={setJustification}
                      placeholder={t('reading.justification')}
                      placeholderTextColor={couleurs.bordureForte}
                      className="min-h-[48px] rounded-lg border border-accent bg-fond px-3 font-sans text-[14px] text-texte"
                    />
                  )}
                </View>
              )}
              {erreur && <Text className="font-sans text-[13px] text-danger">{erreur}</Text>}
            </View>
          )}

          {pistolet && (
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
                  {t('reading.validateNext')}
                </Text>
              )}
            </Pressable>
          )}

          {pistolets && (
            <ListeEtapes
              titre={t('reading.nozzlesOfStation')}
              libelles={{
                done: t('reading.done'),
                current: t('reading.inProgress'),
                todo: t('reading.todo'),
              }}
              etapes={pistolets.map((p, i) => {
                const fait = faits.find((f) => f.nozzleId === p.id);
                return {
                  id: p.id,
                  label: `${p.label} · ${t(`fuel.${p.produit}`)}`,
                  etat: fait ? 'done' : i === courant ? 'current' : 'todo',
                  detail: fait ? heureCourte(fait.heure) : undefined,
                };
              })}
            />
          )}
          <Text className="text-center font-sans text-[12px] text-texte-secondaire">
            {kind === 'handover' ? t('reading.noPhotoNoHandover') : t('reading.noPhotoNoShift')}
          </Text>
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
