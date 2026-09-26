-- =============================================================================
-- 0010 — Identité : inscription du propriétaire, jumelage des appareils,
-- sessions employé par PIN, durcissement des policies d'insertion.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. create_organization : organisation + membre owner, atomiquement.
-- -----------------------------------------------------------------------------
create or replace function public.create_organization(p_name text, p_plan_code public.plan_code)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if exists (select 1 from public.org_members m where m.user_id = v_user) then
    raise exception 'ALREADY_MEMBER: cet utilisateur appartient déjà à une organisation' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.plans p where p.code = p_plan_code) then
    raise exception 'PLAN_UNKNOWN' using errcode = 'P0002';
  end if;
  insert into public.organizations (name, plan_code) values (trim(p_name), p_plan_code) returning id into v_org;
  insert into public.org_members (organization_id, user_id, role) values (v_org, v_user, 'owner');
  return v_org;
end;
$$;
comment on function public.create_organization(text, public.plan_code) is 'Onboarding : crée l''organisation et son propriétaire (l''utilisateur courant) en une transaction.';
revoke all on function public.create_organization(text, public.plan_code) from public, anon;
grant execute on function public.create_organization(text, public.plan_code) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Jumelage : codes à usage unique, jamais en clair.
-- -----------------------------------------------------------------------------
create table public.device_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_device_id uuid references public.devices (id) on delete set null,
  created_by uuid not null references auth.users (id) on delete restrict,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (station_id, organization_id) references public.stations (id, organization_id) on delete cascade
);
comment on table public.device_pairing_codes is 'Codes de jumelage à 6 chiffres (hash bcrypt), valables 10 min, usage unique, 5 tentatives max.';
create index device_pairing_codes_active_idx on public.device_pairing_codes (station_id, expires_at) where used_at is null;

-- Limitation par adresse IP des tentatives de jumelage (fenêtre glissante de 15 min).
create table public.pairing_rate_limits (
  ip text primary key,
  window_start timestamptz not null default now(),
  attempts integer not null default 0
);
comment on table public.pairing_rate_limits is 'Compteur de tentatives de jumelage par IP (Edge Function pair-device).';

alter table public.device_pairing_codes enable row level security;
alter table public.pairing_rate_limits enable row level security;
select private.policy_select_org('public.device_pairing_codes');
revoke insert, update, delete on public.device_pairing_codes from authenticated;
revoke all on public.pairing_rate_limits from authenticated, anon;

