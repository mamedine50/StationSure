/**
 * Types générés depuis le schéma Supabase local :
 *   pnpm db:types   (= supabase gen types typescript --local --schema public)
 * Ne pas éditer types.generated.ts à la main.
 */
import type { Database } from './types.generated';

export type { Database, Json } from './types.generated';
export type { Tables, TablesInsert, TablesUpdate, Enums, CompositeTypes } from './types.generated';

/** Schéma exposé par l'API Supabase. */
export type SchemaPublic = Database['public'];

/** Noms des tables du schéma public. */
export type NomTable = keyof SchemaPublic['Tables'];

/** Noms des vues du schéma public. */
export type NomVue = keyof SchemaPublic['Views'];

/** Noms des enums Postgres. */
export type NomEnum = keyof SchemaPublic['Enums'];

/** Ligne d'une table (lecture). */
export type Ligne<T extends NomTable> = SchemaPublic['Tables'][T]['Row'];

/** Valeurs acceptées à l'insertion. */
export type Insertion<T extends NomTable> = SchemaPublic['Tables'][T]['Insert'];

/** Valeurs acceptées à la mise à jour (tables non append-only uniquement). */
export type MiseAJour<T extends NomTable> = SchemaPublic['Tables'][T]['Update'];

/** Valeur d'un enum Postgres. */
export type ValeurEnum<E extends NomEnum> = SchemaPublic['Enums'][E];

/** Raccourcis fréquents. */
export type Station = Ligne<'stations'>;
export type Employe = Ligne<'employees'>;
export type Appareil = Ligne<'devices'>;
export type Shift = Ligne<'shifts'>;
export type ReleveIndex = Ligne<'meter_readings'>;
export type Transaction = Ligne<'transactions'>;
export type Paiement = Ligne<'payments'>;
export type Alerte = Ligne<'alerts'>;
export type RoleEmploye = ValeurEnum<'employee_role'>;
export type MethodePaiement = ValeurEnum<'payment_method'>;
