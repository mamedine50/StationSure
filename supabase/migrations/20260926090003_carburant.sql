-- =============================================================================
-- 0003 — Carburant : produits, cuves, barémage, pompes, pistolets, prix verrouillés.
-- =============================================================================

create type public.fuel_code as enum ('super', 'gasoil');

-- -----------------------------------------------------------------------------
-- fuel_products : référentiel global.
-- -----------------------------------------------------------------------------
create table public.fuel_products (
  code public.fuel_code primary key,
  label text not null,
  created_at timestamptz not null default now()
);
comment on table public.fuel_products is 'Produits carburant vendus au Sénégal.';
insert into public.fuel_products (code, label) values ('super', 'Super'), ('gasoil', 'Gasoil');

-- -----------------------------------------------------------------------------
-- tanks
-- -----------------------------------------------------------------------------
create table public.tanks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  fuel_product_code public.fuel_code not null references public.fuel_products (code),
  label text not null check (length(trim(label)) between 1 and 40),
  capacity_cl bigint not null check (capacity_cl > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (station_id, organization_id) references public.stations (id, organization_id) on delete restrict,
  unique (id, station_id),
  unique (station_id, label)
);
comment on table public.tanks is 'Cuves d''une station. Volumes en centilitres.';
create index tanks_station_idx on public.tanks (station_id);

-- -----------------------------------------------------------------------------
-- tank_calibrations : table de barémage mm → cL, propre à chaque cuve.
-- -----------------------------------------------------------------------------
create table public.tank_calibrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  tank_id uuid not null,
  height_mm integer not null check (height_mm >= 0),
  volume_cl bigint not null check (volume_cl >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tank_id, station_id) references public.tanks (id, station_id) on delete cascade,
  foreign key (station_id, organization_id) references public.stations (id, organization_id) on delete restrict,
  unique (tank_id, height_mm)
);
comment on table public.tank_calibrations is 'Points de barémage (hauteur de jauge en mm → volume en cL). Interpolation linéaire entre les points.';

-- -----------------------------------------------------------------------------
-- pumps / nozzles
-- -----------------------------------------------------------------------------
create table public.pumps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  label text not null check (length(trim(label)) between 1 and 40),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (station_id, organization_id) references public.stations (id, organization_id) on delete restrict,
  unique (id, station_id),
  unique (station_id, label)
);
comment on table public.pumps is 'Pompes (bornes) d''une station.';

create table public.nozzles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  pump_id uuid not null,
  tank_id uuid not null,
  label text not null check (length(trim(label)) between 1 and 40),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (pump_id, station_id) references public.pumps (id, station_id) on delete restrict,
  foreign key (tank_id, station_id) references public.tanks (id, station_id) on delete restrict,
  foreign key (station_id, organization_id) references public.stations (id, organization_id) on delete restrict,
  unique (id, station_id),
  unique (station_id, label)
);
comment on table public.nozzles is 'Pistolets (ex. « P3-A »), chacun relié à une pompe et à une cuve de la même station.';
create index nozzles_station_idx on public.nozzles (station_id);

-- -----------------------------------------------------------------------------
-- price_changes : historique append-only des prix publiés par le propriétaire.
-- -----------------------------------------------------------------------------
create table public.price_changes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  fuel_product_code public.fuel_code not null references public.fuel_products (code),
  price_fcfa_per_litre bigint not null check (price_fcfa_per_litre > 0),
  effective_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (station_id, organization_id) references public.stations (id, organization_id) on delete restrict
);
comment on table public.price_changes is 'Prix du litre publiés par le propriétaire, datés et historisés. Append-only.';
create index price_changes_lookup_idx on public.price_changes (station_id, fuel_product_code, effective_at desc);

-- Garde-fou 3 : PRIX VERROUILLÉS. En plus de la RLS (seul l'owner insère), ce
-- trigger vérifie que created_by est bien un owner de l'organisation, quel que
-- soit le rôle qui insère (service_role compris).
create or replace function private.enforce_price_author_is_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.org_members m
    where m.user_id = new.created_by
      and m.organization_id = new.organization_id
      and m.role = 'owner'
  ) then
    raise exception 'PRICE_LOCKED: seul un propriétaire de l''organisation peut publier un prix'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger enforce_price_author_is_owner
  before insert on public.price_changes
  for each row execute function private.enforce_price_author_is_owner();

-- Vue des prix en vigueur (dernier prix dont effective_at <= now(), par station et produit).
-- security_invoker : la RLS de price_changes s'applique à l'appelant.
create view public.current_fuel_prices
with (security_invoker = true)
as
select distinct on (pc.station_id, pc.fuel_product_code)
  pc.station_id,
  pc.organization_id,
  pc.fuel_product_code,
  pc.price_fcfa_per_litre,
  pc.effective_at,
  pc.id as price_change_id
