-- =============================================================================
-- 0008 — Transversal : alertes et rapprochements. Écrits par le serveur
-- (triggers / Edge Functions en service_role), lus par le propriétaire.
-- =============================================================================

create type public.alert_type as enum (
  'cash_variance', 'tank_variance', 'handover_mismatch', 'delivery_variance',
  'void_requested', 'missing_evidence', 'credit_limit', 'price_change',
  'blind_count_variance', 'unknown_device', 'other'
);
create type public.alert_severity as enum ('info', 'warning', 'critical');
create type public.reconciliation_kind as enum ('tank', 'cash', 'mobile_money');
create type public.reconciliation_status as enum ('ok', 'variance', 'pending');

-- -----------------------------------------------------------------------------
-- alerts
-- -----------------------------------------------------------------------------
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  shift_id uuid,
  type public.alert_type not null,
  severity public.alert_severity not null default 'warning',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users (id) on delete set null,
  foreign key (station_id, organization_id) references public.stations (id, organization_id) on delete restrict,
  foreign key (shift_id, station_id) references public.shifts (id, station_id) on delete restrict,
  check ((acknowledged_at is null) = (acknowledged_by is null))
);
comment on table public.alerts is 'Alertes propriétaire (écart caisse, cuve, passation…). Créées par le serveur ; le propriétaire ne peut qu''accuser réception.';
create index alerts_org_open_idx on public.alerts (organization_id, created_at desc) where acknowledged_at is null;
create index alerts_station_idx on public.alerts (station_id, created_at desc);

-- -----------------------------------------------------------------------------
-- reconciliations
-- -----------------------------------------------------------------------------
create table public.reconciliations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  shift_id uuid,
  kind public.reconciliation_kind not null,
  -- FCFA pour cash / mobile_money, cL pour tank.
  expected bigint not null,
  actual bigint not null,
  variance bigint generated always as (actual - expected) stored,
  status public.reconciliation_status not null default 'pending',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (station_id, organization_id) references public.stations (id, organization_id) on delete restrict,
  foreign key (shift_id, station_id) references public.shifts (id, station_id) on delete restrict
);
comment on table public.reconciliations is 'Résultats des rapprochements (cuve, caisse, mobile money). Calculés par le serveur. Append-only : un nouveau calcul est une nouvelle ligne.';
create index reconciliations_shift_idx on public.reconciliations (shift_id, kind);

select private.enable_append_only('public.reconciliations');

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.alerts enable row level security;
alter table public.reconciliations enable row level security;

-- alerts : lecture membres ; accusé de réception par l'owner (colonnes limitées) ;
-- aucune insertion / suppression côté client.
select private.policy_select_org('public.alerts');
create policy alerts_update_owner on public.alerts for update to authenticated
  using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id) and acknowledged_by = auth.uid());
revoke insert, update, delete on public.alerts from authenticated;
grant update (acknowledged_at, acknowledged_by) on public.alerts to authenticated;

-- reconciliations : lecture membres uniquement.
select private.policy_select_org('public.reconciliations');
revoke insert, update, delete on public.reconciliations from authenticated;
