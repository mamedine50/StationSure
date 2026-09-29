import {
  GROUPES_MODULES,
  MODULES_INACTIFS,
  type GroupeModules,
  type Module,
} from '@stationsure/core';
import { t } from '@stationsure/i18n';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EnTetePage } from '@/components/en-tete-page';
import { exigerContexteComplet } from '@/lib/auth/contexte';
import { creerClientServeur } from '@/lib/supabase/server';

import { FormulaireType } from './formulaires';

export const metadata: Metadata = { title: t('employeeTypes.title') };

export default async function PageTypesEmployes() {
  const contexte = await exigerContexteComplet();
  const supabase = await creerClientServeur();
  const [{ data: types }, { data: employes }] = await Promise.all([
    supabase
      .from('employee_types')
      .select('id, code, name, modules, is_system, legacy_role')
      .order('is_system', { ascending: false })
      .order('position')
      .order('name'),
    supabase.from('employees').select('id, type_id'),
  ]);
  const rw = contexte.estProprietaire;
  const utilises = (typeId: string) => (employes ?? []).filter((e) => e.type_id === typeId).length;
  const libelleModules = (modules: string[]) =>
    modules.map((m) => t(`modules.short.${m}`)).join(' · ');
  return (
    <main className="flex min-w-0 grow flex-col gap-[22px] px-8 py-7">
      <div className="flex flex-col gap-1">
        <Link href="/employes" className="text-[13px]">
          {t('employeeTypes.back')}
        </Link>
        <EnTetePage titre={t('employeeTypes.title')} sousTitre={t('employeeTypes.subtitle')} />
      </div>
      <section className="flex flex-col rounded-xl border border-bordure bg-surface">
        {(types ?? []).map((x) => (
          <div
            key={x.id}
            className="grid grid-cols-[1.2fr_2.4fr_0.8fr_auto] items-center gap-3 border-b border-bordure px-[18px] py-3 text-[14px] last:border-b-0"
          >
            <span className="flex flex-col">
              <span className="font-semibold">
                {x.is_system ? t(`employeeTypes.${x.code}`) : x.name}
              </span>
              <span className="text-[12px] text-texte-secondaire">
                {x.is_system ? t('employeeTypes.system') : t('employeeTypes.custom')} ·{' '}
                <code>{x.code}</code>
              </span>
            </span>
            <span className="text-[13px] text-texte-secondaire">
              {libelleModules(x.modules as string[])}
            </span>
            <span className="text-[12px] text-texte-secondaire">
              {t('employeeTypes.inUse', { count: utilises(x.id) })}
            </span>
            <span>
              {!x.is_system && rw && (
                <FormulaireType
                  type={{ id: x.id, nom: x.name, code: x.code, modules: x.modules as Module[] }}
                  groupes={GROUPES_MODULES}
                  inactifs={MODULES_INACTIFS}
                  supprimable={utilises(x.id) === 0}
                />
              )}
            </span>
          </div>
        ))}
      </section>
      {rw && (
        <section className="flex flex-col gap-3 rounded-xl border border-bordure bg-surface p-[18px]">
          <h2 className="m-0 text-[15px] font-semibold">{t('employeeTypes.create')}</h2>
          <FormulaireType
            groupes={GROUPES_MODULES}
            inactifs={MODULES_INACTIFS}
            supprimable={false}
            ouvertParDefaut
          />
        </section>
      )}
    </main>
  );
}

export type { GroupeModules };
