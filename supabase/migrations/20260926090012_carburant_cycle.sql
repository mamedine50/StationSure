-- =============================================================================
-- 0012 — Cycle carburant : versions de barémage, preuves confirmées, relevés
-- d'index (régression, pause), jaugeages (volume serveur, rapprochement),
-- ouverture / fermeture de shift, passation à l'aveugle, réception de livraison.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A. Versions de barémage : on ne remplace jamais une table, on publie une
-- nouvelle version ; chaque jaugeage est calculé avec la version en vigueur à
-- sa date.
-- -----------------------------------------------------------------------------
create table public.tank_calibration_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  tank_id uuid not null,
  version integer not null,
  effective_from timestamptz not null default now(),
  certificate_path text,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (tank_id, station_id) references public.tanks (id, station_id) on delete cascade,
  foreign key (station_id, organization_id) references public.stations (id, organization_id) on delete restrict,
  unique (tank_id, version),
  unique (id, tank_id)
);
comment on table public.tank_calibration_versions is 'Versions successives du barémage d''une cuve. Append-only : une correction est une nouvelle version.';
comment on column public.tank_calibration_versions.certificate_path is 'Chemin Storage (bucket evidence, dossier {org}/{station}/calibration/) du certificat PDF.';
create index tank_calibration_versions_tank_idx on public.tank_calibration_versions (tank_id, effective_from desc);

-- Reprise de l'existant : chaque cuve ayant des points reçoit une version 1.
alter table public.tank_calibrations add column version_id uuid;
insert into public.tank_calibration_versions (organization_id, station_id, tank_id, version, effective_from, note)
select c.organization_id, c.station_id, c.tank_id, 1, '2000-01-01'::timestamptz, 'Version initiale (reprise phase 1)'
from public.tank_calibrations c
group by c.organization_id, c.station_id, c.tank_id;
update public.tank_calibrations c
set version_id = v.id
from public.tank_calibration_versions v
where v.tank_id = c.tank_id and v.version = 1;
alter table public.tank_calibrations alter column version_id set not null;
alter table public.tank_calibrations drop constraint tank_calibrations_tank_id_height_mm_key;
alter table public.tank_calibrations
  add constraint tank_calibrations_version_fk foreign key (version_id, tank_id)
    references public.tank_calibration_versions (id, tank_id) on delete cascade,
  add constraint tank_calibrations_version_height_key unique (version_id, height_mm);
comment on table public.tank_calibrations is 'Points de barémage (mm → cL) d''une version. Écrits uniquement par create_calibration_version(). Append-only.';

-- Les points et les versions ne se modifient plus après publication.
drop trigger if exists touch_updated_at on public.tank_calibrations;
select private.enable_append_only('public.tank_calibrations');
select private.enable_append_only('public.tank_calibration_versions');
select private.enable_audit('public.tank_calibration_versions');
revoke insert, update, delete on public.tank_calibrations from authenticated;
revoke insert, update, delete on public.tank_calibration_versions from authenticated;
drop policy if exists tank_calibrations_insert_owner on public.tank_calibrations;
drop policy if exists tank_calibrations_update_owner on public.tank_calibrations;
drop policy if exists tank_calibrations_delete_owner on public.tank_calibrations;
alter table public.tank_calibration_versions enable row level security;
select private.policy_select_org('public.tank_calibration_versions');
select private.policy_select_device('public.tank_calibration_versions');

