'use client';

import { type Localite, rechercherLocalites } from '@stationsure/core';
import { t } from '@stationsure/i18n';
import { useId, useState } from 'react';

/**
 * Liste déroulante avec recherche des communes du Sénégal (« Kao » → Kaolack) + option « Autre »
 * avec saisie libre. Émet deux champs de formulaire : `communeCode` (code ou « autre ») et `ville`.
 */
export function ChampVille({
  localites,
  communeCode = '',
  ville = '',
  label = t('cities.label'),
}: {
  localites: Localite[];
  communeCode?: string;
  ville?: string;
  label?: string;
}) {
  const id = useId();
  const initiale = localites.find((l) => l.code === communeCode) ?? null;
  const [choix, setChoix] = useState<Localite | null>(initiale);
  const [autre, setAutre] = useState(!initiale && ville !== '');
  const [requete, setRequete] = useState('');
  const [ouvert, setOuvert] = useState(false);
  const resultats = ouvert ? rechercherLocalites(requete, localites, 8) : [];
  const champ =
    'h-12 w-full rounded-md border border-bordure bg-surface px-3 text-[14px] text-texte placeholder:text-texte-secondaire focus:border-accent focus:outline-none';

  return (
    <div className="flex flex-col gap-1.5 text-[13px] text-texte-secondaire">
      <span>{label}</span>
      <input type="hidden" name="communeCode" value={choix ? choix.code : autre ? 'autre' : ''} />
      {choix ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-accent bg-accent-fond px-3 py-2">
          <span className="text-[14px] text-texte">
            <strong>{choix.nom}</strong> · {choix.departement} · {choix.region}
          </span>
          <button
            type="button"
            onClick={() => {
              setChoix(null);
              setRequete('');
            }}
            className="text-[13px] text-accent"
          >
            {t('cities.clear')}
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            id={id}
            type="text"
            role="combobox"
            aria-expanded={ouvert}
            aria-controls={`${id}-liste`}
            aria-autocomplete="list"
            autoComplete="off"
            value={requete}
            placeholder={t('cities.placeholder')}
            onChange={(e) => {
              setRequete(e.target.value);
              setOuvert(true);
            }}
            onFocus={() => setOuvert(true)}
            onBlur={() => setTimeout(() => setOuvert(false), 150)}
            className={champ}
          />
          {ouvert && requete.trim() && (
            <ul
              id={`${id}-liste`}
              role="listbox"
              className="absolute left-0 right-0 top-[52px] z-20 m-0 max-h-72 list-none overflow-auto rounded-md border border-bordure bg-surface p-1 shadow-lg"
            >
              {resultats.map((l) => (
                <li key={l.code} role="option" aria-selected={false}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setChoix(l);
                      setAutre(false);
                      setOuvert(false);
                    }}
                    className="flex w-full flex-col rounded-sm px-3 py-2 text-left hover:bg-surface-2"
                  >
                    <span className="text-[14px] text-texte">{l.nom}</span>
                    <span className="text-[12px] text-texte-secondaire">
                      {l.departement} · {l.region}
                    </span>
                  </button>
                </li>
              ))}
              {resultats.length === 0 && (
                <li className="px-3 py-2 text-[13px] text-texte-secondaire">
                  {t('cities.noResult')}
                </li>
              )}
              <li role="option" aria-selected={autre}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setAutre(true);
                    setOuvert(false);
                  }}
                  className="flex w-full rounded-sm px-3 py-2 text-left text-[13px] text-accent hover:bg-surface-2"
                >
                  {t('cities.other')}
                </button>
              </li>
            </ul>
          )}
        </div>
      )}
      {!choix && (
        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={autre}
            onChange={(e) => setAutre(e.target.checked)}
            className="h-5 w-5 accent-accent"
          />
          {t('cities.other')}
        </label>
      )}
      {!choix && autre && (
        <input
          type="text"
          name="ville"
          defaultValue={ville}
          placeholder={t('cities.otherLabel')}
          aria-label={t('cities.otherLabel')}
          minLength={2}
          maxLength={80}
          required
          className={champ}
        />
      )}
      <span className="text-[11px]">{t('cities.source')}</span>
    </div>
  );
}
