'use client';

import { lireEntetesCsv, lireReleveMobileMoney, type MappingReleve } from '@stationsure/core';
import { t } from '@stationsure/i18n';
import { useRouter } from 'next/navigation';
import { useActionState, useMemo, useState } from 'react';

import { importerReleve } from '@/actions/caisse';
import { BoutonPrincipal, ETAT_INITIAL, Message, Selecteur } from '@/components/ui/formulaire';
import { FORMATS_DATE, OPERATEURS_MM } from '@/lib/validation';

export function SelecteurStationCaisse({
  stations,
  stationId,
}: {
  stations: { id: string; name: string }[];
  stationId: string;
}) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-[13px] text-texte-secondaire">
      {t('cashPage.station')}
      <select
        value={stationId}
        onChange={(e) => router.push(`/caisse?station=${e.target.value}`)}
        className="h-10 rounded-md border border-bordure bg-surface px-3 text-[14px] text-texte"
      >
        <option value="all">{t('common.all')}</option>
        {stations.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Import d'un relevé marchand CSV : les colonnes sont mappées à l'import (les formats varient). */
export function ImportReleve() {
  const [etat, action] = useActionState(importerReleve, ETAT_INITIAL);
  const [texte, setTexte] = useState('');
  const [nomFichier, setNomFichier] = useState('');
  const [mapping, setMapping] = useState<MappingReleve>({
    reference: '',
    montant: '',
    date: '',
    formatDate: 'iso',
  });
  const colonnes = useMemo(() => lireEntetesCsv(texte), [texte]);
  const lecture = useMemo(
    () =>
      texte && mapping.reference && mapping.montant && mapping.date
        ? lireReleveMobileMoney(texte, mapping)
        : null,
    [texte, mapping],
  );
  const lignes =
    lecture?.lignes.map((l) => ({
      reference: l.reference,
      amount_fcfa: l.montantFcfa,
      paid_at: l.payeLe.toISOString(),
      raw: l.brut,
    })) ?? [];

  const charger = async (f: File) => {
    const contenu = await f.text();
    setNomFichier(f.name);
    setTexte(contenu);
    const cols = lireEntetesCsv(contenu);
    const sansAccents = (v: string) =>
      v
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    const devine = (motifs: string[]) =>
      cols.find((c) => motifs.some((m) => sansAccents(c).includes(m))) ?? '';
    setMapping({
      reference: devine(['ref', 'transaction', 'id']),
      montant: devine(['montant', 'amount', 'somme']),
      date: devine(['date', 'heure', 'time']),
      formatDate: 'iso',
    });
  };

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="fichier" value={nomFichier} />
      <input type="hidden" name="mapping" value={JSON.stringify(mapping)} />
      <input type="hidden" name="lignes" value={JSON.stringify(lignes)} />
      <div className="grid grid-cols-2 gap-3">
        <Selecteur label={t('cashPage.provider')} name="operateur">
          {OPERATEURS_MM.map((o) => (
            <option key={o} value={o}>
              {o === 'wave' ? 'Wave' : 'Orange Money'}
            </option>
          ))}
        </Selecteur>
        <label className="flex flex-col gap-1.5 text-[13px] text-texte-secondaire">
          <span>{t('cashPage.file')}</span>
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={(e) => e.target.files?.[0] && void charger(e.target.files[0])}
            className="text-[13px]"
          />
        </label>
      </div>
      {colonnes.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {(['reference', 'montant', 'date'] as const).map((champ) => (
            <label key={champ} className="flex flex-col gap-1 text-[12px] text-texte-secondaire">
              {t(
                `cashPage.map${champ === 'reference' ? 'Reference' : champ === 'montant' ? 'Amount' : 'Date'}`,
              )}
              <select
                value={mapping[champ]}
                onChange={(e) => setMapping({ ...mapping, [champ]: e.target.value })}
                className="h-10 rounded-md border border-bordure bg-fond px-2 text-[13px] text-texte"
              >
                <option value="">—</option>
                {colonnes.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="flex flex-col gap-1 text-[12px] text-texte-secondaire">
            {t('cashPage.dateFormat')}
            <select
              value={mapping.formatDate}
              onChange={(e) =>
                setMapping({
                  ...mapping,
                  formatDate: e.target.value as (typeof FORMATS_DATE)[number],
                })
              }
              className="h-10 rounded-md border border-bordure bg-fond px-2 text-[13px] text-texte"
            >
              {FORMATS_DATE.map((f) => (
                <option key={f} value={f}>
                  {t(`cashPage.date${f === 'iso' ? 'Iso' : f === 'dmy' ? 'Dmy' : 'Epoch'}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {lecture && (
        <span className="text-[12px] text-texte-secondaire">
          {t('cashPage.preview', {
            count: lecture.lignes.length,
            rejected: lecture.lignesRejetees.length,
          })}
        </span>
      )}
      <Message etat={etat} />
      <BoutonPrincipal className="h-10 self-start px-3 text-[13px]">
        {t('cashPage.import')}
      </BoutonPrincipal>
    </form>
  );
}
