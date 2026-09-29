'use client';

import type { GroupeModules, Module } from '@stationsure/core';
import { t } from '@stationsure/i18n';
import { useActionState, useState } from 'react';

import { enregistrerTypeEmploye, supprimerTypeEmploye } from '@/actions/employes';
import { BoutonPrincipal, Champ, ETAT_INITIAL, Message } from '@/components/ui/formulaire';

export function FormulaireType({
  type,
  groupes,
  inactifs,
  supprimable,
  ouvertParDefaut = false,
}: {
  type?: { id: string; nom: string; code: string; modules: Module[] };
  groupes: Record<GroupeModules, readonly Module[]>;
  inactifs: readonly Module[];
  supprimable: boolean;
  ouvertParDefaut?: boolean;
}) {
  const [ouvert, setOuvert] = useState(ouvertParDefaut);
  const [etat, action] = useActionState(enregistrerTypeEmploye, ETAT_INITIAL);
  const [etatSuppr, supprimer] = useActionState(supprimerTypeEmploye, ETAT_INITIAL);
  if (!ouvert) {
    return (
      <button type="button" onClick={() => setOuvert(true)} className="text-[13px] text-accent">
        {t('stations.edit')}
      </button>
    );
  }
  return (
    <form
      action={action}
      className="col-span-4 flex flex-col gap-3 rounded-md border border-bordure bg-surface-2 p-3"
    >
      {type && <input type="hidden" name="typeId" value={type.id} />}
      <div className="grid grid-cols-2 gap-3">
        <Champ
          label={t('employeeTypes.name')}
          name="nom"
          defaultValue={type?.nom ?? ''}
          minLength={2}
          maxLength={60}
          required
        />
        <Champ
          label={t('employeeTypes.code')}
          name="code"
          defaultValue={type?.code ?? ''}
          pattern="[a-z][a-z0-9_]{1,40}"
          required
          className="font-mono"
        />
      </div>
      <span className="text-[13px] text-texte-secondaire">{t('employeeTypes.modulesOf')}</span>
      <div className="grid grid-cols-2 gap-3">
        {(Object.keys(groupes) as GroupeModules[]).map((g) => (
          <fieldset
            key={g}
            className="m-0 flex flex-col gap-1 rounded-md border border-bordure px-3 py-2"
          >
            <legend className="px-1 text-[11px] tracking-wider text-texte-secondaire">
              {t(`modules.groups.${g}`).toUpperCase()}
              {groupes[g].every((m) => inactifs.includes(m)) ? ` · ${t('modules.soon')}` : ''}
            </legend>
            {groupes[g].map((m) => (
              <label key={m} className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  name="modules"
                  value={m}
                  defaultChecked={type?.modules.includes(m) ?? false}
                  className="h-5 w-5 accent-accent"
                />
                {t(`modules.${m}`)}
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      <Message etat={etat.erreur || etat.succes ? etat : etatSuppr} />
      <div className="flex flex-wrap gap-2">
        <BoutonPrincipal className="h-11 px-4 text-[14px]">{t('common.save')}</BoutonPrincipal>
        {type && (
          <button
            type="button"
            onClick={() => setOuvert(false)}
            className="h-11 rounded-lg border border-bordure-forte px-4 text-[14px] text-texte"
          >
            {t('common.close')}
          </button>
        )}
        {type && (
          <button
            type="submit"
            formAction={(fd) => {
              fd.set('id', type.id);
              supprimer(fd);
            }}
            disabled={!supprimable}
            title={supprimable ? undefined : t('employeeTypes.cannotDelete')}
            className="h-11 rounded-lg border border-danger-bordure px-4 text-[14px] text-danger disabled:opacity-40"
          >
            {t('employeeTypes.delete')}
          </button>
        )}
      </div>
    </form>
  );
}
