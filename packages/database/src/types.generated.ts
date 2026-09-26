/**
 * PLACEHOLDER — phase 0.
 * Ce fichier sera remplacé par la sortie de `pnpm --filter @stationsure/database gen:types`
 * (supabase gen types typescript --local) dès que les tables métier existeront (phase 1).
 * Ne pas éditer à la main.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
