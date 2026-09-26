import { t } from '@stationsure/i18n';
import type { Metadata } from 'next';

import { EnTetePage } from '@/components/en-tete-page';
import { exigerContexteComplet } from '@/lib/auth/contexte';
import { creerClientServeur } from '@/lib/supabase/server';

import { BoutonActivation, FormulaireEmploye, FormulairePin } from './formulaires';

export const metadata: Metadata = { title: t('nav.employees') };

export default async function PageEmployes() {
  const contexte = await exigerContexteComplet();
  const supabase = await creerClientServeur();
  const [{ data: employes }, { data: avecPin }] = await Promise.all([
    supabase.from('employees').select('id, station_id, full_name, role, active').order('full_name'),
    supabase.rpc('employees_with_pin'),
  ]);
  const idsAvecPin = new Set((avecPin ?? []) as string[]);
  const liste = employes ?? [];

  return (
    <main className="flex min-w-0 grow flex-col gap-[22px] px-8 py-7">
      <EnTetePage
        titre={t('nav.employees')}
        sousTitre={t('employees.subtitle', { count: liste.length })}
      />
      {contexte.estProprietaire && <FormulaireEmploye stations={contexte.stations} />}
      {contexte.stations.map((station) => {
        const membres = liste.filter((e) => e.station_id === station.id);
        return (
          <section
            key={station.id}
            className="flex flex-col rounded-xl border border-bordure bg-surface"
          >
            <div className="border-b border-bordure px-[18px] py-4 text-[15px] font-semibold">
              {station.name}
            </div>
            {membres.length === 0 && (
              <p className="m-0 px-[18px] py-6 text-center text-[13px] text-texte-secondaire">
                {t('employees.none')}
              </p>
            )}
            {membres.map((employe) => (
              <div
                key={employe.id}
                className="grid min-h-[54px] grid-cols-[1.4fr_1fr_0.8fr_1.6fr] items-center gap-3 border-b border-bordure px-[18px] py-2 text-[14px] last:border-b-0"
              >
                <span
                  className={`font-semibold ${employe.active ? '' : 'text-texte-secondaire line-through'}`}
                >
                  {employe.full_name}
                </span>
                <span className="text-texte-secondaire">
                  {t(`pin.roles.${roleCle(employe.role)}`)}
                </span>
                <span
                  className={`text-[12px] font-semibold ${idsAvecPin.has(employe.id) ? 'text-succes' : 'text-danger'}`}
                >
                  {idsAvecPin.has(employe.id) ? t('employees.pinSet') : t('employees.pinMissing')}
                </span>
                <div className="flex items-center justify-end gap-2">
                  {contexte.estProprietaire && employe.active && (
                    <FormulairePin employeId={employe.id} dejaDefini={idsAvecPin.has(employe.id)} />
                  )}
                  {contexte.estProprietaire && (
                    <BoutonActivation
                      employeId={employe.id}
                      actif={employe.active}
                      nom={employe.full_name}
                    />
                  )}
                </div>
              </div>
            ))}
          </section>
        );
      })}
    </main>
  );
}

/** Clés i18n des rôles (pin.roles.*). */
function roleCle(role: string): string {
  return (
    {
      manager: 'manager',
      pump_attendant: 'pumpAttendant',
      shop_cashier: 'shop',
      mechanic: 'mechanic',
      washer: 'washer',
    }[role] ?? role
  );
}