-- Validation d'une table : ≥ 2 points, hauteurs uniques ≥ 0, volumes ≥ 0 STRICTEMENT croissants.
-- Miroir de packages/core/src/baremage.ts (validerBaremage).
create or replace function private.validate_calibration_points(p_points jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  r record;
  v_prev_h integer := null;
  v_prev_v bigint := null;
  v_count integer := 0;
begin
  if p_points is null or jsonb_typeof(p_points) <> 'array' then
    raise exception 'CALIBRATION_INVALID: liste de points attendue' using errcode = '22023';
  end if;
  for r in
    select (p ->> 'height_mm')::numeric as h, (p ->> 'volume_cl')::numeric as v
    from jsonb_array_elements(p_points) p
    order by (p ->> 'height_mm')::numeric
  loop
    v_count := v_count + 1;
    if r.h is null or r.h < 0 or r.h <> trunc(r.h) then
      raise exception 'CALIBRATION_HEIGHT: hauteur invalide (%)', r.h using errcode = '22023';
    end if;
    if r.v is null or r.v < 0 or r.v <> trunc(r.v) then
      raise exception 'CALIBRATION_VOLUME: volume invalide (%)', r.v using errcode = '22023';
    end if;
    if v_prev_h is not null and r.h = v_prev_h then
      raise exception 'CALIBRATION_DUPLICATE: hauteur % mm en double', r.h using errcode = '22023';
    end if;
    if v_prev_v is not null and r.v <= v_prev_v then
      raise exception 'CALIBRATION_NOT_INCREASING: le volume doit croître strictement (à % mm)', r.h using errcode = '22023';
    end if;
    v_prev_h := r.h;
    v_prev_v := r.v;
  end loop;
  if v_count < 2 then
    raise exception 'CALIBRATION_TOO_FEW: au moins 2 points sont requis' using errcode = '22023';
  end if;
end;
$$;

-- Publication d'une nouvelle version (owner). Points : [{"height_mm": 0, "volume_cl": 0}, …].
create or replace function public.create_calibration_version(
  p_tank_id uuid,
  p_points jsonb,
  p_certificate_path text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tank record;
  v_version integer;
  v_id uuid;
begin
  select t.id, t.organization_id, t.station_id into v_tank from public.tanks t where t.id = p_tank_id;
  if v_tank is null or not public.is_org_owner(v_tank.organization_id) then
    raise exception 'FORBIDDEN: seul le propriétaire publie un barémage' using errcode = '42501';
  end if;
  perform private.validate_calibration_points(p_points);
  if p_certificate_path is not null
     and p_certificate_path not like v_tank.organization_id::text || '/' || v_tank.station_id::text || '/calibration/%' then
    raise exception 'CERTIFICATE_PATH: le certificat doit être dans le dossier calibration de la station' using errcode = '22023';
  end if;
  select coalesce(max(v.version), 0) + 1 into v_version
  from public.tank_calibration_versions v where v.tank_id = p_tank_id;
  insert into public.tank_calibration_versions (organization_id, station_id, tank_id, version, certificate_path, note, created_by)
  values (v_tank.organization_id, v_tank.station_id, p_tank_id, v_version, p_certificate_path, p_note, auth.uid())
  returning id into v_id;
  insert into public.tank_calibrations (organization_id, station_id, tank_id, version_id, height_mm, volume_cl)
  select v_tank.organization_id, v_tank.station_id, p_tank_id, v_id, (p ->> 'height_mm')::integer, (p ->> 'volume_cl')::bigint
  from jsonb_array_elements(p_points) p;
  return v_id;
end;
$$;
comment on function public.create_calibration_version(uuid, jsonb, text, text) is 'Owner : publie une nouvelle version de barémage (validée : ≥ 2 points, hauteurs uniques, volumes strictement croissants). Les anciennes versions restent utilisées pour les jaugeages passés.';
revoke all on function public.create_calibration_version(uuid, jsonb, text, text) from public, anon;
grant execute on function public.create_calibration_version(uuid, jsonb, text, text) to authenticated;

-- volume_from_calibration avec date : version en vigueur à p_at.
create or replace function public.calibration_version_at(p_tank_id uuid, p_at timestamptz default now())
returns uuid
language sql
stable
set search_path = ''
as $$
  select v.id from public.tank_calibration_versions v
  where v.tank_id = p_tank_id and v.effective_from <= p_at
  order by v.effective_from desc, v.version desc
  limit 1;
$$;
revoke all on function public.calibration_version_at(uuid, timestamptz) from public, anon;
grant execute on function public.calibration_version_at(uuid, timestamptz) to authenticated, service_role;

create or replace function public.volume_from_calibration(p_tank_id uuid, p_height_mm integer, p_at timestamptz default now())
returns bigint
language plpgsql
stable
set search_path = ''
as $$
declare
  v_version uuid;
  v_low record;
  v_high record;
  v_min integer;
  v_max integer;
begin
  if p_height_mm is null then
    raise exception 'BAREMAGE_HAUTEUR_NULLE' using errcode = '22023';
  end if;
  v_version := public.calibration_version_at(p_tank_id, p_at);
  select min(c.height_mm), max(c.height_mm) into v_min, v_max
  from public.tank_calibrations c where c.version_id = v_version;
  if v_min is null then
    raise exception 'BAREMAGE_TABLE_VIDE: aucune table de barémage pour la cuve %', p_tank_id using errcode = 'P0001';
  end if;
  if p_height_mm < v_min or p_height_mm > v_max then
    raise exception 'BAREMAGE_HORS_TABLE: hauteur % mm hors de [% ; %] mm', p_height_mm, v_min, v_max using errcode = 'P0001';
  end if;
  select c.height_mm, c.volume_cl into v_low from public.tank_calibrations c
  where c.version_id = v_version and c.height_mm <= p_height_mm order by c.height_mm desc limit 1;
  if v_low.height_mm = p_height_mm then
    return v_low.volume_cl;
  end if;
  select c.height_mm, c.volume_cl into v_high from public.tank_calibrations c
  where c.version_id = v_version and c.height_mm > p_height_mm order by c.height_mm asc limit 1;
  return round(
    v_low.volume_cl
    + (p_height_mm - v_low.height_mm)::numeric * (v_high.volume_cl - v_low.volume_cl) / (v_high.height_mm - v_low.height_mm)
  )::bigint;
end;
$$;
drop function if exists public.volume_from_calibration(uuid, integer);
revoke all on function public.volume_from_calibration(uuid, integer, timestamptz) from public, anon;
grant execute on function public.volume_from_calibration(uuid, integer, timestamptz) to authenticated, service_role;

-- Certificat PDF : l'owner peut déposer dans {org}/{station}/calibration/.
create policy evidence_objects_insert_owner_calibration on storage.objects for insert to authenticated
  with check (
    bucket_id = 'evidence'
    and (storage.foldername(name))[3] = 'calibration'
    and public.is_org_owner(private.try_uuid((storage.foldername(name))[1]))
    and private.try_uuid((storage.foldername(name))[2]) in (select public.current_station_ids())
  );

-- -----------------------------------------------------------------------------
-- B. Preuves : confirmation d'upload. Une opération reste « en attente de preuve »
-- tant que le fichier n'est pas dans le bucket.
-- -----------------------------------------------------------------------------
create table public.evidence_uploads (
  evidence_id uuid primary key references public.evidence_files (id) on delete cascade,
  organization_id uuid not null,
  station_id uuid not null,
  object_size bigint,
  uploaded_at timestamptz not null default now()
);
comment on table public.evidence_uploads is 'Confirmation serveur qu''une preuve est bien dans le bucket evidence (vérifiée dans storage.objects). Append-only.';
select private.enable_append_only('public.evidence_uploads');
alter table public.evidence_uploads enable row level security;
select private.policy_select_org('public.evidence_uploads');
select private.policy_select_device('public.evidence_uploads');
revoke insert, update, delete on public.evidence_uploads from authenticated;

create or replace function public.confirm_evidence_upload(p_evidence_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ev record;
  v_obj record;
begin
  select e.* into v_ev from public.evidence_files e
  where e.id = p_evidence_id and e.station_id = public.current_device_station_id();
  if v_ev is null then
    raise exception 'EVIDENCE_NOT_FOUND' using errcode = 'P0002';
  end if;
  select o.id, (o.metadata ->> 'size')::bigint as size into v_obj
  from storage.objects o where o.bucket_id = 'evidence' and o.name = v_ev.storage_path;
  if v_obj is null then
    return jsonb_build_object('ok', false, 'error', 'OBJECT_MISSING');
  end if;
  insert into public.evidence_uploads (evidence_id, organization_id, station_id, object_size)
  values (p_evidence_id, v_ev.organization_id, v_ev.station_id, v_obj.size)
  on conflict (evidence_id) do nothing;
  return jsonb_build_object('ok', true, 'size', v_obj.size);
end;
$$;
comment on function public.confirm_evidence_upload(uuid) is 'Appareil : vérifie que le fichier de la preuve est dans le bucket et l''enregistre comme reçue. Le sha256 n''est pas recalculé côté serveur (voir docs).';
revoke all on function public.confirm_evidence_upload(uuid) from public, anon;
grant execute on function public.confirm_evidence_upload(uuid) to authenticated;

create or replace function public.evidence_is_uploaded(p_evidence_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.evidence_uploads u where u.evidence_id = p_evidence_id);
$$;
revoke all on function public.evidence_is_uploaded(uuid) from public, anon;
grant execute on function public.evidence_is_uploaded(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- C. Contexte appareil + session employé (utilisé par toutes les RPC mobiles).
-- -----------------------------------------------------------------------------
create or replace function private.device_context()
returns table (device_id uuid, station_id uuid, organization_id uuid, employee_id uuid, employee_role public.employee_role, employee_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_device_id uuid := public.current_device_id();
  v_employee uuid := public.current_employee_id();
begin
  if v_device_id is null then
    raise exception 'DEVICE_NOT_PAIRED' using errcode = '42501';
  end if;
  if v_employee is null then
    raise exception 'NO_EMPLOYEE_SESSION: aucun employé connecté sur cet appareil' using errcode = '42501';
  end if;
  return query
    select d.id, d.station_id, d.organization_id, e.id, e.role, e.full_name
    from public.devices d join public.employees e on e.id = v_employee
    where d.id = v_device_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- D. Shifts : ouverture en deux temps (opening → open par RPC), fermeture carburant.
-- -----------------------------------------------------------------------------
alter table public.shifts alter column status set default 'opening';
alter table public.shifts add column fuel_closed_at timestamptz;
alter table public.shifts add column label text;
comment on column public.shifts.fuel_closed_at is 'Relevés et jaugeages de fermeture complets (statut closing). La clôture de caisse (phase 4) passera le shift en closed.';

-- Nouveau garde : opening → open uniquement via open_shift() ; open → closing uniquement via close_shift_fuel() ou passation.
create or replace function private.guard_shift_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'closed' then
    raise exception 'SHIFT_CLOSED: un shift clôturé ne se modifie plus' using errcode = 'P0001';
  end if;
  if new.status <> old.status then
    if not (
      (old.status = 'opening' and new.status in ('open', 'closing'))
      or (old.status = 'open' and new.status in ('closing', 'closed'))
      or (old.status = 'closing' and new.status = 'closed')
    ) then
      raise exception 'SHIFT_TRANSITION: passage % → % interdit', old.status, new.status using errcode = 'P0001';
    end if;
    if new.status in ('open', 'closing') and coalesce(current_setting('app.shift_rpc', true), '') <> 'on' then
      raise exception 'SHIFT_RPC_ONLY: utilisez open_shift(), close_shift_fuel() ou la passation' using errcode = 'P0001';
    end if;
  end if;
  if new.station_id <> old.station_id or new.organization_id <> old.organization_id
     or new.opened_by <> old.opened_by or new.opened_at <> old.opened_at
     or new.device_id <> old.device_id then
    raise exception 'SHIFT_IMMUTABLE: station, ouverture et appareil ne se modifient pas' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- E. Relevés d'index : justification, régression, pause pendant dépotage,
-- passation (côté sortant / entrant).
-- -----------------------------------------------------------------------------
alter table public.meter_readings
  add column handover_id uuid,
  add column handover_side public.handover_side,
  add column justification text,
  add column previous_index_cl bigint,
  add column flagged_regression boolean not null default false,
  add column gps_lat numeric(9, 6),
  add column gps_lng numeric(9, 6);
alter table public.meter_readings
  add constraint meter_readings_handover_check check ((kind = 'handover') = (handover_id is not null and handover_side is not null));
comment on column public.meter_readings.previous_index_cl is 'Dernier index connu du pistolet au moment de l''insertion (posé par le serveur).';
comment on column public.meter_readings.flagged_regression is 'Vrai si l''index est inférieur au précédent : accepté (hors ligne) mais alerte meter_regression.';
comment on column public.meter_readings.justification is 'Obligatoire quand l''index d''ouverture ne concorde pas avec la dernière clôture.';

alter table public.shift_handovers
  add column discrepancies jsonb,
  add column discrepancy_reported boolean not null default false,
  add column discrepancy_reason text,
  add column attributed_shift_id uuid references public.shifts (id) on delete restrict,
  add column created_by_session_id uuid references public.employee_sessions (id) on delete set null;
alter table public.meter_readings
  add constraint meter_readings_handover_fk foreign key (handover_id) references public.shift_handovers (id) on delete restrict;
create index meter_readings_handover_idx on public.meter_readings (handover_id, handover_side, nozzle_id) where handover_id is not null;

-- Dernier index connu d'un pistolet (tous types de relevés), avant une date.
create or replace function public.last_meter_index(p_nozzle_id uuid, p_before timestamptz default now())
returns table (index_cl bigint, kind public.meter_reading_kind, at timestamptz, reading_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select m.index_cl, m.kind, m.device_created_at, m.id
  from public.meter_readings m
  where m.nozzle_id = p_nozzle_id and m.device_created_at < p_before
    and m.nozzle_id in (select n.id from public.nozzles n where n.station_id in (select public.current_station_ids()))
  order by m.device_created_at desc, m.created_at desc
  limit 1;
$$;
revoke all on function public.last_meter_index(uuid, timestamptz) from public, anon;
grant execute on function public.last_meter_index(uuid, timestamptz) to authenticated, service_role;

-- Dernier index de CLÔTURE (close ou handover sortant) : la référence pour un relevé d'ouverture.
create or replace function public.last_closing_index(p_nozzle_id uuid)
returns table (index_cl bigint, at timestamptz, shift_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select m.index_cl, m.device_created_at, m.shift_id
  from public.meter_readings m
  where m.nozzle_id = p_nozzle_id
    and (m.kind = 'close' or (m.kind = 'handover' and m.handover_side = 'outgoing'))
    and m.nozzle_id in (select n.id from public.nozzles n where n.station_id in (select public.current_station_ids()))
  order by m.device_created_at desc, m.created_at desc
  limit 1;
$$;
revoke all on function public.last_closing_index(uuid) from public, anon;
grant execute on function public.last_closing_index(uuid) to authenticated, service_role;

-- Sessions de livraison (état mutable pendant la réception) — créées ici car
-- nozzle_is_paused y fait référence ; RPC en section G.
create table public.fuel_delivery_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  device_id uuid not null,
  employee_id uuid not null,
  tank_id uuid not null,
  shift_id uuid,
  status public.delivery_status not null default 'gauging_before',
  supplier text,
  truck_plate text,
  driver_name text,
  invoice_ref text,
  invoiced_cl bigint check (invoiced_cl is null or invoiced_cl > 0),
  before_reading_id uuid,
  after_reading_id uuid,
  invoice_evidence_id uuid,
  arrived_at timestamptz not null default now(),
  unloading_started_at timestamptz,
  unloading_ended_at timestamptz,
  signed_at timestamptz,
  delivery_id uuid,
  device_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (station_id, organization_id) references public.stations (id, organization_id) on delete restrict,
  foreign key (device_id, station_id) references public.devices (id, station_id) on delete restrict,
  foreign key (employee_id, station_id) references public.employees (id, station_id) on delete restrict,
  foreign key (tank_id, station_id) references public.tanks (id, station_id) on delete restrict,
  foreign key (shift_id, station_id) references public.shifts (id, station_id) on delete restrict,
  foreign key (invoice_evidence_id, station_id) references public.evidence_files (id, station_id) on delete restrict
);
comment on table public.fuel_delivery_sessions is 'Réception de livraison en cours (4 étapes). Le résultat signé est figé dans fuel_deliveries.';
create unique index fuel_delivery_sessions_active_idx on public.fuel_delivery_sessions (tank_id) where status not in ('signed', 'cancelled');
select private.enable_updated_at('public.fuel_delivery_sessions');
alter table public.fuel_delivery_sessions enable row level security;
select private.policy_select_org('public.fuel_delivery_sessions');
select private.policy_select_device('public.fuel_delivery_sessions');
revoke insert, update, delete on public.fuel_delivery_sessions from authenticated;

-- Pistolet en pause : sa cuve est en cours de dépotage.
create or replace function public.nozzle_is_paused(p_nozzle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.nozzles n
    join public.fuel_delivery_sessions s on s.tank_id = n.tank_id
    where n.id = p_nozzle_id and s.status = 'unloading'
  );
$$;

revoke all on function public.nozzle_is_paused(uuid) from public, anon;
grant execute on function public.nozzle_is_paused(uuid) to authenticated, service_role;

create or replace function private.prepare_meter_reading()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev record;
begin
  if public.nozzle_is_paused(new.nozzle_id) then
    raise exception 'NOZZLE_PAUSED: pistolet en pause pendant le dépotage de sa cuve' using errcode = 'P0001';
  end if;
  select m.index_cl into v_prev
  from public.meter_readings m
  where m.nozzle_id = new.nozzle_id and m.device_created_at < new.device_created_at
  order by m.device_created_at desc, m.created_at desc
  limit 1;
  new.previous_index_cl := v_prev.index_cl;
  new.flagged_regression := (v_prev.index_cl is not null and new.index_cl < v_prev.index_cl);
  return new;
end;
$$;
create trigger prepare_meter_reading before insert on public.meter_readings
  for each row execute function private.prepare_meter_reading();

create or replace function private.after_meter_reading()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.flagged_regression then
    insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload)
    values (new.organization_id, new.station_id, new.shift_id, 'meter_regression', 'critical',
            jsonb_build_object('reading_id', new.id, 'nozzle_id', new.nozzle_id, 'employee_id', new.employee_id,
                               'index_cl', new.index_cl, 'previous_index_cl', new.previous_index_cl, 'kind', new.kind));
  end if;
  return new;
end;
$$;
create trigger after_meter_reading after insert on public.meter_readings
  for each row execute function private.after_meter_reading();

-- Passation à l'aveugle : un appareil ne lit un relevé de passation que s'il est
-- de l'employé connecté, ou si la passation est terminée (signed / disputed).
drop policy meter_readings_select_device on public.meter_readings;
create policy meter_readings_select_device on public.meter_readings for select to authenticated
  using (
    station_id = public.current_device_station_id()
    and (
      handover_id is null
      or employee_id = public.current_employee_id()
      or exists (select 1 from public.shift_handovers h where h.id = meter_readings.handover_id and h.status <> 'pending')
    )
  );

-- -----------------------------------------------------------------------------
-- F. Jaugeages : shift, type, volume serveur (version à la date), rapprochement.
-- -----------------------------------------------------------------------------
alter table public.tank_readings
  add column shift_id uuid,
  add column kind public.tank_reading_kind not null default 'spot',
  add column expected_cl bigint,
  add column variance_cl bigint,
  add column gps_lat numeric(9, 6),
  add column gps_lng numeric(9, 6);
alter table public.tank_readings
  add constraint tank_readings_shift_fk foreign key (shift_id, station_id) references public.shifts (id, station_id) on delete restrict,
  add constraint tank_readings_shift_check check (kind not in ('open', 'close') or shift_id is not null);
alter table public.tank_readings add constraint tank_readings_id_tank_key unique (id, tank_id);
create index tank_readings_shift_idx on public.tank_readings (shift_id, kind);
comment on column public.tank_readings.expected_cl is 'Stock théorique calculé par le serveur au moment du jaugeage (dernier jaugeage + livraisons − litres vendus).';

-- Litres vendus (cL) sur les pistolets d'une cuve entre deux instants, d'après les index.
create or replace function public.tank_litres_sold_between(p_tank_id uuid, p_from timestamptz, p_to timestamptz)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(greatest(0, coalesce(fin.index_cl, 0) - coalesce(debut.index_cl, fin.index_cl, 0))), 0)::bigint
  from public.nozzles n
  left join lateral (
    select m.index_cl from public.meter_readings m
    where m.nozzle_id = n.id and m.device_created_at <= p_from
    order by m.device_created_at desc, m.created_at desc limit 1
  ) debut on true
  left join lateral (
    select m.index_cl from public.meter_readings m
    where m.nozzle_id = n.id and m.device_created_at <= p_to
    order by m.device_created_at desc, m.created_at desc limit 1
  ) fin on true
  where n.tank_id = p_tank_id;
$$;
revoke all on function public.tank_litres_sold_between(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.tank_litres_sold_between(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- Stock théorique d'une cuve à un instant : dernier jaugeage + livraisons signées − litres vendus.
create or replace function public.theoretical_stock_cl(p_tank_id uuid, p_at timestamptz default now())
returns table (expected_cl bigint, base_reading_id uuid, base_at timestamptz, litres_sold_cl bigint, delivered_cl bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_base record;
  v_deliv bigint;
  v_sold bigint;
begin
  select r.id, r.volume_cl, r.device_created_at into v_base
  from public.tank_readings r
  where r.tank_id = p_tank_id and r.device_created_at < p_at
  order by r.device_created_at desc, r.created_at desc
  limit 1;
  if v_base is null then
    return;
  end if;
  select coalesce(sum(d.received_cl), 0) into v_deliv
  from public.fuel_deliveries d
  where d.tank_id = p_tank_id
    and coalesce(d.unloading_ended_at, d.device_created_at) > v_base.device_created_at
    and coalesce(d.unloading_ended_at, d.device_created_at) <= p_at;
  v_sold := public.tank_litres_sold_between(p_tank_id, v_base.device_created_at, p_at);
  return query select (v_base.volume_cl + v_deliv - v_sold)::bigint, v_base.id, v_base.device_created_at, v_sold, v_deliv;
end;
$$;
revoke all on function public.theoretical_stock_cl(uuid, timestamptz) from public, anon;
grant execute on function public.theoretical_stock_cl(uuid, timestamptz) to authenticated, service_role;

-- Volume imposé par le serveur avec la version de barémage en vigueur à la date du relevé,
-- puis stock théorique et écart.
create or replace function private.compute_tank_reading_volume()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_theo record;
begin
  new.volume_cl := public.volume_from_calibration(new.tank_id, new.height_mm, new.device_created_at);
  if new.kind <> 'delivery_after' then
    select * into v_theo from public.theoretical_stock_cl(new.tank_id, new.device_created_at);
    if v_theo.expected_cl is not null then
      new.expected_cl := v_theo.expected_cl;
      new.variance_cl := new.volume_cl - v_theo.expected_cl;
    end if;
  end if;
  return new;
end;
$$;

-- Rapprochement cuve : écart > 0,5 % des litres vendus → alerte tank_variance.
create or replace function private.reconcile_tank_reading()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_theo record;
  v_pct numeric;
  v_status public.reconciliation_status;
begin
  if new.kind = 'delivery_after' or new.expected_cl is null then
    return new;
  end if;
  select * into v_theo from public.theoretical_stock_cl(new.tank_id, new.device_created_at);
  v_pct := case when v_theo.litres_sold_cl > 0 then round(new.variance_cl::numeric / v_theo.litres_sold_cl * 100, 2) else null end;
  v_status := case when v_pct is not null and abs(v_pct) > 0.5 then 'variance' else 'ok' end;
  insert into public.reconciliations (organization_id, station_id, shift_id, kind, expected, actual, status, details)
  values (new.organization_id, new.station_id, new.shift_id, 'tank', new.expected_cl, new.volume_cl, v_status,
          jsonb_build_object('tank_id', new.tank_id, 'reading_id', new.id, 'litres_sold_cl', v_theo.litres_sold_cl,
                             'delivered_cl', v_theo.delivered_cl, 'variance_pct', v_pct, 'base_reading_id', v_theo.base_reading_id));
  if v_status = 'variance' then
    insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload)
    values (new.organization_id, new.station_id, new.shift_id, 'tank_variance', 'warning',
            jsonb_build_object('tank_id', new.tank_id, 'reading_id', new.id, 'variance_cl', new.variance_cl,
                               'variance_pct', v_pct, 'litres_sold_cl', v_theo.litres_sold_cl, 'employee_id', new.employee_id));
  end if;
  return new;
end;
$$;
create trigger reconcile_tank_reading after insert on public.tank_readings
  for each row execute function private.reconcile_tank_reading();

-- -----------------------------------------------------------------------------
-- G. RPC de shift : open_shift, close_shift_fuel, résumé.
-- -----------------------------------------------------------------------------
-- Pistolets / cuves actifs sans relevé (avec preuve reçue) pour un shift et un type.
create or replace function public.shift_missing_items(p_shift_id uuid, p_kind text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_shift record;
  v_nozzles jsonb;
  v_tanks jsonb;
begin
  select s.* into v_shift from public.shifts s where s.id = p_shift_id
    and s.station_id in (select public.current_station_ids());
  if v_shift is null then
    raise exception 'SHIFT_NOT_FOUND' using errcode = 'P0002';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('nozzle_id', n.id, 'label', n.label,
           'reason', case when m.id is null then 'missing_reading' else 'missing_photo' end) order by n.label), '[]'::jsonb)
  into v_nozzles
  from public.nozzles n
  left join lateral (
    select r.id, r.evidence_id from public.meter_readings r
    where r.shift_id = p_shift_id and r.nozzle_id = n.id and r.kind = p_kind::public.meter_reading_kind
    order by r.device_created_at desc limit 1
  ) m on true
  where n.station_id = v_shift.station_id and n.active
    and (m.id is null or not public.evidence_is_uploaded(m.evidence_id));
  select coalesce(jsonb_agg(jsonb_build_object('tank_id', t.id, 'label', t.label,
           'reason', case when r.id is null then 'missing_reading' else 'missing_photo' end) order by t.label), '[]'::jsonb)
  into v_tanks
  from public.tanks t
  left join lateral (
    select x.id, x.evidence_id from public.tank_readings x
    where x.shift_id = p_shift_id and x.tank_id = t.id and x.kind = p_kind::public.tank_reading_kind
    order by x.device_created_at desc limit 1
  ) r on true
  where t.station_id = v_shift.station_id and t.active
    and (r.id is null or not public.evidence_is_uploaded(r.evidence_id));
  return jsonb_build_object('nozzles', v_nozzles, 'tanks', v_tanks,
                            'complete', jsonb_array_length(v_nozzles) = 0 and jsonb_array_length(v_tanks) = 0);
end;
$$;
revoke all on function public.shift_missing_items(uuid, text) from public, anon;
grant execute on function public.shift_missing_items(uuid, text) to authenticated;

create or replace function public.open_shift(p_shift_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  v_shift record;
  v_missing jsonb;
begin
  select * into ctx from private.device_context();
  select s.* into v_shift from public.shifts s where s.id = p_shift_id and s.station_id = ctx.station_id for update;
  if v_shift is null then
    raise exception 'SHIFT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_shift.status <> 'opening' then
    return jsonb_build_object('ok', false, 'error', 'SHIFT_NOT_OPENING', 'status', v_shift.status);
  end if;
  v_missing := public.shift_missing_items(p_shift_id, 'open');
  if not (v_missing ->> 'complete')::boolean then
    return jsonb_build_object('ok', false, 'error', 'SHIFT_INCOMPLETE', 'missing', v_missing);
  end if;
  perform set_config('app.shift_rpc', 'on', true);
  update public.shifts set status = 'open' where id = p_shift_id;
  perform set_config('app.shift_rpc', 'off', true);
  insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload)
  values (ctx.organization_id, ctx.station_id, p_shift_id, 'shift_opened', 'info',
          jsonb_build_object('employee_id', ctx.employee_id, 'employee_name', ctx.employee_name));
  return jsonb_build_object('ok', true, 'status', 'open');
end;
$$;
comment on function public.open_shift(uuid) is 'Appareil : passe un shift de opening à open si TOUS les pistolets et cuves actifs ont un relevé d''ouverture avec photo reçue.';
revoke all on function public.open_shift(uuid) from public, anon;
grant execute on function public.open_shift(uuid) to authenticated;

create or replace function public.close_shift_fuel(p_shift_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  v_shift record;
  v_missing jsonb;
begin
  select * into ctx from private.device_context();
  select s.* into v_shift from public.shifts s where s.id = p_shift_id and s.station_id = ctx.station_id for update;
  if v_shift is null then
    raise exception 'SHIFT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_shift.status <> 'open' then
    return jsonb_build_object('ok', false, 'error', 'SHIFT_NOT_OPEN', 'status', v_shift.status);
  end if;
  v_missing := public.shift_missing_items(p_shift_id, 'close');
  if not (v_missing ->> 'complete')::boolean then
    return jsonb_build_object('ok', false, 'error', 'SHIFT_INCOMPLETE', 'missing', v_missing);
  end if;
  perform set_config('app.shift_rpc', 'on', true);
  update public.shifts set status = 'closing', fuel_closed_at = now(), closed_by = ctx.employee_id where id = p_shift_id;
  perform set_config('app.shift_rpc', 'off', true);
  return jsonb_build_object('ok', true, 'status', 'closing', 'summary', public.shift_fuel_summary(p_shift_id));
end;
$$;
comment on function public.close_shift_fuel(uuid) is 'Appareil : fermeture côté carburant (relevés + jaugeages de clôture complets) → statut closing, en attente de la clôture de caisse (phase 4).';
revoke all on function public.close_shift_fuel(uuid) from public, anon;
grant execute on function public.close_shift_fuel(uuid) to authenticated;

-- Litres vendus par pistolet sur un shift : index de fin (close ou passation sortante) − index de début
-- (open ou passation entrante). Même règle que litresVendus() de packages/core.
create or replace function public.shift_fuel_summary(p_shift_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with lignes as (
    select n.id as nozzle_id, n.label, n.tank_id, t.fuel_product_code,
      -- Début : relevé d'ouverture du shift, ou relevé ENTRANT de la passation qui a créé ce shift.
      (select m.index_cl from public.meter_readings m where m.nozzle_id = n.id
         and ((m.shift_id = p_shift_id and m.kind = 'open')
              or (m.kind = 'handover' and m.handover_side = 'incoming'
                  and m.handover_id in (select h.id from public.shift_handovers h where h.to_shift_id = p_shift_id)))
         order by m.device_created_at desc limit 1) as index_open_cl,
      -- Fin : relevé de clôture du shift, ou relevé SORTANT de la passation qui l'a terminé.
      (select m.index_cl from public.meter_readings m where m.nozzle_id = n.id
         and ((m.shift_id = p_shift_id and m.kind = 'close')
              or (m.kind = 'handover' and m.handover_side = 'outgoing'
                  and m.handover_id in (select h.id from public.shift_handovers h where h.from_shift_id = p_shift_id and h.status = 'signed')))
         order by m.device_created_at desc limit 1) as index_close_cl
    from public.shifts s
    join public.nozzles n on n.station_id = s.station_id
    join public.tanks t on t.id = n.tank_id
    where s.id = p_shift_id and s.station_id in (select public.current_station_ids())
  )
  select jsonb_build_object(
    'shift_id', p_shift_id,
    'nozzles', coalesce(jsonb_agg(jsonb_build_object(
        'nozzle_id', nozzle_id, 'label', label, 'tank_id', tank_id, 'fuel_product_code', fuel_product_code,
        'index_open_cl', index_open_cl, 'index_close_cl', index_close_cl,
        'litres_sold_cl', case when index_open_cl is not null and index_close_cl is not null then index_close_cl - index_open_cl end
      ) order by label), '[]'::jsonb),
    'total_litres_sold_cl', coalesce(sum(case when index_open_cl is not null and index_close_cl is not null then index_close_cl - index_open_cl end), 0)
  ) from lignes;
$$;
revoke all on function public.shift_fuel_summary(uuid) from public, anon;
grant execute on function public.shift_fuel_summary(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- H. Passation contradictoire, à l'aveugle.
-- -----------------------------------------------------------------------------
create or replace function public.start_handover(p_shift_id uuid, p_incoming_employee_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  v_shift record;
  v_id uuid;
begin
  select * into ctx from private.device_context();
  select s.* into v_shift from public.shifts s where s.id = p_shift_id and s.station_id = ctx.station_id;
  if v_shift is null or v_shift.status <> 'open' then
    return jsonb_build_object('ok', false, 'error', 'SHIFT_NOT_OPEN');
  end if;
  if not exists (select 1 from public.employees e where e.id = p_incoming_employee_id and e.station_id = ctx.station_id and e.active) then
    return jsonb_build_object('ok', false, 'error', 'INCOMING_INVALID');
  end if;
  if p_incoming_employee_id = ctx.employee_id then
    return jsonb_build_object('ok', false, 'error', 'SAME_EMPLOYEE');
  end if;
  if exists (select 1 from public.shift_handovers h where h.from_shift_id = p_shift_id and h.status = 'pending') then
    select h.id into v_id from public.shift_handovers h where h.from_shift_id = p_shift_id and h.status = 'pending' limit 1;
    return jsonb_build_object('ok', true, 'handover_id', v_id, 'resumed', true);
  end if;
  insert into public.shift_handovers (organization_id, station_id, device_id, from_shift_id, outgoing_employee_id, incoming_employee_id, device_created_at)
  values (ctx.organization_id, ctx.station_id, ctx.device_id, p_shift_id, ctx.employee_id, p_incoming_employee_id, now())
  returning id into v_id;
  return jsonb_build_object('ok', true, 'handover_id', v_id);
end;
$$;
revoke all on function public.start_handover(uuid, uuid) from public, anon;
grant execute on function public.start_handover(uuid, uuid) to authenticated;

-- Pistolets sans relevé (preuve reçue) pour un côté de passation.
create or replace function private.handover_missing(p_handover_id uuid, p_side public.handover_side)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('nozzle_id', n.id, 'label', n.label) order by n.label), '[]'::jsonb)
  from public.shift_handovers h
  join public.nozzles n on n.station_id = h.station_id and n.active
  left join lateral (
    select m.id, m.evidence_id from public.meter_readings m
    where m.handover_id = h.id and m.handover_side = p_side and m.nozzle_id = n.id
    order by m.device_created_at desc limit 1
  ) m on true
  where h.id = p_handover_id and (m.id is null or not public.evidence_is_uploaded(m.evidence_id));
$$;

create or replace function public.sign_handover_outgoing(p_handover_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  v_h record;
  v_missing jsonb;
begin
  select * into ctx from private.device_context();
  select h.* into v_h from public.shift_handovers h where h.id = p_handover_id and h.station_id = ctx.station_id for update;
  if v_h is null or v_h.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'HANDOVER_NOT_PENDING');
  end if;
  if v_h.outgoing_employee_id <> ctx.employee_id then
    return jsonb_build_object('ok', false, 'error', 'NOT_OUTGOING');
  end if;
  v_missing := private.handover_missing(p_handover_id, 'outgoing');
  if jsonb_array_length(v_missing) > 0 then
    return jsonb_build_object('ok', false, 'error', 'HANDOVER_INCOMPLETE', 'missing', v_missing);
  end if;
  update public.shift_handovers set signed_out_at = now() where id = p_handover_id;
  return jsonb_build_object('ok', true, 'signed_out_at', now());
end;
$$;
revoke all on function public.sign_handover_outgoing(uuid) from public, anon;
grant execute on function public.sign_handover_outgoing(uuid) to authenticated;

-- Comparaison sortant / entrant : équivalent SQL de comparerPassation() (tolérance 0).
create or replace function public.compare_handover(p_handover_id uuid)
returns table (nozzle_id uuid, label text, index_outgoing_cl bigint, index_incoming_cl bigint, variance_cl bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.label, o.index_cl, i.index_cl, i.index_cl - o.index_cl
  from public.shift_handovers h
  join public.nozzles n on n.station_id = h.station_id and n.active
  left join lateral (select m.index_cl from public.meter_readings m where m.handover_id = h.id and m.handover_side = 'outgoing' and m.nozzle_id = n.id order by m.device_created_at desc limit 1) o on true
  left join lateral (select m.index_cl from public.meter_readings m where m.handover_id = h.id and m.handover_side = 'incoming' and m.nozzle_id = n.id order by m.device_created_at desc limit 1) i on true
  where h.id = p_handover_id and h.station_id in (select public.current_station_ids())
    and (o.index_cl is distinct from i.index_cl)
  order by n.label;
$$;
revoke all on function public.compare_handover(uuid) from public, anon;
grant execute on function public.compare_handover(uuid) to authenticated, service_role;

-- Bascule effective du shift : sortant → closing, nouveau shift ouvert pour l'entrant.
create or replace function private.complete_handover(p_handover_id uuid, p_device_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_h record;
  v_new uuid;
begin
  select h.* into v_h from public.shift_handovers h where h.id = p_handover_id;
  perform set_config('app.shift_rpc', 'on', true);
  insert into public.shifts (organization_id, station_id, device_id, opened_by, opened_at, status, device_created_at, label)
  values (v_h.organization_id, v_h.station_id, p_device_id, v_h.incoming_employee_id, now(), 'opening', now(), 'Passation')
  returning id into v_new;
  -- Les relevés de l'entrant (append-only) servent de relevés d'ouverture au nouveau shift via
  -- shift_handovers.to_shift_id (voir shift_fuel_summary).
  update public.shifts set status = 'open' where id = v_new;
  update public.shifts set status = 'closing', fuel_closed_at = now(), closed_by = v_h.outgoing_employee_id where id = v_h.from_shift_id;
  perform set_config('app.shift_rpc', 'off', true);
  update public.shift_handovers set to_shift_id = v_new, status = 'signed', signed_in_at = now() where id = p_handover_id;
  return v_new;
end;
$$;

create or replace function public.sign_handover_incoming(p_handover_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  v_h record;
  v_missing jsonb;
  v_mismatches jsonb;
  v_new uuid;
begin
  select * into ctx from private.device_context();
  select h.* into v_h from public.shift_handovers h where h.id = p_handover_id and h.station_id = ctx.station_id for update;
  if v_h is null or v_h.status not in ('pending', 'disputed') then
    return jsonb_build_object('ok', false, 'error', 'HANDOVER_NOT_PENDING');
  end if;
  if v_h.signed_out_at is null then
    return jsonb_build_object('ok', false, 'error', 'OUTGOING_NOT_SIGNED');
  end if;
  if v_h.incoming_employee_id <> ctx.employee_id then
    return jsonb_build_object('ok', false, 'error', 'NOT_INCOMING');
  end if;
  v_missing := private.handover_missing(p_handover_id, 'incoming');
  if jsonb_array_length(v_missing) > 0 then
    return jsonb_build_object('ok', false, 'error', 'HANDOVER_INCOMPLETE', 'missing', v_missing);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('nozzle_id', c.nozzle_id, 'label', c.label,
           'index_outgoing_cl', c.index_outgoing_cl, 'index_incoming_cl', c.index_incoming_cl, 'variance_cl', c.variance_cl)), '[]'::jsonb)
  into v_mismatches from public.compare_handover(p_handover_id) c;
  if jsonb_array_length(v_mismatches) > 0 then
    update public.shift_handovers set status = 'disputed', discrepancies = v_mismatches where id = p_handover_id;
    insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload)
    values (v_h.organization_id, v_h.station_id, v_h.from_shift_id, 'handover_mismatch', 'critical',
            jsonb_build_object('handover_id', p_handover_id, 'outgoing_employee_id', v_h.outgoing_employee_id,
                               'incoming_employee_id', v_h.incoming_employee_id, 'mismatches', v_mismatches));
    return jsonb_build_object('ok', false, 'error', 'HANDOVER_MISMATCH', 'mismatches', v_mismatches);
  end if;
  v_new := private.complete_handover(p_handover_id, ctx.device_id);
  return jsonb_build_object('ok', true, 'to_shift_id', v_new);
end;
$$;
comment on function public.sign_handover_incoming(uuid) is 'Entrant : compare ses relevés à ceux du sortant (tolérance 0). Concordant → shift transféré ; écart → passation disputed + alerte handover_mismatch.';
revoke all on function public.sign_handover_incoming(uuid) from public, anon;
grant execute on function public.sign_handover_incoming(uuid) to authenticated;

create or replace function public.report_handover_discrepancy(p_handover_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  v_h record;
  v_mismatches jsonb;
  v_new uuid;
begin
  select * into ctx from private.device_context();
  select h.* into v_h from public.shift_handovers h where h.id = p_handover_id and h.station_id = ctx.station_id for update;
  if v_h is null or v_h.status <> 'disputed' then
    return jsonb_build_object('ok', false, 'error', 'HANDOVER_NOT_DISPUTED');
  end if;
  if v_h.incoming_employee_id <> ctx.employee_id then
    return jsonb_build_object('ok', false, 'error', 'NOT_INCOMING');
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    return jsonb_build_object('ok', false, 'error', 'REASON_REQUIRED');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('nozzle_id', c.nozzle_id, 'label', c.label,
           'index_outgoing_cl', c.index_outgoing_cl, 'index_incoming_cl', c.index_incoming_cl, 'variance_cl', c.variance_cl)), '[]'::jsonb)
  into v_mismatches from public.compare_handover(p_handover_id) c;
  update public.shift_handovers
  set discrepancy_reported = true, discrepancy_reason = trim(p_reason), discrepancies = v_mismatches,
      attributed_shift_id = from_shift_id
  where id = p_handover_id;
  v_new := private.complete_handover(p_handover_id, ctx.device_id);
  insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload)
  values (v_h.organization_id, v_h.station_id, v_h.from_shift_id, 'handover_mismatch', 'critical',
          jsonb_build_object('handover_id', p_handover_id, 'reported', true, 'reason', trim(p_reason),
                             'attributed_shift_id', v_h.from_shift_id, 'mismatches', v_mismatches));
  return jsonb_build_object('ok', true, 'to_shift_id', v_new, 'attributed_shift_id', v_h.from_shift_id);
end;
$$;
comment on function public.report_handover_discrepancy(uuid, text) is 'Entrant : signale l''écart (motif obligatoire). La passation est acceptée, l''écart est attribué au shift sortant et reste visible.';
revoke all on function public.report_handover_discrepancy(uuid, text) from public, anon;
grant execute on function public.report_handover_discrepancy(uuid, text) to authenticated;

-- La session du sortant se ferme avec le motif handover.
create or replace function public.end_employee_session(p_session_id uuid, p_reason public.session_end_reason default 'logout')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device uuid := public.current_device_id();
begin
  if v_device is null then
    raise exception 'DEVICE_NOT_PAIRED' using errcode = '42501';
  end if;
  if p_reason not in ('logout', 'inactivity', 'handover') then
    raise exception 'INVALID_REASON' using errcode = '22023';
  end if;
  update public.employee_sessions set ended_at = now(), ended_reason = p_reason
  where id = p_session_id and device_id = v_device and ended_at is null;
end;
$$;

-- -----------------------------------------------------------------------------
-- I. Réception de livraison (gérant) : 4 étapes, pistolets en pause, signature.
-- -----------------------------------------------------------------------------
alter table public.fuel_deliveries
  add column session_id uuid references public.fuel_delivery_sessions (id) on delete restrict,
  add column before_reading_id uuid,
  add column after_reading_id uuid,
  add column variance_pct numeric(6, 2),
  add column signed_with_reserve boolean not null default false,
  add column reserve_reason text,
  add column reverses_id uuid references public.fuel_deliveries (id) on delete restrict,
  add column unloading_started_at timestamptz,
  add column unloading_ended_at timestamptz;
alter table public.fuel_deliveries drop constraint fuel_deliveries_check;
alter table public.fuel_deliveries add constraint fuel_deliveries_reversal_check
  check (reverses_id is null or received_cl <= 0);
alter table public.fuel_deliveries add constraint fuel_deliveries_readings_fk_before
  foreign key (before_reading_id, tank_id) references public.tank_readings (id, tank_id) on delete restrict;
alter table public.fuel_deliveries add constraint fuel_deliveries_readings_fk_after
  foreign key (after_reading_id, tank_id) references public.tank_readings (id, tank_id) on delete restrict;
create unique index fuel_deliveries_reverses_once_idx on public.fuel_deliveries (reverses_id) where reverses_id is not null;
comment on column public.fuel_deliveries.reverses_id is 'Contre-passation d''une livraison erronée (received_cl négatif). Une seule par livraison.';

create or replace function public.start_delivery(p_tank_id uuid, p_supplier text default null, p_truck_plate text default null, p_driver_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  v_id uuid;
  v_shift uuid;
begin
  select * into ctx from private.device_context();
  if ctx.employee_role <> 'manager' then
    raise exception 'FORBIDDEN: seul le gérant reçoit une livraison' using errcode = '42501';
  end if;
  if not exists (select 1 from public.tanks t where t.id = p_tank_id and t.station_id = ctx.station_id and t.active) then
    raise exception 'TANK_NOT_FOUND' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.fuel_delivery_sessions s where s.tank_id = p_tank_id and s.status not in ('signed', 'cancelled')) then
    select s.id into v_id from public.fuel_delivery_sessions s where s.tank_id = p_tank_id and s.status not in ('signed', 'cancelled');
    return jsonb_build_object('ok', true, 'session_id', v_id, 'resumed', true);
  end if;
  select s.id into v_shift from public.shifts s where s.station_id = ctx.station_id and s.status = 'open' order by s.opened_at desc limit 1;
  insert into public.fuel_delivery_sessions (organization_id, station_id, device_id, employee_id, tank_id, shift_id, supplier, truck_plate, driver_name, device_created_at)
  values (ctx.organization_id, ctx.station_id, ctx.device_id, ctx.employee_id, p_tank_id, v_shift, p_supplier, p_truck_plate, p_driver_name, now())
  returning id into v_id;
  return jsonb_build_object('ok', true, 'session_id', v_id);
end;
$$;
revoke all on function public.start_delivery(uuid, text, text, text) from public, anon;
grant execute on function public.start_delivery(uuid, text, text, text) to authenticated;

-- Avance la session : jauge avant enregistrée → dépotage → jauge après → signature.
create or replace function public.advance_delivery(p_session_id uuid, p_step text, p_reading_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  v_s record;
  v_reading record;
begin
  select * into ctx from private.device_context();
  select s.* into v_s from public.fuel_delivery_sessions s where s.id = p_session_id and s.station_id = ctx.station_id for update;
  if v_s is null or v_s.status in ('signed', 'cancelled') then
    return jsonb_build_object('ok', false, 'error', 'DELIVERY_NOT_ACTIVE');
  end if;
  if ctx.employee_role <> 'manager' then
    raise exception 'FORBIDDEN: seul le gérant reçoit une livraison' using errcode = '42501';
  end if;
  if p_step = 'before_gauged' then
    if v_s.status <> 'gauging_before' then return jsonb_build_object('ok', false, 'error', 'WRONG_STEP'); end if;
    select r.* into v_reading from public.tank_readings r where r.id = p_reading_id and r.tank_id = v_s.tank_id and r.kind = 'delivery_before';
    if v_reading is null or not public.evidence_is_uploaded(v_reading.evidence_id) then
      return jsonb_build_object('ok', false, 'error', 'READING_MISSING');
    end if;
    update public.fuel_delivery_sessions set before_reading_id = p_reading_id, status = 'unloading', unloading_started_at = now() where id = p_session_id;
    return jsonb_build_object('ok', true, 'status', 'unloading', 'before_cl', v_reading.volume_cl);
  elsif p_step = 'unloading_done' then
    if v_s.status <> 'unloading' then return jsonb_build_object('ok', false, 'error', 'WRONG_STEP'); end if;
    update public.fuel_delivery_sessions set status = 'gauging_after', unloading_ended_at = now() where id = p_session_id;
    return jsonb_build_object('ok', true, 'status', 'gauging_after');
  elsif p_step = 'after_gauged' then
    if v_s.status <> 'gauging_after' then return jsonb_build_object('ok', false, 'error', 'WRONG_STEP'); end if;
    select r.* into v_reading from public.tank_readings r where r.id = p_reading_id and r.tank_id = v_s.tank_id and r.kind = 'delivery_after';
    if v_reading is null or not public.evidence_is_uploaded(v_reading.evidence_id) then
      return jsonb_build_object('ok', false, 'error', 'READING_MISSING');
    end if;
    update public.fuel_delivery_sessions set after_reading_id = p_reading_id, status = 'signing' where id = p_session_id;
    return jsonb_build_object('ok', true, 'status', 'signing', 'after_cl', v_reading.volume_cl);
  elsif p_step = 'cancel' then
    if v_s.status = 'unloading' then return jsonb_build_object('ok', false, 'error', 'UNLOADING_IN_PROGRESS'); end if;
    update public.fuel_delivery_sessions set status = 'cancelled' where id = p_session_id;
    return jsonb_build_object('ok', true, 'status', 'cancelled');
  end if;
  return jsonb_build_object('ok', false, 'error', 'UNKNOWN_STEP');
end;
$$;
revoke all on function public.advance_delivery(uuid, text, uuid) from public, anon;
grant execute on function public.advance_delivery(uuid, text, uuid) to authenticated;

-- Signature : livré mesuré = après − avant (serveur) ; écart > 0,3 % → réserve obligatoire + alerte.
create or replace function public.sign_delivery(
  p_session_id uuid, p_invoiced_cl bigint, p_invoice_evidence_id uuid, p_invoice_ref text default null,
  p_with_reserve boolean default false, p_reserve_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  v_s record;
  v_before record;
  v_after record;
  v_received bigint;
  v_pct numeric;
  v_id uuid;
begin
  select * into ctx from private.device_context();
  if ctx.employee_role <> 'manager' then
    raise exception 'FORBIDDEN: seul le gérant signe une livraison' using errcode = '42501';
  end if;
  select s.* into v_s from public.fuel_delivery_sessions s where s.id = p_session_id and s.station_id = ctx.station_id for update;
  if v_s is null or v_s.status <> 'signing' then
    return jsonb_build_object('ok', false, 'error', 'DELIVERY_NOT_READY');
  end if;
  if p_invoiced_cl is null or p_invoiced_cl <= 0 then
    return jsonb_build_object('ok', false, 'error', 'INVOICED_REQUIRED');
  end if;
  if not exists (select 1 from public.evidence_files e where e.id = p_invoice_evidence_id and e.station_id = ctx.station_id and e.kind = 'delivery_note')
     or not public.evidence_is_uploaded(p_invoice_evidence_id) then
    return jsonb_build_object('ok', false, 'error', 'INVOICE_PHOTO_MISSING');
  end if;
  select * into v_before from public.tank_readings where id = v_s.before_reading_id;
  select * into v_after from public.tank_readings where id = v_s.after_reading_id;
  v_received := v_after.volume_cl - v_before.volume_cl;
  v_pct := round((v_received - p_invoiced_cl)::numeric / p_invoiced_cl * 100, 2);
  if abs(v_pct) > 0.3 and not p_with_reserve then
    return jsonb_build_object('ok', false, 'error', 'RESERVE_REQUIRED', 'received_cl', v_received, 'variance_pct', v_pct);
  end if;
  if p_with_reserve and length(trim(coalesce(p_reserve_reason, ''))) < 3 then
    return jsonb_build_object('ok', false, 'error', 'REASON_REQUIRED', 'received_cl', v_received, 'variance_pct', v_pct);
  end if;
  insert into public.fuel_deliveries (organization_id, station_id, device_id, employee_id, tank_id, supplier, invoice_ref,
    invoiced_cl, before_cl, after_cl, evidence_id, device_created_at, session_id, before_reading_id, after_reading_id,
    variance_pct, signed_with_reserve, reserve_reason, unloading_started_at, unloading_ended_at)
  values (ctx.organization_id, ctx.station_id, ctx.device_id, ctx.employee_id, v_s.tank_id, v_s.supplier, p_invoice_ref,
    p_invoiced_cl, v_before.volume_cl, v_after.volume_cl, p_invoice_evidence_id, now(), p_session_id, v_s.before_reading_id,
    v_s.after_reading_id, v_pct, p_with_reserve, nullif(trim(coalesce(p_reserve_reason, '')), ''), v_s.unloading_started_at, v_s.unloading_ended_at)
  returning id into v_id;
  update public.fuel_delivery_sessions
  set status = 'signed', signed_at = now(), delivery_id = v_id, invoiced_cl = p_invoiced_cl, invoice_ref = p_invoice_ref, invoice_evidence_id = p_invoice_evidence_id
  where id = p_session_id;
  if abs(v_pct) > 0.3 then
    insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload)
    values (ctx.organization_id, ctx.station_id, v_s.shift_id, 'delivery_shortfall', 'critical',
            jsonb_build_object('delivery_id', v_id, 'tank_id', v_s.tank_id, 'received_cl', v_received, 'invoiced_cl', p_invoiced_cl,
                               'variance_pct', v_pct, 'reason', p_reserve_reason, 'employee_id', ctx.employee_id));
  end if;
  return jsonb_build_object('ok', true, 'delivery_id', v_id, 'received_cl', v_received, 'variance_pct', v_pct, 'with_reserve', p_with_reserve);
end;
$$;
comment on function public.sign_delivery(uuid, bigint, uuid, text, boolean, text) is 'Gérant : fige la livraison (append-only). Livré = après − avant calculé par le serveur ; |écart| > 0,3 % → réserve obligatoire + alerte delivery_shortfall.';
revoke all on function public.sign_delivery(uuid, bigint, uuid, text, boolean, text) from public, anon;
grant execute on function public.sign_delivery(uuid, bigint, uuid, text, boolean, text) to authenticated;

-- Contre-passation d'une livraison erronée (gérant) : nouvelle ligne négative.
create or replace function public.reverse_delivery(p_delivery_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx record;
  v_d record;
  v_id uuid;
begin
  select * into ctx from private.device_context();
  if ctx.employee_role <> 'manager' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select d.* into v_d from public.fuel_deliveries d where d.id = p_delivery_id and d.station_id = ctx.station_id;
  if v_d is null or v_d.reverses_id is not null then
    raise exception 'DELIVERY_NOT_FOUND' using errcode = 'P0002';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  insert into public.fuel_deliveries (organization_id, station_id, device_id, employee_id, tank_id, supplier, invoice_ref,
    invoiced_cl, before_cl, after_cl, evidence_id, device_created_at, reverses_id, reserve_reason)
  values (v_d.organization_id, v_d.station_id, ctx.device_id, ctx.employee_id, v_d.tank_id, v_d.supplier, v_d.invoice_ref,
    v_d.invoiced_cl, v_d.after_cl, v_d.before_cl, v_d.evidence_id, now(), p_delivery_id, trim(p_reason))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.reverse_delivery(uuid, text) from public, anon;
grant execute on function public.reverse_delivery(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- J. Pistolets et pompes : pas de suppression si des relevés existent (FK restrict
-- déjà) ; la désactivation reste possible. Cuves : idem.
-- -----------------------------------------------------------------------------
comment on table public.nozzles is 'Pistolets (ex. « P3-A »). Un pistolet ayant des relevés ne peut pas être supprimé (FK restrict) : on le désactive.';
