import type { Ligne } from '@stationsure/database';

import { t } from '@stationsure/i18n';

import { supabase } from './supabase';

export type Pistolet = Pick<Ligne<'nozzles'>, 'id' | 'label' | 'pump_id' | 'tank_id' | 'active'> & {
  produit: string;
  pompe: string;
};
export type Cuve = Pick<
  Ligne<'tanks'>,
  'id' | 'label' | 'fuel_product_code' | 'capacity_cl' | 'active'
>;
export type Shift = Pick<
  Ligne<'shifts'>,
  'id' | 'status' | 'opened_by' | 'opened_at' | 'label' | 'fuel_closed_at'
>;

export async function chargerPistolets(): Promise<Pistolet[]> {
  const [{ data: nozzles }, { data: pumps }, { data: tanks }] = await Promise.all([
    supabase
      .from('nozzles')
      .select('id, label, pump_id, tank_id, active')
      .eq('active', true)
      .order('label'),
    supabase.from('pumps').select('id, label'),
    supabase.from('tanks').select('id, fuel_product_code'),
  ]);
  return (nozzles ?? []).map((n) => ({
    ...n,
    produit: tanks?.find((t) => t.id === n.tank_id)?.fuel_product_code ?? '',
    pompe: pumps?.find((p) => p.id === n.pump_id)?.label ?? '',
  }));
}

export async function chargerCuves(): Promise<Cuve[]> {
  const { data } = await supabase
    .from('tanks')
    .select('id, label, fuel_product_code, capacity_cl, active')
    .eq('active', true)
    .order('label');
  return data ?? [];
}

/** Shift courant de la station : opening, open ou closing le plus récent. */
export async function chargerShiftCourant(): Promise<Shift | null> {
  const { data } = await supabase
    .from('shifts')
    .select('id, status, opened_by, opened_at, label, fuel_closed_at')
    .in('status', ['opening', 'open', 'closing'])
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export interface Resultat<T = Record<string, unknown>> {
  ok: boolean;
  error?: string;
  [k: string]: unknown;
  data?: T;
}

export async function rpc<T = Record<string, unknown>>(
  nom: string,
  args: Record<string, unknown>,
): Promise<Resultat<T>> {
  const { data, error } = await (
    supabase.rpc as unknown as (
      n: string,
      a: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>
  )(nom, args);
  if (error) return { ok: false, error: error.message.split(':')[0] ?? error.message };
  if (data && typeof data === 'object' && 'ok' in (data as object)) return data as Resultat<T>;
  return { ok: true, data: data as T };
}

export function litresVersCl(texte: string): number | null {
  const propre = texte.replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(propre)) return null;
  return Math.round(Number(propre) * 100);
}

export interface StatutConfiguration {
  complete: boolean;
  /** Lignes lisibles : « Cuve 2 Gasoil : pas de barémage, aucun pistolet relié ». */
  manques: string[];
}

/** Écran 19 côté station : la même complétude que le web (RPC station_fuel_setup_status). */
export async function chargerStatutConfiguration(): Promise<StatutConfiguration | null> {
  const { data: devices } = await supabase.from('devices').select('station_id').limit(1);
  const stationId = devices?.[0]?.station_id;
  if (!stationId) return null;
  const res = await rpc<{
    complete: boolean;
    tanks: { label: string; fuel_product_code: string; missing: string[] }[];
    prices: { fuel_product_code: string; price_fcfa_per_litre: number | null }[];
  }>('station_fuel_setup_status', { p_station_id: stationId });
  const statut = (res.data ?? (res as unknown)) as {
    complete?: boolean;
    tanks?: { label: string; fuel_product_code: string; missing: string[] }[];
    prices?: { fuel_product_code: string; price_fcfa_per_litre: number | null }[];
  };
  if (typeof statut.complete !== 'boolean') return null;
  const manques: string[] = [];
  for (const cuve of statut.tanks ?? []) {
    if (cuve.missing.length > 0) {
      manques.push(
        t('shift.setupMissing', {
          tank: `${cuve.label} ${t(`fuel.${cuve.fuel_product_code}`)}`,
          missing: cuve.missing.map((m) => t(`fuelSetup.missing.${m}`)).join(', '),
        }),
      );
    }
  }
  const sansPrix = (statut.prices ?? []).filter((p) => p.price_fcfa_per_litre === null);
  if (sansPrix.length > 0) {
    manques.push(
      t('shift.setupPrices', {
        products: sansPrix.map((p) => t(`fuel.${p.fuel_product_code}`)).join(', '),
      }),
    );
  }
  if ((statut.tanks ?? []).length === 0) manques.push(t('fuelSetup.stepState.tanksNone'));
  return { complete: statut.complete, manques };
}

/** Tâches du shift (écran 21) : jamais de montant. */
export interface TacheShift {
  key: string;
  complete: boolean;
  done?: number;
  total?: number;
  available?: boolean;
  handover_id?: string;
  status?: string;
  incoming_name?: string;
  mine?: boolean;
}
export interface TachesShift {
  shift: {
    id: string;
    status: 'opening' | 'open' | 'closing';
    label: string | null;
    opened_at: string;
    opened_by: string;
    opened_by_name: string | null;
    fuel_closed_at: string | null;
  } | null;
  setup_complete: boolean;
  tasks: TacheShift[];
}

export async function chargerTaches(): Promise<TachesShift | null> {
  const res = await rpc<TachesShift>('shift_tasks', {});
  const data = (res.data ?? (res as unknown)) as Partial<TachesShift>;
  if (!Array.isArray(data.tasks)) return null;
  return {
    shift: data.shift ?? null,
    setup_complete: Boolean(data.setup_complete),
    tasks: data.tasks,
  };
}

export interface OperationRecente {
  at: string;
  kind: string;
  label: string;
  method: string | null;
  amount_fcfa: number;
}

/** Mes dernières opérations (les miennes uniquement). */
export async function chargerOperationsRecentes(limite = 5): Promise<OperationRecente[]> {
  const res = await rpc<OperationRecente[]>('my_recent_operations', { p_limit: limite });
  return Array.isArray(res.data) ? res.data : [];
}

/** Crée le shift (statut opening) ; le serveur refuse sans module « shift » (MODULE_NOT_GRANTED). */
export async function creerShift(
  appareil: {
    organizationId: string;
    stationId: string;
    deviceId: string;
  },
  employeeId: string,
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase
    .from('shifts')
    .insert({
      organization_id: appareil.organizationId,
      station_id: appareil.stationId,
      device_id: appareil.deviceId,
      opened_by: employeeId,
      opened_at: new Date().toISOString(),
      device_created_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error || !data) return { error: error?.message.split(':')[0] ?? 'ERREUR' };
  return { id: data.id };
}
