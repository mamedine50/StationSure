'use client';

import type { GroupeModules, Module } from '@stationsure/core';
import { t } from '@stationsure/i18n';
import { useActionState } from 'react';

import { enregistrerModules, modifierEmploye, revenirAuModele } from '@/actions/employes';
import {
  BoutonPrincipal,
  Champ,
  ETAT_INITIAL,
  Message,
  Selecteur,
} from '@/components/ui/formulaire';

export function FormulaireFiche({
  employeId,
  typeId,
  telephone,
  types,
  rw,
}: {
  employeId: string;
  typeId: string;
  telephone: string;
  types: { id: string; name: string; system: boolean }[];
  rw: boolean;
}) {
  const [etat, action] = useActionState(modifierEmploye, ETAT_INITIAL);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="employeId" value={employeId} />
      <Selecteur label={t('employeePage.type')} name="typeId" defaultValue={typeId} disabled={!rw}>
        {types.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
            {x.system ? '' : ` · ${t('employeeTypes.custom')}`}
          </option>
        ))}
      </Selecteur>
      <Champ
        label={t('employeePage.phone')}
        name="telephone"
        type="tel"
        defaultValue={telephone}
        placeholder="+221 77 000 00 01"
        disabled={!rw}
      />
      <Message etat={etat} />
      {rw && (
        <BoutonPrincipal className="h-11 self-start px-4 text-[14px]">
          {t('common.save')}
        </BoutonPrincipal>
      )}
    </form>
  );
}

export function FormulaireModules({
  employeId,
  modules,
  modulesType,
  nomType,
  personnalise,
  groupes,
  inactifs,
  rw,
}: {
  employeId: string;
  modules: Module[];
  modulesType: Module[];
  nomType: string;
  personnalise: boolean;
  groupes: Record<GroupeModules, readonly Module[]>;
  inactifs: readonly Module[];
  rw: boolean;
}) {
  const [etat, action] = useActionState(enregistrerModules, ETAT_INITIAL);
  const [etatRetour, retour] = useActionState(revenirAuModele, ETAT_INITIAL);
  const effectifs = new Set(modules);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="employeId" value={employeId} />
      <div className="grid grid-cols-2 gap-4">
        {(Object.keys(groupes) as GroupeModules[]).map((g) => {
          const inactif = groupes[g].every((m) => inactifs.includes(m));
          return (
            <fieldset
              key={g}
              className={`m-0 flex flex-col gap-2 rounded-xl border px-4 py-3 ${inactif ? 'border-dashed border-bordure opacity-60' : 'border-bordure'}`}
            >
              <legend className="px-1 text-[12px] tracking-wider text-texte-secondaire">
                {t(`modules.groups.${g}`).toUpperCase()}
                {inactif ? ` · ${t('modules.soon')}` : ''}
              </legend>
              {groupes[g].map((m) => (
                <label key={m} className="flex items-center gap-3 text-[14px]">
                  <input
                    type="checkbox"
                    name={`module_${m}`}
                    defaultChecked={effectifs.has(m)}
                    disabled={!rw}
                    className="h-5 w-5 accent-accent"
                  />
                  <span>{t(`modules.${m}`)}</span>
                  {modulesType.includes(m) !== effectifs.has(m) && (
                    <span className="text-[11px] text-accent">{t('employeePage.custom')}</span>
                  )}
                </label>
              ))}
            </fieldset>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {rw && (
          <BoutonPrincipal className="h-11 px-4 text-[14px]">{t('common.save')}</BoutonPrincipal>
        )}
        {rw && personnalise && (
          <button type="submit" formAction={retour} className="text-[13px] text-accent underline">
            {t('employeePage.backToType', { type: nomType })}
          </button>
        )}
        <Message etat={etat.erreur || etat.succes ? etat : etatRetour} />
      </div>
    </form>
  );
}
