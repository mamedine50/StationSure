-- =============================================================================
-- 0005 — Opérations carburant : shifts, relevés d'index, passations,
-- jaugeages, livraisons.
-- Convention des tables opérationnelles : organization_id, station_id,
-- device_id, employee_id, device_created_at (appareil), created_at (serveur).
-- =============================================================================

create type public.shift_status as enum ('open', 'closing', 'closed');
create type public.meter_reading_kind as enum ('open', 'close', 'handover');
create type public.handover_status as enum ('pending', 'signed', 'disputed');

-- -----------------------------------------------------------------------------
-- shifts
-- -----------------------------------------------------------------------------
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  device_id uuid not null,
  opened_by uuid not null,
  closed_by uuid,
  opened_at timestamptz not null,
  closed_at timestamptz,
  status public.shift_status not null default 'open',
  device_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (station_id, organization_id) references public.stations (id, organization_id) on delete restrict,
  foreign key (device_id, station_id) references public.devices (id, station_id) on delete restrict,
  foreign key (opened_by, station_id) references public.employees (id, station_id) on delete restrict,
  foreign key (closed_by, station_id) references public.employees (id, station_id) on delete restrict,
  unique (id, station_id),
  check ((status = 'closed') = (closed_at is not null)),
  check (closed_at is null or closed_at >= opened_at)
);
comment on table public.shifts is 'Shifts d''une station. Un shift clos est figé (trigger).';
comment on column public.shifts.opened_by is 'Employé qui a ouvert le shift (gérant ou pompiste).';
create index shifts_station_status_idx on public.shifts (station_id, status, opened_at desc);

-- Un shift ne peut qu'avancer : open → closing → closed, puis plus rien.
create or replace function private.guard_shift_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'closed' then
    raise exception 'SHIFT_CLOSED: un shift clôturé ne se modifie plus' using errcode = 'P0001';
  end if;
  if old.status = 'closing' and new.status = 'open' then
    raise exception 'SHIFT_TRANSITION: retour de closing vers open interdit' using errcode = 'P0001';
  end if;
  if new.station_id <> old.station_id or new.organization_id <> old.organization_id
     or new.opened_by <> old.opened_by or new.opened_at <> old.opened_at
     or new.device_id <> old.device_id then
    raise exception 'SHIFT_IMMUTABLE: station, ouverture et appareil ne se modifient pas' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger guard_shift_transition before update on public.shifts
  for each row execute function private.guard_shift_transition();

-- -----------------------------------------------------------------------------
-- meter_readings : relevés d'index par pistolet, photo obligatoire.
-- -----------------------------------------------------------------------------
create table public.meter_readings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  device_id uuid not null,
  employee_id uuid not null,
  shift_id uuid not null,
  nozzle_id uuid not null,
  kind public.meter_reading_kind not null,
  index_cl bigint not null check (index_cl >= 0),
  evidence_id uuid not null,
  device_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (station_id, organization_id) references public.stations (id, organization_id) on delete restrict,
  foreign key (device_id, station_id) references public.devices (id, station_id) on delete restrict,
  foreign key (employee_id, station_id) references public.employees (id, station_id) on delete restrict,
  foreign key (shift_id, station_id) references public.shifts (id, station_id) on delete restrict,
  foreign key (nozzle_id, station_id) references public.nozzles (id, station_id) on delete restrict,
  foreign key (evidence_id, station_id) references public.evidence_files (id, station_id) on delete restrict,
  unique (id, station_id)
);
comment on table public.meter_readings is 'Index du totaliseur (cL) relevés à l''ouverture, la clôture et la passation. Photo obligatoire (evidence_id). Append-only.';
create index meter_readings_nozzle_idx on public.meter_readings (nozzle_id, device_created_at desc);
create index meter_readings_shift_idx on public.meter_readings (shift_id);

-- -----------------------------------------------------------------------------
-- shift_handovers : passation contradictoire.
-- -----------------------------------------------------------------------------
create table public.shift_handovers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  device_id uuid not null,
  from_shift_id uuid not null,
  to_shift_id uuid,
  outgoing_employee_id uuid not null,
  incoming_employee_id uuid not null,
  status public.handover_status not null default 'pending',
  signed_out_at timestamptz,
  signed_in_at timestamptz,
  device_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (station_id, organization_id) references public.stations (id, organization_id) on delete restrict,
  foreign key (device_id, station_id) references public.devices (id, station_id) on delete restrict,
  foreign key (from_shift_id, station_id) references public.shifts (id, station_id) on delete restrict,
  foreign key (to_shift_id, station_id) references public.shifts (id, station_id) on delete restrict,
  foreign key (outgoing_employee_id, station_id) references public.employees (id, station_id) on delete restrict,
  foreign key (incoming_employee_id, station_id) references public.employees (id, station_id) on delete restrict,
  check (to_shift_id is null or to_shift_id <> from_shift_id),
  check (outgoing_employee_id <> incoming_employee_id),
  check (status <> 'signed' or (signed_out_at is not null and signed_in_at is not null))
);
comment on table public.shift_handovers is 'Passation : sortant et entrant valident les mêmes index (tolérance 0). Tout écart = disputed + alerte.';
create index shift_handovers_station_idx on public.shift_handovers (station_id, created_at desc);

