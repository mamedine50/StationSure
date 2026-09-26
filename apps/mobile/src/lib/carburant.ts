import type { Ligne } from '@stationsure/database';

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
    .in('status', ['opening', 'open'])
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
