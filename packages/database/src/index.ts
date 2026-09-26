import type { Database } from './types.generated';

export type { Database, Json } from './types.generated';

/** Schéma exposé par l'API Supabase. */
export type SchemaPublic = Database['public'];
