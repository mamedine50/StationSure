import { GROUPES_MODULES, MODULES_INACTIFS, type Module, ongletsVisibles } from '@stationsure/core';
import { t } from '@stationsure/i18n';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { EnTetePage } from '@/components/en-tete-page';
import { exigerContexteComplet } from '@/lib/auth/contexte';
import { creerClientServeur } from '@/lib/supabase/server';

import { BoutonActivation, FormulairePin } from '../formulaires';
import { FormulaireFiche, FormulaireModules } from './formulaires';

export const metadata: Metadata = { title: t('nav.employees') };

const dateHeure = new Intl.DateTimeFormat('fr-SN', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Africa/Dakar',
});

export default async function PageFicheEmploye({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contexte = await exigerContexteComplet();
  const supabase = await creerClientServeur();
  const [
    { data: employe },
    { data: types },
    { data: overrides },
    { data: historique },
    { data: membres },
    { data: avecPin },
    { data: modulesEffectifs },
  ] = await Promise.all([
    supabase
      .from('employees')
      .select('id, full_name, station_id, active, type_id, phone_e164')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('employee_types')
      .select('id, code, name, modules, is_system, organization_id')
      .order('is_system', { ascending: false })
      .order('position'),
    supabase.from('employee_module_overrides').select('module, granted').eq('employee_id', id),
    supabase.rpc('employee_rights_history', { p_employee_id: id }),
    supabase.rpc('member_labels'),
    supabase.rpc('employees_with_pin'),
    supabase.rpc('employee_modules', { p_employee_id: id }),
  ]);
  if (!employe) notFound();
  const type = (types ?? []).find((x) => x.id === employe.type_id) ?? null;
  const modules = (modulesEffectifs ?? []) as Module[];
  const personnalise = (overrides ?? []).length > 0;
  const station = contexte.stations.find((s) => s.id === employe.station_id);
  const rw = contexte.estProprietaire;
  const nomMembre = (userId: string | null) => {
    if (userId === contexte.utilisateur.id) return t('employeePage.you');
    return (membres ?? []).find((m) => m.user_id === userId)?.email ?? '—';
  };
  const onglets = ongletsVisibles(modules);

  return (
    <main className="flex min-w-0 grow flex-col gap-[22px] px-8 py-7">
      <div className="flex flex-col gap-1">
        <Link href="/employes" className="text-[13px]">
          {t('employeePage.back')}
        </Link>
        <EnTetePage
          titre={employe.full_name}
          sousTitre={`${station?.name ?? ''} · ${employe.active ? t('employeePage.active') : t('employeePage.inactive')}`}
        />
      </div>
      <div className="grid grid-cols-[1fr_1.7fr] gap-4">
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-3 rounded-xl border border-bordure bg-surface p-[18px]">
            <h2 className="m-0 text-[15px] font-semibold">{t('employeePage.info')}</h2>
            <FormulaireFiche
              employeId={employe.id}
              typeId={employe.type_id}
              telephone={employe.phone_e164 ?? ''}
              types={(types ?? []).map((x) => ({
                id: x.id,
                name: x.is_system ? t(`employeeTypes.${x.code}`) : x.name,
                system: x.is_system,
              }))}
              rw={rw}
            />
            <Link href="/employes/types" className="text-[13px]">
              {t('employeeTypes.manage')}
            </Link>
            {rw && (
              <div className="flex flex-wrap items-center gap-2">
                <FormulairePin
                  employeId={employe.id}
                  dejaDefini={((avecPin ?? []) as string[]).includes(employe.id)}
                />
                <BoutonActivation
                  employeId={employe.id}
                  actif={employe.active}
                  nom={employe.full_name}
                />
              </div>
            )}
          </section>
          <section className="flex flex-col gap-2 rounded-xl border border-bordure bg-surface p-[18px]">
            <h2 className="m-0 text-[15px] font-semibold">🔒 {t('employeePage.lockedTitle')}</h2>
            <p className="m-0 text-[13px] text-texte-secondaire">{t('employeePage.lockedText')}</p>
          </section>
          <section className="flex flex-col gap-2 rounded-xl border border-bordure bg-surface p-[18px]">
            <h2 className="m-0 text-[15px] font-semibold">{t('employeePage.history')}</h2>
            {(historique ?? []).length === 0 && (
              <p className="m-0 text-[13px] text-texte-secondaire">
                {t('employeePage.historyEmpty')}
              </p>
            )}
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px] text-texte-secondaire">
              {(historique ?? []).map((h, i) => {
                const d = (h.details ?? {}) as {
                  type_name?: string;
                  type_code?: string;
                  module?: string;
                };
                const typeNom =
                  d.type_code &&
                  [
                    'gerant',
                    'chef_de_piste',
                    'pompiste',
                    'caissier_boutique',
                    'mecanicien',
                    'laveur',
                    'gardien_nuit',
                    'adjoint_station',
                  ].includes(d.type_code)
                    ? t(`employeeTypes.${d.type_code}`)
                    : (d.type_name ?? '');
                return (
                  <li key={i}>
                    {dateHeure.format(new Date(h.at))} · {nomMembre(h.actor_user_id)} ·{' '}
                    {t(`employeePage.events.${h.action}`, {
                      type: typeNom,
                      module: d.module ? t(`modules.${d.module}`) : '',
                    })}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
        <section className="flex flex-col gap-4 rounded-xl border border-bordure bg-surface p-[18px]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="m-0 text-[17px] font-semibold">{t('employeePage.modulesTitle')}</h2>
            {personnalise && (
              <span className="rounded-pilule bg-accent-fond px-3 py-1 text-[12px] font-semibold text-accent">
                {t('employeePage.custom')}
              </span>
            )}
          </div>
          <FormulaireModules
            employeId={employe.id}
            modules={modules}
            modulesType={(type?.modules ?? []) as Module[]}
            nomType={type ? (type.is_system ? t(`employeeTypes.${type.code}`) : type.name) : ''}
            personnalise={personnalise}
            groupes={GROUPES_MODULES}
            inactifs={MODULES_INACTIFS}
            rw={rw}
          />
          <p className="m-0 rounded-lg border border-bordure bg-fond px-4 py-3 text-[13px] text-texte-secondaire">
            ⓘ{' '}
            {t('employeePage.preview', {
              count: onglets.length,
              tabs: onglets.map((o) => t(`tabs.${o}`)).join(', '),
            })}
          </p>
        </section>
      </div>
    </main>
  );
}
