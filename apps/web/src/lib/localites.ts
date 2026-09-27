import type { Localite } from '@stationsure/core';

import { creerClientServeur } from '@/lib/supabase/server';

/** Référence des communes du Sénégal (lecture pour tout utilisateur connecté), triée par nom. */
export async function chargerLocalites(): Promise<Localite[]> {
  const supabase = await creerClientServeur();
  const [{ data: communes }, { data: departements }, { data: regions }] = await Promise.all([
    supabase.from('sn_communes').select('code, name, department_code').order('name'),
    supabase.from('sn_departments').select('code, name, region_code'),
    supabase.from('sn_regions').select('code, name'),
  ]);
  const dep = new Map((departements ?? []).map((d) => [d.code, d]));
  const reg = new Map((regions ?? []).map((r) => [r.code, r.name]));
  return (communes ?? []).map((c) => {
    const d = dep.get(c.department_code);
    return {
      code: c.code,
      nom: c.name,
      departement: d?.name ?? '',
      region: (d && reg.get(d.region_code)) ?? '',
    };
  });
}