-- Génère un code de 6 chiffres avec un aléa cryptographique.
create or replace function private.random_pairing_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select lpad((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::text, 6, '0');
$$;

create or replace function public.create_pairing_code(p_station_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_code text;
  v_id uuid;
  v_expires timestamptz := now() + interval '10 minutes';
begin
  select s.organization_id into v_org from public.stations s where s.id = p_station_id and s.active;
  if v_org is null or not public.is_org_owner(v_org) then
    raise exception 'FORBIDDEN: seul le propriétaire peut jumeler un appareil' using errcode = '42501';
  end if;
  v_code := private.random_pairing_code();
  insert into public.device_pairing_codes (organization_id, station_id, code_hash, expires_at, created_by)
  values (v_org, p_station_id, extensions.crypt(v_code, extensions.gen_salt('bf', 8)), v_expires, auth.uid())
  returning id into v_id;
  -- Le code en clair n'est renvoyé qu'ici, une seule fois.
  return jsonb_build_object(
    'pairing_id', v_id,
    'code', v_code,
    'expires_at', v_expires,
    'qr', 'stationsure://pair?code=' || v_code || '&id=' || v_id::text
  );
end;
$$;
comment on function public.create_pairing_code(uuid) is 'Owner : crée un code de jumelage (renvoyé en clair une seule fois) et la charge utile du QR.';
revoke all on function public.create_pairing_code(uuid) from public, anon;
grant execute on function public.create_pairing_code(uuid) to authenticated;

-- Consommation d'un code (service_role uniquement, appelée par l'Edge Function pair-device).
-- Toutes les erreurs remontent le même message générique.
create or replace function public.consume_pairing_code(p_code text, p_ip text, p_pairing_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit record;
  v_candidate record;
  v_found record;
begin
  -- Limitation par IP : 10 tentatives par 15 minutes.
  insert into public.pairing_rate_limits (ip, window_start, attempts)
  values (coalesce(p_ip, 'unknown'), now(), 1)
  on conflict (ip) do update
    set attempts = case when public.pairing_rate_limits.window_start < now() - interval '15 minutes' then 1
                        else public.pairing_rate_limits.attempts + 1 end,
        window_start = case when public.pairing_rate_limits.window_start < now() - interval '15 minutes' then now()
                            else public.pairing_rate_limits.window_start end
  returning * into v_limit;
  -- IMPORTANT : les échecs sont RENVOYÉS (ok = false) et non levés en exception, sinon
  -- l'exception annulerait l'incrément des compteurs (tentatives, limite IP) dans la même transaction.
  if v_limit.attempts > 10 then
    return jsonb_build_object('ok', false, 'error', 'PAIRING_INVALID');
  end if;

  if p_code !~ '^[0-9]{6}$' then
    return jsonb_build_object('ok', false, 'error', 'PAIRING_INVALID');
  end if;

  -- Candidats : codes actifs (non utilisés, non expirés, < 5 échecs), ciblés par id si le QR l'a fourni.
  for v_candidate in
    select c.id, c.code_hash, c.station_id, c.organization_id
    from public.device_pairing_codes c
    where c.used_at is null and c.expires_at > now() and c.attempts < 5
      and (p_pairing_id is null or c.id = p_pairing_id)
    order by c.created_at desc
    limit 50
    for update
  loop
    if v_candidate.code_hash = extensions.crypt(p_code, v_candidate.code_hash) then
      v_found := v_candidate;
      exit;
    end if;
  end loop;

  if v_found is null then
    -- Échec : chaque code testé consomme une tentative.
    update public.device_pairing_codes c set attempts = c.attempts + 1
    where c.used_at is null and c.expires_at > now() and c.attempts < 5
      and (p_pairing_id is null or c.id = p_pairing_id);
    return jsonb_build_object('ok', false, 'error', 'PAIRING_INVALID');
  end if;

  update public.device_pairing_codes set used_at = now() where id = v_found.id;
  return jsonb_build_object('ok', true, 'pairing_id', v_found.id, 'station_id', v_found.station_id, 'organization_id', v_found.organization_id);
end;
$$;
comment on function public.consume_pairing_code(text, text, uuid) is 'service_role : valide un code de jumelage (expiration, usage unique, 5 essais, limite IP) et le marque utilisé. Renvoie {ok:false, error:PAIRING_INVALID} en cas d''échec (jamais d''exception, pour conserver les compteurs).';
revoke all on function public.consume_pairing_code(text, text, uuid) from public, anon, authenticated;
grant execute on function public.consume_pairing_code(text, text, uuid) to service_role;

-- Enregistrement de l'appareil après création de son utilisateur auth (service_role).
create or replace function public.register_paired_device(p_pairing_id uuid, p_auth_user_id uuid, p_label text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code record;
  v_device uuid;
begin
  select * into v_code from public.device_pairing_codes c
  where c.id = p_pairing_id and c.used_at is not null and c.used_at > now() - interval '2 minutes' and c.used_by_device_id is null
  for update;
  if v_code is null then
    raise exception 'PAIRING_INVALID' using errcode = 'P0001';
  end if;
  insert into public.devices (organization_id, station_id, auth_user_id, label)
  values (v_code.organization_id, v_code.station_id, p_auth_user_id, coalesce(nullif(trim(p_label), ''), 'Tablette'))
  returning id into v_device;
  update public.device_pairing_codes set used_by_device_id = v_device where id = p_pairing_id;
  insert into public.alerts (organization_id, station_id, type, severity, payload)
  values (v_code.organization_id, v_code.station_id, 'device_paired', 'info',
          jsonb_build_object('device_id', v_device, 'label', p_label));
  return v_device;
end;
$$;
revoke all on function public.register_paired_device(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.register_paired_device(uuid, uuid, text) to service_role;

-- Révocation : appareil inactif, sessions employé fermées, utilisateur auth banni et déconnecté.
create or replace function public.revoke_device(p_device_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device record;
begin
  select * into v_device from public.devices d where d.id = p_device_id for update;
  if v_device is null or not public.is_org_owner(v_device.organization_id) then
    raise exception 'FORBIDDEN: seul le propriétaire peut révoquer un appareil' using errcode = '42501';
  end if;
  update public.devices set active = false where id = p_device_id;
  update public.employee_sessions set ended_at = now(), ended_reason = 'revoked'
  where device_id = p_device_id and ended_at is null;
  update auth.users set banned_until = 'infinity'::timestamptz, updated_at = now() where id = v_device.auth_user_id;
  delete from auth.refresh_tokens where user_id = v_device.auth_user_id::text;
  delete from auth.sessions where user_id = v_device.auth_user_id;
  insert into public.alerts (organization_id, station_id, type, severity, payload)
  values (v_device.organization_id, v_device.station_id, 'device_revoked', 'info',
          jsonb_build_object('device_id', p_device_id, 'label', v_device.label));
end;
$$;
comment on function public.revoke_device(uuid) is 'Owner : désactive l''appareil, ferme ses sessions employé, bannit son utilisateur auth et supprime ses sessions.';
revoke all on function public.revoke_device(uuid) from public, anon;
grant execute on function public.revoke_device(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Sessions employé et tentatives de PIN.
-- -----------------------------------------------------------------------------
create table public.employee_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  device_id uuid not null,
  employee_id uuid not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  ended_reason public.session_end_reason,
  created_at timestamptz not null default now(),
  foreign key (station_id, organization_id) references public.stations (id, organization_id) on delete restrict,
  foreign key (device_id, station_id) references public.devices (id, station_id) on delete restrict,
  foreign key (employee_id, station_id) references public.employees (id, station_id) on delete restrict,
  check ((ended_at is null) = (ended_reason is null)),
  check (expires_at > started_at)
);
comment on table public.employee_sessions is 'Sessions employé ouvertes par PIN sur un appareil. Une seule session active par appareil.';
create index employee_sessions_device_active_idx on public.employee_sessions (device_id, started_at desc) where ended_at is null;
create index employee_sessions_employee_idx on public.employee_sessions (employee_id, started_at desc);

create table public.pin_attempts (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  station_id uuid not null,
  device_id uuid not null,
  employee_id uuid not null,
  success boolean not null,
  at timestamptz not null default now(),
  foreign key (employee_id, station_id) references public.employees (id, station_id) on delete cascade,
  foreign key (device_id, station_id) references public.devices (id, station_id) on delete cascade
);
comment on table public.pin_attempts is 'Tentatives de PIN (succès et échecs). 5 échecs en 15 min bloquent l''employé 15 min.';
create index pin_attempts_employee_idx on public.pin_attempts (employee_id, at desc) where not success;

alter table public.employee_sessions enable row level security;
alter table public.pin_attempts enable row level security;
select private.policy_select_org('public.employee_sessions');
select private.policy_select_device('public.employee_sessions');
revoke insert, update, delete on public.employee_sessions from authenticated;
select private.policy_select_org('public.pin_attempts');
revoke insert, update, delete on public.pin_attempts from authenticated;

-- Employé de la session active de l'appareil courant, sinon null.
create or replace function public.current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.employee_id
  from public.employee_sessions s
  where s.device_id = public.current_device_id()
    and s.ended_at is null
    and s.expires_at > now()
  order by s.started_at desc
  limit 1;
$$;
comment on function public.current_employee_id() is 'Employé connecté par PIN sur l''appareil courant (session active non expirée), sinon null.';
revoke all on function public.current_employee_id() from public, anon;
grant execute on function public.current_employee_id() to authenticated, service_role;

-- Session active de l'appareil courant (pour restaurer l'état de l'app), sinon null.
create or replace function public.current_employee_session()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'session_id', s.id,
    'employee_id', e.id,
    'full_name', e.full_name,
    'role', e.role,
    'started_at', s.started_at,
    'expires_at', s.expires_at
  )
  from public.employee_sessions s
  join public.employees e on e.id = s.employee_id
  where s.device_id = public.current_device_id()
    and s.ended_at is null
    and s.expires_at > now()
  order by s.started_at desc
  limit 1;
$$;
revoke all on function public.current_employee_session() from public, anon;
grant execute on function public.current_employee_session() to authenticated, service_role;

-- PIN trivial : miroir exact de packages/core/src/pin.ts (estPinTrivial).
create or replace function private.is_trivial_pin(p_pin text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  d integer[];
begin
  if p_pin !~ '^[0-9]{4}$' then
    return true;
  end if;
  d := array[substr(p_pin, 1, 1)::int, substr(p_pin, 2, 1)::int, substr(p_pin, 3, 1)::int, substr(p_pin, 4, 1)::int];
  if d[1] = d[2] and d[2] = d[3] and d[3] = d[4] then return true; end if;                  -- 1111
  if d[2] = d[1] + 1 and d[3] = d[2] + 1 and d[4] = d[3] + 1 then return true; end if;      -- 1234
  if d[2] = d[1] - 1 and d[3] = d[2] - 1 and d[4] = d[3] - 1 then return true; end if;      -- 4321
  if d[1] = d[3] and d[2] = d[4] then return true; end if;                                  -- 1212
  if p_pin in ('2580', '0852', '1004', '2000', '2020', '2024', '2025', '2026', '1010', '0000') then return true; end if;
  return false;
end;
$$;

-- set_employee_pin : exactement 4 chiffres, non trivial.
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
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN_INVALID: exactement 4 chiffres attendus' using errcode = '22023';
  end if;
  if private.is_trivial_pin(p_pin) then
    raise exception 'PIN_TRIVIAL: ce PIN est trop facile à deviner (suite, répétition ou code courant)' using errcode = '22023';
  end if;
  insert into public.employee_pins (employee_id, organization_id, pin_hash, updated_at)
  values (p_employee_id, v_org, extensions.crypt(p_pin, extensions.gen_salt('bf')), now())
  on conflict (employee_id) do update
    set pin_hash = excluded.pin_hash, updated_at = now();
end;
$$;

-- verify_employee_pin : ouvre une session employé sur l'appareil courant.
create or replace function public.verify_employee_pin(p_employee_id uuid, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device record;
  v_employee record;
  v_hash text;
  v_failures integer;
  v_locked_until timestamptz;
  v_session record;
begin
  select d.id, d.station_id, d.organization_id into v_device
  from public.devices d where d.auth_user_id = auth.uid() and d.active;
  if v_device is null then
    raise exception 'DEVICE_NOT_PAIRED: cet appareil n''est pas jumelé' using errcode = '42501';
  end if;

  -- Employé actif de la station de l'appareil, sinon même erreur qu'un PIN faux.
  select e.id, e.full_name, e.role into v_employee
  from public.employees e
  where e.id = p_employee_id and e.active and e.station_id = v_device.station_id;
  -- IMPORTANT : les échecs sont RENVOYÉS (ok = false), pas levés : une exception annulerait
  -- l'enregistrement de la tentative et l'alerte dans la même transaction.
  if v_employee is null or p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'error', 'PIN_INVALID');
  end if;

  -- Blocage : 5 échecs dans les 15 dernières minutes → 15 min après le dernier échec.
  select count(*), max(a.at) + interval '15 minutes' into v_failures, v_locked_until
  from public.pin_attempts a
  where a.employee_id = v_employee.id and not a.success and a.at > now() - interval '15 minutes';
  if v_failures >= 5 and v_locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'PIN_LOCKED',
      'retry_after_seconds', ceil(extract(epoch from v_locked_until - now())));
  end if;

  select p.pin_hash into v_hash from public.employee_pins p where p.employee_id = v_employee.id;

  if v_hash is null or v_hash <> extensions.crypt(p_pin, v_hash) then
    insert into public.pin_attempts (organization_id, station_id, device_id, employee_id, success)
    values (v_device.organization_id, v_device.station_id, v_device.id, v_employee.id, false);
    if v_failures + 1 = 5 then
      insert into public.alerts (organization_id, station_id, type, severity, payload)
      values (v_device.organization_id, v_device.station_id, 'pin_lockout', 'warning',
              jsonb_build_object('employee_id', v_employee.id, 'full_name', v_employee.full_name,
                                 'device_id', v_device.id, 'locked_until', now() + interval '15 minutes'));
    end if;
    return jsonb_build_object('ok', false, 'error', 'PIN_INVALID');
  end if;

  insert into public.pin_attempts (organization_id, station_id, device_id, employee_id, success)
  values (v_device.organization_id, v_device.station_id, v_device.id, v_employee.id, true);

  -- Une seule session active par appareil.
  update public.employee_sessions set ended_at = now(), ended_reason = 'replaced'
  where device_id = v_device.id and ended_at is null;

  insert into public.employee_sessions (organization_id, station_id, device_id, employee_id, expires_at)
  values (v_device.organization_id, v_device.station_id, v_device.id, v_employee.id, now() + interval '12 hours')
  returning * into v_session;

  return jsonb_build_object(
    'ok', true,
    'session_id', v_session.id,
    'employee_id', v_employee.id,
    'full_name', v_employee.full_name,
    'role', v_employee.role,
    'started_at', v_session.started_at,
    'expires_at', v_session.expires_at
  );
end;
$$;
comment on function public.verify_employee_pin(uuid, text) is 'Appareil : vérifie le PIN d''un employé de sa station et ouvre une session (12 h). Renvoie {ok:true, session…} ou {ok:false, error: PIN_INVALID (faux ou inconnu) | PIN_LOCKED (5 échecs / 15 min, retry_after_seconds)}. Lève DEVICE_NOT_PAIRED si l''appelant n''est pas un appareil actif.';
revoke all on function public.verify_employee_pin(uuid, text) from public, anon;
grant execute on function public.verify_employee_pin(uuid, text) to authenticated;

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
  if p_reason not in ('logout', 'inactivity') then
    raise exception 'INVALID_REASON' using errcode = '22023';
  end if;
  update public.employee_sessions set ended_at = now(), ended_reason = p_reason
  where id = p_session_id and device_id = v_device and ended_at is null;
end;
$$;
revoke all on function public.end_employee_session(uuid, public.session_end_reason) from public, anon;
grant execute on function public.end_employee_session(uuid, public.session_end_reason) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Durcissement : une opération insérée par un appareil doit être attribuée à
-- l'employé connecté par PIN sur cet appareil.
-- -----------------------------------------------------------------------------
drop function private.policy_insert_device(regclass);
create or replace function private.policy_insert_device(p_table regclass, p_employee_column text default 'employee_id')
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format(
    $q$create policy %I on %s for insert to authenticated
       with check (
         station_id = public.current_device_station_id()
         and device_id = public.current_device_id()
         and organization_id = public.current_device_organization_id()
         and %I = public.current_employee_id()
       )$q$,
    private.policy_name(p_table, 'insert_device'), p_table, p_employee_column
  );
end;
$$;
comment on function private.policy_insert_device(regclass, text) is 'Insertion par l''appareil : sa station, son device_id, son organisation, et l''employé de la session active (colonne paramétrable).';

do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('public.evidence_files', 'employee_id'),
      ('public.shifts', 'opened_by'),
      ('public.meter_readings', 'employee_id'),
      ('public.shift_handovers', 'outgoing_employee_id'),
      ('public.tank_readings', 'employee_id'),
      ('public.fuel_deliveries', 'employee_id'),
      ('public.transactions', 'employee_id'),
      ('public.payments', 'employee_id'),
      ('public.credit_entries', 'employee_id'),
      ('public.bank_deposits', 'employee_id'),
      ('public.inventory_movements', 'employee_id'),
      ('public.blind_count_lines', 'employee_id')
    ) as v(tbl, col)
  loop
    execute format('drop policy if exists %I on %s', private.policy_name(t.tbl::regclass, 'insert_device'), t.tbl);
    perform private.policy_insert_device(t.tbl::regclass, t.col);
  end loop;
end
$$;

drop policy voids_insert_device on public.voids;
create policy voids_insert_device on public.voids for insert to authenticated
  with check (
    station_id = public.current_device_station_id()
    and device_id = public.current_device_id()
    and organization_id = public.current_device_organization_id()
    and employee_id = public.current_employee_id()
    and approved_by is null
  );

-- -----------------------------------------------------------------------------
-- 5. Le web doit savoir si un employé a un PIN sans jamais lire le hash.
-- -----------------------------------------------------------------------------
create or replace function public.employees_with_pin()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.employee_id
  from public.employee_pins p
  where p.organization_id in (select public.current_org_ids());
$$;
comment on function public.employees_with_pin() is 'Identifiants des employés de l''organisation qui ont un PIN défini (jamais le hash).';
revoke all on function public.employees_with_pin() from public, anon;
grant execute on function public.employees_with_pin() to authenticated;
