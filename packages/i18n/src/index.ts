import i18next, { type i18n as I18nInstance, type TFunction } from 'i18next';

import en from './locales/en.json';
import fr from './locales/fr.json';

export const LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_PAR_DEFAUT: Locale = 'fr';

/** Ressources typées : `en` doit exposer exactement les mêmes clés que `fr`. */
export const resources = {
  fr: { translation: fr },
  en: { translation: en satisfies typeof fr },
} as const;

export type Traductions = typeof fr;

/**
 * Crée une instance i18next initialisée de façon SYNCHRONE (initAsync: false).
 * Utilisable côté serveur (Next.js, composants serveur) comme côté client.
 */
export function creerI18n(locale: Locale = LOCALE_PAR_DEFAUT): I18nInstance {
  const instance = i18next.createInstance();
  void instance.init({
    lng: locale,
    fallbackLng: LOCALE_PAR_DEFAUT,
    supportedLngs: LOCALES,
    resources,
    initAsync: false,
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return instance;
}

/** Instance partagée (français par défaut). */
export const i18n: I18nInstance = creerI18n();

/** Fonction de traduction de l'instance partagée. */
export const t: TFunction = i18n.t.bind(i18n);

export function changerLocale(locale: Locale): Promise<TFunction> {
  return i18n.changeLanguage(locale);
}
