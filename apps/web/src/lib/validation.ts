import { validerPin } from '@stationsure/core';
import { z } from 'zod';

/** Schémas de validation des formulaires web. Les messages sont des clés i18n (`validation.*`). */

export const PLANS = ['solo', 'groupe', 'reseau'] as const;
export const ROLES_EMPLOYE = [
  'manager',
  'pump_attendant',
  'shop_cashier',
  'mechanic',
  'washer',
] as const;

const email = z.email({ error: 'validation.email' });
const motDePasse = z
  .string({ error: 'validation.required' })
  .min(8, { error: 'validation.passwordMin' });

export const schemaConnexion = z.object({
  email,
  motDePasse: z.string().min(1, { error: 'validation.required' }),
});

export const schemaInscription = z
  .object({ email, motDePasse, confirmation: z.string() })
  .refine((v) => v.motDePasse === v.confirmation, {
    error: 'validation.passwordMismatch',
    path: ['confirmation'],
  });

export const schemaMotDePasseOublie = z.object({ email });

export const schemaNouveauMotDePasse = z
  .object({ motDePasse, confirmation: z.string() })
  .refine((v) => v.motDePasse === v.confirmation, {
    error: 'validation.passwordMismatch',
    path: ['confirmation'],
  });

export const schemaOrganisation = z.object({
  nom: z
    .string()
    .trim()
    .min(2, { error: 'validation.nameMin' })
    .max(120, { error: 'validation.nameMax' }),
  plan: z.enum(PLANS, { error: 'validation.plan' }),
});

export const schemaStation = z.object({
  nom: z
    .string()
    .trim()
    .min(2, { error: 'validation.nameMin' })
    .max(80, { error: 'validation.nameMax' }),
  ville: z.string().trim().max(80, { error: 'validation.nameMax' }).optional().or(z.literal('')),
});

export const schemaEmploye = z.object({
  nomComplet: z
    .string()
    .trim()
    .min(2, { error: 'validation.nameMin' })
    .max(120, { error: 'validation.nameMax' }),
  role: z.enum(ROLES_EMPLOYE, { error: 'validation.role' }),
  stationId: z.uuid({ error: 'validation.station' }),
});

/** PIN : exactement 4 chiffres et non trivial (règle partagée avec packages/core et la base). */
export const schemaPin = z.string().superRefine((pin, ctx) => {
  const erreur = validerPin(pin);
  if (erreur === 'FORMAT') ctx.addIssue({ code: 'custom', message: 'validation.pinFormat' });
  if (erreur === 'TRIVIAL') ctx.addIssue({ code: 'custom', message: 'validation.pinTrivial' });
});

export const schemaDefinirPin = z.object({ employeId: z.uuid(), pin: schemaPin });

export const schemaCodeJumelage = z.object({ stationId: z.uuid({ error: 'validation.station' }) });

/** Première erreur d'un résultat zod, sous forme de clé i18n. */
export function premiereErreur(resultat: { success: false; error: z.ZodError }): string {
  return resultat.error.issues[0]?.message ?? 'validation.invalid';
}

/** Lit un FormData en objet de chaînes. */
export function lireFormulaire(formData: FormData): Record<string, string> {
  const objet: Record<string, string> = {};
  for (const [cle, valeur] of formData.entries()) {
    if (typeof valeur === 'string') objet[cle] = valeur;
  }
  return objet;
}