-- -----------------------------------------------------------------------------
-- tank_readings : jaugeage, volume calculé côté serveur depuis le barémage.
-- -----------------------------------------------------------------------------
create table public.tank_readings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  device_id uuid not null,
  employee_id uuid not null,
  tank_id uuid not null,
  height_mm integer not null check (height_mm >= 0),
  volume_cl bigint not null check (volume_cl >= 0),
  evidence_id uuid not null,
  device_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (station_id, organization_id) references public.stations (id, organization_id) on delete restrict,
  foreign key (device_id, station_id) references public.devices (id, station_id) on delete restrict,
  foreign key (employee_id, station_id) references public.employees (id, station_id) on delete restrict,
  foreign key (tank_id, station_id) references public.tanks (id, station_id) on delete restrict,
  foreign key (evidence_id, station_id) references public.evidence_files (id, station_id) on delete restrict
);
comment on table public.tank_readings is 'Jaugeages. volume_cl est TOUJOURS recalculé par le serveur depuis tank_calibrations (la valeur client est ignorée). Append-only.';
create index tank_readings_tank_idx on public.tank_readings (tank_id, device_created_at desc);

create or replace function private.compute_tank_reading_volume()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.volume_cl := public.volume_from_calibration(new.tank_id, new.height_mm);
  return new;
end;
$$;
create trigger compute_tank_reading_volume before insert on public.tank_readings
  for each row execute function private.compute_tank_reading_volume();

-- -----------------------------------------------------------------------------
-- fuel_deliveries : réception de livraison, jauge avant / après, bon photographié.
-- -----------------------------------------------------------------------------
create table public.fuel_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  device_id uuid not null,
  employee_id uuid not null,
  tank_id uuid not null,
  supplier text,
  invoice_ref text,
  invoiced_cl bigint not null check (invoiced_cl > 0),
  before_cl bigint not null check (before_cl >= 0),
  after_cl bigint not null check (after_cl >= 0),
  received_cl bigint generated always as (after_cl - before_cl) stored,
  evidence_id uuid not null,
  device_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (station_id, organization_id) references public.stations (id, organization_id) on delete restrict,
  foreign key (device_id, station_id) references public.devices (id, station_id) on delete restrict,
  foreign key (employee_id, station_id) references public.employees (id, station_id) on delete restrict,
  foreign key (tank_id, station_id) references public.tanks (id, station_id) on delete restrict,
  foreign key (evidence_id, station_id) references public.evidence_files (id, station_id) on delete restrict,
  check (after_cl >= before_cl)
);
comment on table public.fuel_deliveries is 'Livraisons carburant : volume facturé vs reçu (jauge après − avant). Écart > 0,3 % = réserve + alerte. Append-only.';
create index fuel_deliveries_tank_idx on public.fuel_deliveries (tank_id, device_created_at desc);

-- -----------------------------------------------------------------------------
-- updated_at, append-only
-- -----------------------------------------------------------------------------
select private.enable_updated_at('public.shifts');
select private.enable_updated_at('public.shift_handovers');

select private.enable_append_only('public.meter_readings');
select private.enable_append_only('public.tank_readings');
select private.enable_append_only('public.fuel_deliveries');

-- -----------------------------------------------------------------------------
-- RLS : lecture membres + appareil (sa station) ; insertion appareil ; mise à jour
-- appareil uniquement pour les tables à statut.
-- -----------------------------------------------------------------------------
alter table public.shifts enable row level security;
alter table public.meter_readings enable row level security;
alter table public.shift_handovers enable row level security;
alter table public.tank_readings enable row level security;
alter table public.fuel_deliveries enable row level security;

select private.policy_select_org('public.shifts');
select private.policy_select_device('public.shifts');
select private.policy_insert_device('public.shifts');
select private.policy_update_device('public.shifts');
revoke delete on public.shifts from authenticated;

select private.policy_select_org('public.meter_readings');
select private.policy_select_device('public.meter_readings');
select private.policy_insert_device('public.meter_readings');
revoke update, delete on public.meter_readings from authenticated;

select private.policy_select_org('public.shift_handovers');
select private.policy_select_device('public.shift_handovers');
select private.policy_insert_device('public.shift_handovers');
select private.policy_update_device('public.shift_handovers');
revoke delete on public.shift_handovers from authenticated;

select private.policy_select_org('public.tank_readings');
select private.policy_select_device('public.tank_readings');
select private.policy_insert_device('public.tank_readings');
revoke update, delete on public.tank_readings from authenticated;

select private.policy_select_org('public.fuel_deliveries');
select private.policy_select_device('public.fuel_deliveries');
select private.policy_insert_device('public.fuel_deliveries');
revoke update, delete on public.fuel_deliveries from authenticated;
