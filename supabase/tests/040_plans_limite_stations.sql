-- GÉNÉRÉ par _build.sh à partir de _src/040_plans_limite_stations.sql.src — ne pas éditer à la main.
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
-- Ouvre une session employé sur l'appareil d'une station (en tant que postgres), comme verify_employee_pin le ferait.
create or replace function pg_temp.login_employee(p_slug text, p_name text) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  update public.employee_sessions set ended_at = now(), ended_reason = 'replaced'
  where device_id = pg_temp.device(p_slug) and ended_at is null;
  insert into public.employee_sessions (id, organization_id, station_id, device_id, employee_id, expires_at)
  values (v_id, pg_temp.org_demo(), pg_temp.station(p_slug), pg_temp.device(p_slug), pg_temp.employee(p_slug, p_name), now() + interval '12 hours');
  return v_id;
end $$;

-- Garde-fou 2 : limite de stations selon le plan.
create or replace function pg_temp.org_with_plan(p_plan public.plan_code) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into public.organizations (id, name, plan_code) values (v_id, 'Org ' || p_plan, p_plan);
  return v_id;
end $$;

create temporary table ctx as
select pg_temp.org_with_plan('solo') as org_solo,
       pg_temp.org_with_plan('groupe') as org_groupe,
       pg_temp.org_with_plan('reseau') as org_reseau;
grant select on ctx to authenticated, service_role, anon;

-- solo : 1 station puis refus
select lives_ok(format('insert into public.stations (organization_id, name) values (%L, %L)', (select org_solo from ctx), 'Solo 1'), 'plan solo : 1re station acceptée');
select throws_like(format('insert into public.stations (organization_id, name) values (%L, %L)', (select org_solo from ctx), 'Solo 2'), 'STATION_LIMIT%', 'plan solo : 2e station refusée');
select is((select count(*) from public.stations where organization_id = (select org_solo from ctx)), 1::bigint, 'plan solo : une seule station en base');

-- groupe : 5 stations puis refus
select lives_ok(
  format('insert into public.stations (organization_id, name) select %L, %L || g from generate_series(1, 5) g', (select org_groupe from ctx), 'Groupe '),
  'plan groupe : 5 stations acceptées'
);
select throws_like(format('insert into public.stations (organization_id, name) values (%L, %L)', (select org_groupe from ctx), 'Groupe 6'), 'STATION_LIMIT%', 'plan groupe : 6e station refusée');
select is((select count(*) from public.stations where organization_id = (select org_groupe from ctx)), 5::bigint, 'plan groupe : 5 stations en base');

-- reseau : illimité
select lives_ok(
  format('insert into public.stations (organization_id, name) select %L, %L || g from generate_series(1, 12) g', (select org_reseau from ctx), 'Réseau '),
  'plan reseau : 12 stations acceptées'
);
select is((select count(*) from public.stations where organization_id = (select org_reseau from ctx)), 12::bigint, 'plan reseau : pas de limite');

-- La limite s'applique aussi à l'owner authentifié (démo = groupe, 3 stations déjà)
select pg_temp.login(pg_temp.owner_demo());
select lives_ok(format('insert into public.stations (organization_id, name) values (%L, %L)', pg_temp.org_demo(), 'Démo 4'), 'owner démo : 4e station acceptée');
select lives_ok(format('insert into public.stations (organization_id, name) values (%L, %L)', pg_temp.org_demo(), 'Démo 5'), 'owner démo : 5e station acceptée');
select throws_like(format('insert into public.stations (organization_id, name) values (%L, %L)', pg_temp.org_demo(), 'Démo 6'), 'STATION_LIMIT%', 'owner démo : 6e station refusée');
select pg_temp.logout();

select * from finish();
rollback;
