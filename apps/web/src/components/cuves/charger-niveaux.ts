import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@stationsure/database';

import type { NiveauCuve } from './niveau';

/** Appelle tank_levels (serveur) et met les lignes au format des composants client. */
export async function chargerNiveaux(
  supabase: SupabaseClient<Database>,
  stationId?: string | null,
): Promise<NiveauCuve[]> {
  const { data, error } = await supabase.rpc(
    'tank_levels',
    stationId ? { p_station_id: stationId } : {},
  );
  if (error) console.error('tank_levels', error.message);
  return (data ?? []).map((r) => ({
    tankId: r.tank_id,
    stationId: r.station_id,
    label: r.label,
    produit: r.fuel_product_code,
    capaciteCl: Number(r.capacity_cl),
    mesureCl: r.measured_cl === null ? null : Number(r.measured_cl),
    mesureA: r.measured_at,
    theoriqueCl: r.theoretical_cl === null ? null : Number(r.theoretical_cl),
    ecartCl: r.variance_cl === null ? null : Number(r.variance_cl),
    ecartPct: r.variance_pct === null ? null : Number(r.variance_pct),
    ventesJourCl: Number(r.daily_sales_cl ?? 0),
    autonomieJours: r.autonomy_days === null ? null : Number(r.autonomy_days),
    seuilPct: Number(r.reorder_threshold_pct),
    seuilCl: Number(r.reorder_cl),
    sousSeuil: Boolean(r.below_threshold),
  }));
}
