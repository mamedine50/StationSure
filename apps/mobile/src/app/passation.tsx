import { formatLitres } from '@stationsure/core';
import { useTranslation } from '@stationsure/i18n/react';
import { couleurs } from '@stationsure/ui';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EnTeteEcran } from '@/components/liste-etapes';
import { rpc } from '@/lib/carburant';
import { contexteOperation } from '@/lib/contexte-operation';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

interface Handover {
  id: string;
  status: 'pending' | 'signed' | 'disputed';
  from_shift_id: string;
  outgoing_employee_id: string;
  incoming_employee_id: string;
  signed_out_at: string | null;
  discrepancies:
    | {
        label: string;
        variance_cl: number;
        index_outgoing_cl: number | null;
        index_incoming_cl: number | null;
      }[]
    | null;
}

interface Employe {
  id: string;
  full_name: string;
}

/**
 * Écran 03 — Passation contradictoire : le sortant relève et signe, l'entrant se connecte,
 * relève À L'AVEUGLE et signe ; le serveur compare (tolérance 0).
 */
export default function EcranPassation() {
  const { t } = useTranslation();
  const { session, deconnecterEmploye } = useSession();
  const router = useRouter();
  const params = useLocalSearchParams<{ shift: string; handover?: string }>();
  const ctx = contexteOperation(session);

  const [employes, setEmployes] = useState<Employe[]>([]);
  const [entrantId, setEntrantId] = useState<string | null>(null);
  const [handover, setHandover] = useState<Handover | null | undefined>(undefined);
  const [nbSortant, setNbSortant] = useState(0);
  const [nbEntrant, setNbEntrant] = useState(0);
  const [nbPistolets, setNbPistolets] = useState(0);
  const [comparaison, setComparaison] = useState<
    {
      label: string;
      index_outgoing_cl: number | null;
      index_incoming_cl: number | null;
      variance_cl: number | null;
    }[]
  >([]);
  const [motif, setMotif] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const charger = useCallback(async () => {
    if (!ctx) return;
    const { data: e } = await supabase
      .from('employees')
      .select('id, full_name')
      .eq('active', true)
      .neq('id', ctx.employeeId)
      .order('full_name');
    setEmployes(e ?? []);
    const { count } = await supabase
      .from('nozzles')
      .select('id', { count: 'exact', head: true })
      .eq('active', true);
    setNbPistolets(count ?? 0);
    let h: Handover | null = null;
    if (params.handover) {
      const { data } = await supabase
        .from('shift_handovers')
        .select(
          'id, status, from_shift_id, outgoing_employee_id, incoming_employee_id, signed_out_at, discrepancies',
        )
        .eq('id', params.handover)
        .maybeSingle();
      h = (data as Handover | null) ?? null;
    } else {
      const { data } = await supabase
        .from('shift_handovers')
        .select(
          'id, status, from_shift_id, outgoing_employee_id, incoming_employee_id, signed_out_at, discrepancies',
        )
        .eq('from_shift_id', params.shift ?? '')
        .in('status', ['pending', 'disputed'])
        .maybeSingle();
      h = (data as Handover | null) ?? null;
    }
    setHandover(h);
    if (h) {
      const { data: releves } = await supabase
        .from('meter_readings')
        .select('nozzle_id, handover_side')
        .eq('handover_id', h.id);
      const uniques = (side: string) =>
        new Set((releves ?? []).filter((r) => r.handover_side === side).map((r) => r.nozzle_id))
          .size;
      setNbSortant(uniques('outgoing'));
      setNbEntrant(uniques('incoming'));
      if (h.status === 'disputed') {
        const { data: c } = await supabase.rpc('compare_handover', { p_handover_id: h.id });
        setComparaison((c as typeof comparaison) ?? []);
      }
    }
  }, [ctx, params.handover, params.shift]);

  useFocusEffect(
    useCallback(() => {
      void charger();
    }, [charger]),
  );

  if (!ctx) return null;
  const estSortant = handover ? handover.outgoing_employee_id === ctx.employeeId : true;
  const estEntrant = handover ? handover.incoming_employee_id === ctx.employeeId : false;
  const nomDe = (id: string) =>
    employes.find((e) => e.id === id)?.full_name ??
    (id === ctx.employeeId ? ctx.employeeName : '…');

  const demarrer = async () => {
    if (!entrantId) return;
    setOccupe(true);
    const res = await rpc<{ handover_id: string }>('start_handover', {
      p_shift_id: params.shift,
      p_incoming_employee_id: entrantId,
    });
    setOccupe(false);
    if (!res.ok) return setErreur(t('common.error'));
    router.replace({
      pathname: '/passation',
      params: { shift: params.shift, handover: String(res.handover_id) },
    });
  };

  const signerSortant = async () => {
    if (!handover) return;
    setOccupe(true);
    const res = await rpc('sign_handover_outgoing', { p_handover_id: handover.id });
    setOccupe(false);
    if (!res.ok)
      return setErreur(
        res.error === 'HANDOVER_INCOMPLETE' ? t('reading.noPhotoNoHandover') : t('common.error'),
      );
    // Le sortant a signé : sa session se ferme, l'entrant se connecte avec son PIN.
    await deconnecterEmploye('handover');
  };

  const signerEntrant = async () => {
    if (!handover) return;
    setOccupe(true);
    setErreur(null);
    const res = await rpc<{ to_shift_id: string }>('sign_handover_incoming', {
      p_handover_id: handover.id,
    });
    setOccupe(false);
    if (res.ok) {
      setMessage(t('handover.done', { name: ctx.employeeName }));
      setTimeout(() => router.replace('/accueil'), 1500);
      return;
    }
    if (res.error === 'HANDOVER_MISMATCH') {
      await charger();
      return;
    }
    setErreur(
      res.error === 'HANDOVER_INCOMPLETE' ? t('reading.noPhotoNoHandover') : t('common.error'),
    );
  };

  const signaler = async () => {
    if (!handover) return;
    setOccupe(true);
    const res = await rpc('report_handover_discrepancy', {
      p_handover_id: handover.id,
      p_reason: motif,
    });
    setOccupe(false);
    if (!res.ok)
      return setErreur(
        res.error === 'REASON_REQUIRED' ? t('handover.reportReason') : t('common.error'),
      );
    setMessage(t('handover.reported'));
    setTimeout(() => router.replace('/accueil'), 1500);
  };

  return (
    <SafeAreaView className="flex-1 bg-fond">
      <ScrollView contentContainerClassName="gap-4 px-5 pb-6 pt-4">
        <EnTeteEcran
          titre={t('handover.title')}
          sousTitre={
            handover
              ? t('handover.subtitle', {
                  from: nomDe(handover.outgoing_employee_id),
                  to: nomDe(handover.incoming_employee_id),
                })
              : undefined
          }
          onRetour={() => router.replace('/accueil')}
        />

        {handover === undefined && <ActivityIndicator color={couleurs.accent} />}

        {/* Étape 0 : choisir l'entrant */}
        {handover === null && (
          <View className="gap-3">
            <Text className="font-sans-semibold text-[15px] text-texte">
              {t('handover.chooseIncoming')}
            </Text>
            {employes.map((e) => (
              <Pressable
                key={e.id}
                accessibilityRole="button"
                onPress={() => setEntrantId(e.id)}
                className={`min-h-[52px] justify-center rounded-lg border px-4 ${entrantId === e.id ? 'border-accent bg-accent-fond' : 'border-bordure bg-surface'}`}
              >
                <Text className="font-sans-semibold text-[15px] text-texte">{e.full_name}</Text>
              </Pressable>
            ))}
            <Bouton
              occupe={occupe}
              principal
              libelle={t('handover.start')}
              desactive={!entrantId}
              onPress={() => void demarrer()}
            />
          </View>
        )}

        {handover && (
          <View className="flex-row gap-3">
            <Carte
              titre={t('handover.outgoing')}
              nom={nomDe(handover.outgoing_employee_id)}
              etat={
                handover.signed_out_at
                  ? t('handover.signed', {
                      time: new Intl.DateTimeFormat('fr-SN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      }).format(new Date(handover.signed_out_at)),
                    })
                  : t('handover.waiting')
              }
              ok={!!handover.signed_out_at}
            />
            <Carte
              titre={t('handover.incoming')}
              nom={nomDe(handover.incoming_employee_id)}
              etat={
                handover.status === 'signed'
                  ? t('handover.signed', { time: '' })
                  : t('handover.waiting')
              }
              ok={handover.status === 'signed'}
            />
          </View>
        )}

        {/* Sortant : relevés puis signature */}
        {handover && estSortant && !handover.signed_out_at && (
          <View className="gap-3">
            <Text className="font-sans text-[13px] text-texte-secondaire">
              {t('handover.outgoingReadings')} · {nbSortant}/{nbPistolets}
            </Text>
            <Bouton
              occupe={occupe}
              libelle={t('reading.handoverTitle')}
              onPress={() =>
                router.push({
                  pathname: '/releves',
                  params: {
                    kind: 'handover',
                    shift: handover.from_shift_id,
                    handover: handover.id,
                    side: 'outgoing',
                  },
                })
              }
            />
            <Bouton
              occupe={occupe}
              principal
              libelle={t('handover.signOutgoing')}
              desactive={nbSortant < nbPistolets}
              onPress={() => void signerSortant()}
            />
          </View>
        )}
        {handover && estSortant && handover.signed_out_at && handover.status === 'pending' && (
          <View className="gap-3 rounded-lg border border-bordure bg-surface p-4">
            <Text className="font-sans text-[14px] text-texte">{t('handover.switchEmployee')}</Text>
            <Bouton
              occupe={occupe}
              principal
              libelle={t('home.changeEmployee')}
              onPress={() => void deconnecterEmploye('handover')}
            />
          </View>
        )}

        {/* Entrant : relevés à l'aveugle puis signature */}
        {handover && estEntrant && handover.status === 'pending' && handover.signed_out_at && (
          <View className="gap-3">
            <Text className="font-sans text-[13px] text-texte-secondaire">
              {t('handover.incomingReadings')} · {nbEntrant}/{nbPistolets}
            </Text>
            <Bouton
              occupe={occupe}
              libelle={t('reading.handoverTitle')}
              onPress={() =>
                router.push({
                  pathname: '/releves',
                  params: {
                    kind: 'handover',
                    shift: handover.from_shift_id,
                    handover: handover.id,
                    side: 'incoming',
                  },
                })
              }
            />
            <Bouton
              occupe={occupe}
              principal
              libelle={t('handover.signIncoming')}
              desactive={nbEntrant < nbPistolets}
              onPress={() => void signerEntrant()}
            />
          </View>
        )}

        {/* Écart : tableau + reprendre / signaler */}
        {handover && handover.status === 'disputed' && (
          <View className="gap-3">
            <View className="overflow-hidden rounded-lg border border-bordure bg-surface">
              <View className="flex-row border-b border-bordure px-4 py-2">
                <Text className="flex-1 font-sans text-[11px] tracking-widest text-texte-secondaire">
                  {t('handover.nozzle')}
                </Text>
                <Text className="w-28 text-right font-sans text-[11px] tracking-widest text-texte-secondaire">
                  {t('handover.outgoing')}
                </Text>
                <Text className="w-28 text-right font-sans text-[11px] tracking-widest text-texte-secondaire">
                  {t('handover.incoming')}
                </Text>
              </View>
              {comparaison.map((c) => (
                <View
                  key={c.label}
                  className="flex-row items-center border-b border-bordure bg-danger-fond px-4 py-3"
                >
                  <Text className="flex-1 font-sans-semibold text-[13px] text-[#FFB4A8]">
                    {c.label}
                  </Text>
                  <Text className="w-28 text-right font-mono text-[13px] text-texte">
                    {c.index_outgoing_cl !== null ? formatLitres(c.index_outgoing_cl) : '—'}
                  </Text>
                  <Text className="w-28 text-right font-mono-semibold text-[13px] text-danger">
                    {c.index_incoming_cl !== null ? formatLitres(c.index_incoming_cl) : '—'}
                  </Text>
                </View>
              ))}
            </View>
            {comparaison[0] && (
              <View className="gap-1 rounded-lg border border-danger-bordure bg-danger-fond p-4">
                <Text className="font-sans-semibold text-[14px] text-[#FFB4A8]">
                  {t('handover.mismatchTitle', {
                    value: formatLitres(Math.abs(comparaison[0].variance_cl ?? 0)),
                    nozzle: comparaison[0].label,
                  })}
                </Text>
                <Text className="font-sans text-[13px] leading-5 text-[#E8C9C3]">
                  {t('handover.mismatchBody')}
                </Text>
              </View>
            )}
            {estEntrant && (
              <>
                <View className="flex-row gap-3">
                  <Bouton
                    occupe={occupe}
                    libelle={t('handover.retakePhoto')}
                    onPress={() =>
                      router.push({
                        pathname: '/releves',
                        params: {
                          kind: 'handover',
                          shift: handover.from_shift_id,
                          handover: handover.id,
                          side: 'incoming',
                        },
                      })
                    }
                  />
                  <Bouton
                    occupe={occupe}
                    principal
                    libelle={t('handover.signIncoming')}
                    onPress={() => void signerEntrant()}
                  />
                </View>
                <TextInput
                  value={motif}
                  onChangeText={setMotif}
                  placeholder={t('handover.reportReason')}
                  placeholderTextColor={couleurs.bordureForte}
                  className="min-h-[48px] rounded-lg border border-bordure bg-surface px-3 font-sans text-[14px] text-texte"
                />
                <Bouton
                  occupe={occupe}
                  libelle={t('handover.reportConfirm')}
                  desactive={motif.trim().length < 3}
                  onPress={() => void signaler()}
                />
              </>
            )}
          </View>
        )}

        {message && <Text className="font-sans-semibold text-[14px] text-succes">{message}</Text>}
        {erreur && <Text className="font-sans text-[13px] text-danger">{erreur}</Text>}
        <Text className="mt-auto text-center font-sans text-[12px] leading-5 text-texte-secondaire">
          {t('handover.footer')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Carte({
  titre,
  nom,
  etat,
  ok,
}: {
  titre: string;
  nom: string;
  etat: string;
  ok: boolean;
}) {
  return (
    <View className="flex-1 gap-2 rounded-lg border border-bordure bg-surface p-3">
      <Text className="font-sans text-[11px] tracking-widest text-texte-secondaire">{titre}</Text>
      <Text className="font-sans-semibold text-[15px] text-texte">{nom}</Text>
      <Text className={`font-sans text-[12px] ${ok ? 'text-succes' : 'text-accent'}`}>
        {ok ? '✓ ' : ''}
        {etat}
      </Text>
    </View>
  );
}

function Bouton({
  libelle,
  onPress,
  principal,
  desactive,
  occupe,
}: {
  libelle: string;
  onPress: () => void;
  principal?: boolean;
  desactive?: boolean;
  occupe: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={desactive || occupe}
      className={`h-14 flex-1 items-center justify-center rounded-lg ${principal ? 'bg-accent' : 'border border-bordure-forte bg-surface'} ${desactive ? 'opacity-50' : ''}`}
    >
      {occupe ? (
        <ActivityIndicator color={principal ? couleurs.accentTexte : couleurs.texte} />
      ) : (
        <Text
          className={`font-sans-semibold text-[15px] ${principal ? 'text-accent-texte' : 'text-texte'}`}
        >
          {libelle}
        </Text>
      )}
    </Pressable>
  );
}
