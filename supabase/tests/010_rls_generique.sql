-- GÉNÉRÉ par _build.sh à partir de _src/010_rls_generique.sql.src — ne pas éditer à la main.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Préambule commun (copié en tête de chaque fichier de test, les fichiers étant
-- exécutés dans des transactions séparées). Simule un JWT Supabase.
create or replace function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.logout() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end $$;
create or replace function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'service_role', true);
end $$;
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
end $$;
-- Identifiants de la seed
create or replace function pg_temp.org_demo() returns uuid language sql as $$ select md5('org:demo')::uuid $$;
create or replace function pg_temp.owner_demo() returns uuid language sql as $$ select md5('user:owner@demo.local')::uuid $$;
create or replace function pg_temp.station(p_slug text) returns uuid language sql as $$ select md5('station:' || p_slug)::uuid $$;
create or replace function pg_temp.device(p_slug text) returns uuid language sql as $$ select md5('device:' || p_slug)::uuid $$;
create or replace function pg_temp.device_user(p_slug text) returns uuid language sql as $$ select md5('user:device-' || p_slug || '@demo.local')::uuid $$;
create or replace function pg_temp.employee(p_slug text, p_name text) returns uuid language sql as $$ select md5('employee:' || p_slug || ':' || p_name)::uuid $$;
create or replace function pg_temp.tank(p_slug text, p_fuel text) returns uuid language sql as $$ select md5('tank:' || p_slug || ':' || p_fuel)::uuid $$;
create or replace function pg_temp.nozzle(p_slug text, p_label text) returns uuid language sql as $$ select md5('nozzle:' || p_slug || ':' || p_label)::uuid $$;
-- Crée un utilisateur auth de test
create or replace function pg_temp.new_auth_user(p_email text) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change, is_sso_user)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt('test', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}',
    now(), now(), '', '', '', '', false);
  return v_id;
end $$;
-- Ouvre un shift + une preuve pour une station de la seed (en tant que postgres)
create or replace function pg_temp.open_shift(p_slug text, p_employee text) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into public.shifts (id, organization_id, station_id, device_id, opened_by, opened_at, device_created_at)
  values (v_id, pg_temp.org_demo(), pg_temp.station(p_slug), pg_temp.device(p_slug),
          pg_temp.employee(p_slug, p_employee), now(), now());
  return v_id;
end $$;
create or replace function pg_temp.new_evidence(p_slug text, p_employee text) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into public.evidence_files (id, organization_id, station_id, device_id, employee_id, kind, storage_path, sha256,
    captured_at_device, device_created_at)
  values (v_id, pg_temp.org_demo(), pg_temp.station(p_slug), pg_temp.device(p_slug), pg_temp.employee(p_slug, p_employee),
    'meter_photo', pg_temp.org_demo()::text || '/' || pg_temp.station(p_slug)::text || '/' || v_id::text || '.jpg',
    repeat('a', 64), now(), now());
  return v_id;
end $$;

-- Tests génériques : RLS partout, aucune policy « true », anon sans aucun accès.
select is(
  (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity),
  0::bigint,
  'RLS activée sur 100 % des tables du schéma public'
);

select is(
  (select count(*) from pg_policies where schemaname = 'public' and (qual = 'true' or with_check = 'true')),
  0::bigint,
  'Aucune policy using (true) / with check (true)'
);

select is(
  (select count(*) from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public'),
  0::bigint,
  'anon n''a aucun privilège sur les tables public'
);

select is(
  (select count(*) from pg_tables t
   where t.schemaname = 'public'
     and has_table_privilege('anon', format('%I.%I', t.schemaname, t.tablename), 'SELECT')),
  0::bigint,
  'anon ne peut lire aucune table public'
);

select is(
  (select count(*) from information_schema.role_routine_grants
   where grantee = 'anon' and specific_schema = 'public'),
  0::bigint,
  'anon ne peut appeler aucune fonction public'
);

-- Toutes les tables porteuses de station_id portent aussi organization_id (convention RLS).
select is(
  (select count(*) from information_schema.columns c
   where c.table_schema = 'public' and c.column_name = 'station_id'
     and not exists (select 1 from information_schema.columns o
                     where o.table_schema = 'public' and o.table_name = c.table_name and o.column_name = 'organization_id')),
  0::bigint,
  'Chaque table avec station_id porte organization_id'
);

-- Chaque table public a au moins une policy, sauf employee_pins (verrouillée volontairement).
select is(
  (select count(*) from pg_tables t
   where t.schemaname = 'public' and t.tablename <> 'employee_pins'
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename)),
  0::bigint,
  'Chaque table (hors employee_pins) a au moins une policy'
);

select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'employee_pins'),
  0::bigint,
  'employee_pins n''a aucune policy : inaccessible par l''API'
);

-- anon en pratique
select pg_temp.as_anon();
select throws_ok('select count(*) from public.stations', '42501', null, 'anon : select stations refusé');
select throws_ok('select count(*) from public.employees', '42501', null, 'anon : select employees refusé');
select throws_ok('select count(*) from public.transactions', '42501', null, 'anon : select transactions refusé');
select throws_ok('select count(*) from public.current_fuel_prices', '42501', null, 'anon : select current_fuel_prices refusé');
select throws_ok('select public.current_org_ids()', '42501', null, 'anon : helpers RLS inaccessibles');
select pg_temp.logout();

select * from finish();
rollback;