from public.price_changes pc
where pc.effective_at <= now()
order by pc.station_id, pc.fuel_product_code, pc.effective_at desc, pc.created_at desc;
comment on view public.current_fuel_prices is 'Prix du litre en vigueur par station et produit.';

-- -----------------------------------------------------------------------------
-- Garde-fou 5 : volume_from_calibration — mêmes règles que packages/core :
-- point exact → volume du point ; entre deux points → interpolation linéaire
-- arrondie au centilitre ; hors [min, max] → erreur ; table vide → erreur.
-- -----------------------------------------------------------------------------
create or replace function public.volume_from_calibration(p_tank_id uuid, p_height_mm integer)
returns bigint
language plpgsql
stable
set search_path = ''
as $$
declare
  v_low record;
  v_high record;
  v_min integer;
  v_max integer;
begin
  if p_height_mm is null then
    raise exception 'BAREMAGE_HAUTEUR_NULLE' using errcode = '22023';
  end if;

  select min(c.height_mm), max(c.height_mm) into v_min, v_max
  from public.tank_calibrations c where c.tank_id = p_tank_id;

  if v_min is null then
    raise exception 'BAREMAGE_TABLE_VIDE: aucune table de barémage pour la cuve %', p_tank_id
      using errcode = 'P0001';
  end if;
  if p_height_mm < v_min or p_height_mm > v_max then
    raise exception 'BAREMAGE_HORS_TABLE: hauteur % mm hors de [% ; %] mm', p_height_mm, v_min, v_max
      using errcode = 'P0001';
  end if;

  -- Point inférieur ou égal le plus proche.
  select c.height_mm, c.volume_cl into v_low
  from public.tank_calibrations c
  where c.tank_id = p_tank_id and c.height_mm <= p_height_mm
  order by c.height_mm desc limit 1;

  if v_low.height_mm = p_height_mm then
    return v_low.volume_cl;
  end if;

  -- Point strictement supérieur le plus proche.
  select c.height_mm, c.volume_cl into v_high
  from public.tank_calibrations c
  where c.tank_id = p_tank_id and c.height_mm > p_height_mm
  order by c.height_mm asc limit 1;

  return round(
    v_low.volume_cl
    + (p_height_mm - v_low.height_mm)::numeric * (v_high.volume_cl - v_low.volume_cl)
      / (v_high.height_mm - v_low.height_mm)
  )::bigint;
end;
$$;
comment on function public.volume_from_calibration(uuid, integer) is 'Volume (cL) d''une cuve pour une hauteur de jauge (mm), par interpolation linéaire dans tank_calibrations. Erreur hors table.';
revoke all on function public.volume_from_calibration(uuid, integer) from public, anon;
grant execute on function public.volume_from_calibration(uuid, integer) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- updated_at, audit, append-only
-- -----------------------------------------------------------------------------
select private.enable_updated_at('public.tanks');
select private.enable_updated_at('public.tank_calibrations');
select private.enable_updated_at('public.pumps');
select private.enable_updated_at('public.nozzles');

select private.enable_audit('public.tanks');
select private.enable_audit('public.tank_calibrations');
select private.enable_audit('public.pumps');
select private.enable_audit('public.nozzles');
select private.enable_audit('public.price_changes');

select private.enable_append_only('public.price_changes');

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.fuel_products enable row level security;
alter table public.tanks enable row level security;
alter table public.tank_calibrations enable row level security;
alter table public.pumps enable row level security;
alter table public.nozzles enable row level security;
alter table public.price_changes enable row level security;

create policy fuel_products_select_authenticated on public.fuel_products for select to authenticated using (auth.uid() is not null);
revoke insert, update, delete on public.fuel_products from authenticated;

select private.policy_select_org('public.tanks');
select private.policy_select_device('public.tanks');
select private.policy_write_owner('public.tanks');

select private.policy_select_org('public.tank_calibrations');
select private.policy_select_device('public.tank_calibrations');
select private.policy_write_owner('public.tank_calibrations');

select private.policy_select_org('public.pumps');
select private.policy_select_device('public.pumps');
select private.policy_write_owner('public.pumps');

select private.policy_select_org('public.nozzles');
select private.policy_select_device('public.nozzles');
select private.policy_write_owner('public.nozzles');

-- price_changes : lecture membres + appareil ; insertion owner uniquement, avec
-- created_by = lui-même ; jamais d'update/delete (append-only).
select private.policy_select_org('public.price_changes');
select private.policy_select_device('public.price_changes');
create policy price_changes_insert_owner on public.price_changes for insert to authenticated
  with check (public.is_org_owner(organization_id) and created_by = auth.uid());
revoke update, delete on public.price_changes from authenticated;
