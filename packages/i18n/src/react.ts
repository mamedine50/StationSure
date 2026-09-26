/**
 * Point d'entrée React (client / React Native) : branche react-i18next sur l'instance partagée.
 * À importer une fois au démarrage de l'app (ex : apps/mobile/src/app/_layout.tsx).
 */
import { initReactI18next, useTranslation as useTranslationBase } from 'react-i18next';

import { i18n } from './index';

export { I18nextProvider, Trans } from 'react-i18next';
export { i18n } from './index';

let initialise = false;

/** Enregistre le plugin React sur l'instance partagée (idempotent). */
export function initialiserI18nReact(): typeof i18n {
  if (!initialise) {
    i18n.use(initReactI18next);
    void i18n.init();
    initialise = true;
  }
  return i18n;
}

/** Hook de traduction lié à l'instance partagée. */
export function useTranslation() {
  return useTranslationBase(undefined, { i18n });
}
