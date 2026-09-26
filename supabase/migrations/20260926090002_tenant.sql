-- =============================================================================
-- 0002 — Tenant et référentiel : plans, organisations, membres, stations,
-- appareils, employés (+ PIN hashés), helpers RLS, limite de stations.
-- =============================================================================

create type public.plan_code as enum ('solo', 'groupe', 'reseau');
create type public.org_member_role as enum ('owner', 'supervisor');
create type public.employee_role as enum ('manager', 'pump_attendant', 'shop_cashier', 'mechanic', 'washer');

-- -----------------------------------------------------------------------------
-- plans : référentiel global (pas d'organisation). max_stations null = illimité.
-- -----------------------------------------------------------------------------
create table public.plans (
  code public.plan_code primary key,
  label text not null,
  max_stations integer check (max_stations is null or max_stations > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.plans is 'Offres commerciales. max_stations null = illimité.';

insert into public.plans (code, label, max_stations) values
  ('solo', 'Solo — 1 station', 1),
  ('groupe', 'Groupe — jusqu''à 5 stations', 5),
  ('reseau', 'Réseau — stations illimitées', null);

-- -----------------------------------------------------------------------------
-- organizations
-- -----------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  plan_code public.plan_code not null references public.plans (code),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.organizations is 'Un propriétaire (ou groupe) = une organisation. Racine de l''isolation RLS.';

-- -----------------------------------------------------------------------------
-- org_members : utilisateurs auth (web) rattachés à une organisation.
-- -----------------------------------------------------------------------------
create table public.org_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.org_member_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
comment on table public.org_members is 'Propriétaires (owner) et superviseurs (supervisor) : comptes auth web.';
create index org_members_user_idx on public.org_members (user_id);

-- -----------------------------------------------------------------------------
-- stations
-- -----------------------------------------------------------------------------
create table public.stations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name text not null check (length(trim(name)) between 2 and 80),
  city text,
  timezone text not null default 'Africa/Dakar',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Permet les clés composites (station_id, organization_id) sur les tables filles :
  -- l'organisation dénormalisée ne peut jamais être incohérente.
  unique (id, organization_id)
);
comment on table public.stations is 'Stations-service d''une organisation. Limitées par plans.max_stations (trigger).';
create index stations_org_idx on public.stations (organization_id);

-- -----------------------------------------------------------------------------
-- devices : appareil de station = utilisateur auth dédié, lié à UNE station.
-- -----------------------------------------------------------------------------
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  auth_user_id uuid not null unique references auth.users (id) on delete restrict,
  label text not null check (length(trim(label)) between 2 and 80),
  active boolean not null default true,
  registered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (station_id, organization_id) references public.stations (id, organization_id) on delete restrict,
  unique (id, station_id)
);
comment on table public.devices is 'Appareils enregistrés (tablette caisse, téléphone pompiste). Un appareil inconnu ne peut rien écrire.';
create index devices_station_idx on public.devices (station_id);

-- -----------------------------------------------------------------------------
-- employees : sans compte auth. Le PIN est dans employee_pins (jamais lisible par l'API).
-- -----------------------------------------------------------------------------
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  role public.employee_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (station_id, organization_id) references public.stations (id, organization_id) on delete restrict,
  unique (id, station_id)
);
comment on table public.employees is 'Employés d''une station. Pas de compte auth : identification par PIN sur un appareil enregistré.';
create index employees_station_idx on public.employees (station_id);

create table public.employee_pins (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  pin_hash text not null,
  updated_at timestamptz not null default now()
);
comment on table public.employee_pins is 'Hash bcrypt (pgcrypto crypt + gen_salt(''bf'')) du PIN. RLS activée SANS policy : aucun rôle API ne lit ni n''écrit ici, seule set_employee_pin() (SECURITY DEFINER) y accède.';

-- -----------------------------------------------------------------------------
-- Helpers RLS (SECURITY DEFINER, search_path fixé, STABLE).
-- -----------------------------------------------------------------------------
create or replace function public.current_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.org_members m
  where m.user_id = auth.uid();
$$;
comment on function public.current_org_ids() is 'Organisations dont l''utilisateur courant est owner ou supervisor.';

create or replace function public.is_org_owner(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.org_members m
    where m.user_id = auth.uid()
      and m.organization_id = p_org_id
      and m.role = 'owner'
  );
$$;
comment on function public.is_org_owner(uuid) is 'Vrai si l''utilisateur courant est owner de l''organisation.';

create or replace function public.current_device_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.id
  from public.devices d
  where d.auth_user_id = auth.uid()
    and d.active
  limit 1;
$$;
comment on function public.current_device_id() is 'Appareil actif lié à l''utilisateur auth courant, sinon null.';

create or replace function public.current_device_station_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.station_id
  from public.devices d
  where d.auth_user_id = auth.uid()
    and d.active
  limit 1;
$$;
comment on function public.current_device_station_id() is 'Station de l''appareil courant, sinon null.';

create or replace function public.current_device_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.organization_id
  from public.devices d
  where d.auth_user_id = auth.uid()
    and d.active
  limit 1;
$$;
comment on function public.current_device_organization_id() is 'Organisation de l''appareil courant, sinon null.';

create or replace function public.current_station_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
  from public.stations s
  where s.organization_id in (select public.current_org_ids())
  union
  select public.current_device_station_id()
  where public.current_device_station_id() is not null;
$$;
comment on function public.current_station_ids() is 'Stations visibles : toutes celles des organisations de l''utilisateur, ou la station de l''appareil.';

revoke all on function public.current_org_ids() from public, anon;
revoke all on function public.is_org_owner(uuid) from public, anon;
revoke all on function public.current_device_id() from public, anon;
revoke all on function public.current_device_station_id() from public, anon;
revoke all on function public.current_device_organization_id() from public, anon;
revoke all on function public.current_station_ids() from public, anon;
grant execute on function public.current_org_ids() to authenticated, service_role;
grant execute on function public.is_org_owner(uuid) to authenticated, service_role;
grant execute on function public.current_device_id() to authenticated, service_role;
grant execute on function public.current_device_station_id() to authenticated, service_role;
grant execute on function public.current_device_organization_id() to authenticated, service_role;
grant execute on function public.current_station_ids() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- set_employee_pin : seule voie d'écriture du PIN (owner uniquement).
-- -----------------------------------------------------------------------------
create or replace function public.set_employee_pin(p_employee_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select e.organization_id into v_org from public.employees e where e.id = p_employee_id;
  if v_org is null then
    raise exception 'EMPLOYEE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not public.is_org_owner(v_org) then
    raise exception 'FORBIDDEN: seul le propriétaire définit un PIN' using errcode = '42501';
  end if;
  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN_INVALID: 4 à 6 chiffres attendus' using errcode = '22023';
  end if;
  insert into public.employee_pins (employee_id, organization_id, pin_hash, updated_at)
  values (p_employee_id, v_org, extensions.crypt(p_pin, extensions.gen_salt('bf')), now())
  on conflict (employee_id) do update
    set pin_hash = excluded.pin_hash, updated_at = now();
end;
$$;
comment on function public.set_employee_pin(uuid, text) is 'Définit (ou remplace) le PIN d''un employé, hashé en bcrypt. Réservé au propriétaire. La vérification arrive en phase 2.';
revoke all on function public.set_employee_pin(uuid, text) from public, anon;
grant execute on function public.set_employee_pin(uuid, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Garde-fou 2 : LIMITE DE STATIONS selon le plan. Verrouille l'organisation pour
-- éviter deux insertions concurrentes.
-- -----------------------------------------------------------------------------
create or replace function private.enforce_station_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max integer;
  v_count integer;
begin
  perform 1 from public.organizations o where o.id = new.organization_id for update;

  select p.max_stations into v_max
  from public.organizations o
  join public.plans p on p.code = o.plan_code
  where o.id = new.organization_id;

  if v_max is null then
    return new;
  end if;

  select count(*) into v_count from public.stations s where s.organization_id = new.organization_id;

  if v_count >= v_max then
    raise exception 'STATION_LIMIT: le plan de l''organisation autorise % station(s) au maximum', v_max
      using errcode = 'P0001', hint = 'Changez de plan pour ajouter une station.';
  end if;
  return new;
end;
$$;

create trigger enforce_station_limit
  before insert on public.stations
  for each row execute function private.enforce_station_limit();

-- -----------------------------------------------------------------------------
-- updated_at + audit
-- -----------------------------------------------------------------------------
select private.enable_updated_at('public.plans');
select private.enable_updated_at('public.organizations');
select private.enable_updated_at('public.org_members');
select private.enable_updated_at('public.stations');
select private.enable_updated_at('public.devices');
select private.enable_updated_at('public.employees');

select private.enable_audit('public.plans');
select private.enable_audit('public.organizations');
select private.enable_audit('public.org_members');
select private.enable_audit('public.stations');
select private.enable_audit('public.devices');
select private.enable_audit('public.employees');
select private.enable_audit('public.employee_pins');

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.plans enable row level security;
alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.stations enable row level security;
alter table public.devices enable row level security;
alter table public.employees enable row level security;
alter table public.employee_pins enable row level security;

-- audit_log (créée en 0001) : lecture par les membres de l'organisation.
select private.policy_select_org('public.audit_log');

-- plans : référentiel lisible par tout utilisateur authentifié, écriture service uniquement.
create policy plans_select_authenticated on public.plans for select to authenticated using (auth.uid() is not null);
revoke insert, update, delete on public.plans from authenticated;

-- organizations : lecture membres + appareil ; mise à jour du nom par l'owner.
-- La création d'une organisation passera par une fonction dédiée (phase 2).
create policy organizations_select_member on public.organizations for select to authenticated
  using (id in (select public.current_org_ids()) or id = public.current_device_organization_id());
create policy organizations_update_owner on public.organizations for update to authenticated
  using (public.is_org_owner(id)) with check (public.is_org_owner(id));
revoke insert, delete on public.organizations from authenticated;
revoke update on public.organizations from authenticated;
grant update (name) on public.organizations to authenticated;

-- org_members : lecture par les membres ; gestion par l'owner.
select private.policy_select_org('public.org_members');
select private.policy_write_owner('public.org_members');

-- stations : lecture membres + appareil (sa station) ; écriture owner.
create policy stations_select_org on public.stations for select to authenticated
  using (organization_id in (select public.current_org_ids()));
create policy stations_select_device on public.stations for select to authenticated
  using (id = public.current_device_station_id());
select private.policy_write_owner('public.stations');

-- devices / employees : lecture membres + appareil (sa station) ; écriture owner.
select private.policy_select_org('public.devices');
select private.policy_select_device('public.devices');
select private.policy_write_owner('public.devices');

select private.policy_select_org('public.employees');
select private.policy_select_device('public.employees');
select private.policy_write_owner('public.employees');

-- employee_pins : RLS activée, AUCUNE policy, et aucun privilège API.
revoke all on public.employee_pins from authenticated, anon;
