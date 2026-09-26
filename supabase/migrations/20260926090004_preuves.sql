-- =============================================================================
-- 0004 — Preuves : evidence_files + bucket Storage privé « evidence ».
-- Chemin obligatoire : {organization_id}/{station_id}/... ; policies alignées RLS.
-- =============================================================================

create type public.evidence_kind as enum (
  'meter_photo',    -- photo du totaliseur d'un pistolet
  'tank_gauge',     -- photo de la réglette de jaugeage
  'delivery_note',  -- bon de livraison carburant
  'bank_slip',      -- bordereau de versement
  'vehicle_plate',  -- plaque (garage / Car Wash, phase 8)
  'count_photo',    -- photo de comptage
  'other'
);

create table public.evidence_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  device_id uuid not null,
  employee_id uuid not null,
  kind public.evidence_kind not null,
  storage_path text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  captured_at_device timestamptz not null,
  gps_lat numeric(9, 6) check (gps_lat between -90 and 90),
  gps_lng numeric(9, 6) check (gps_lng between -180 and 180),
  device_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (station_id, organization_id) references public.stations (id, organization_id) on delete restrict,
  foreign key (device_id, station_id) references public.devices (id, station_id) on delete restrict,
  foreign key (employee_id, station_id) references public.employees (id, station_id) on delete restrict,
  unique (id, station_id),
  -- Le chemin Storage est forcément dans le dossier de l'organisation puis de la station.
  check (storage_path like organization_id::text || '/' || station_id::text || '/%')
);
comment on table public.evidence_files is 'Référentiel des photos et pièces justificatives (Storage bucket « evidence »). Append-only : une preuve ne se modifie pas.';
comment on column public.evidence_files.sha256 is 'Empreinte du fichier calculée sur l''appareil, pour détecter toute substitution.';
comment on column public.evidence_files.captured_at_device is 'Heure de capture selon l''appareil (comparée à created_at serveur).';
create index evidence_files_station_idx on public.evidence_files (station_id, created_at desc);

select private.enable_append_only('public.evidence_files');

alter table public.evidence_files enable row level security;
select private.policy_select_org('public.evidence_files');
select private.policy_select_device('public.evidence_files');
select private.policy_insert_device('public.evidence_files');
revoke update, delete on public.evidence_files from authenticated;

-- -----------------------------------------------------------------------------
-- Storage : bucket privé « evidence ».
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence', 'evidence', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- Conversion sûre texte → uuid (null si le segment n'est pas un uuid).
create or replace function private.try_uuid(p_text text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end;
$$;

-- Lecture : membres de l'organisation (dossier 1 = organisation) ou appareil de la
-- station (dossier 2 = station).
create policy evidence_objects_select on storage.objects for select to authenticated
  using (
    bucket_id = 'evidence'
    and (
      private.try_uuid((storage.foldername(name))[1]) in (select public.current_org_ids())
      or private.try_uuid((storage.foldername(name))[2]) = public.current_device_station_id()
    )
  );

-- Écriture : uniquement l'appareil, dans le dossier de SA station.
create policy evidence_objects_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'evidence'
    and private.try_uuid((storage.foldername(name))[1]) = public.current_device_organization_id()
    and private.try_uuid((storage.foldername(name))[2]) = public.current_device_station_id()
  );

-- Aucune policy update / delete : une preuve ne se remplace pas et ne s'efface pas.
