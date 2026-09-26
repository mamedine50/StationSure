-- GÉNÉRÉ par _build.sh à partir de _src/020_isolation_organisations.sql.src — ne pas éditer à la main.
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
  insert into public.shifts (id, organization_id, station_id, device_id, opened_by, opened_at, status, device_created_at)
  values (v_id, pg_temp.org_demo(), pg_temp.station(p_slug), pg_temp.device(p_slug),
          pg_temp.employee(p_slug, p_employee), now(), 'open', now());
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

-- Marque comme reçues (bucket) toutes les preuves de la station (en tant que postgres).
create or replace function pg_temp.upload_all(p_slug text) returns void language sql as $$
  insert into public.evidence_uploads (evidence_id, organization_id, station_id, object_size)
  select e.id, e.organization_id, e.station_id, 1000 from public.evidence_files e
  where e.station_id = pg_temp.station(p_slug) on conflict do nothing $$;
-- Preuve + relevé d'index, exécutés avec les droits de l'appelant (appareil + session employé).
create or replace function pg_temp.meter(p_shift uuid, p_slug text, p_name text, p_label text, p_index bigint, p_kind text,
  p_handover uuid default null, p_side text default null, p_at timestamptz default now()) returns uuid language plpgsql as $$
declare v_ev uuid := gen_random_uuid(); v_id uuid := gen_random_uuid();
begin
  insert into public.evidence_files (id, organization_id, station_id, device_id, employee_id, kind, storage_path, sha256, captured_at_device, device_created_at)
  values (v_ev, pg_temp.org_demo(), pg_temp.station(p_slug), pg_temp.device(p_slug), pg_temp.employee(p_slug, p_name), 'meter_photo',
          pg_temp.org_demo()::text || '/' || pg_temp.station(p_slug)::text || '/' || v_ev::text || '.jpg', repeat('c', 64), p_at, p_at);
  insert into public.meter_readings (id, organization_id, station_id, device_id, employee_id, shift_id, nozzle_id, kind, index_cl, evidence_id,
    device_created_at, handover_id, handover_side)
  values (v_id, pg_temp.org_demo(), pg_temp.station(p_slug), pg_temp.device(p_slug), pg_temp.employee(p_slug, p_name), p_shift,
          pg_temp.nozzle(p_slug, p_label), p_kind::public.meter_reading_kind, p_index, v_ev, p_at, p_handover, p_side::public.handover_side);
  return v_id;
end $$;
-- Preuve + jaugeage (volume envoyé volontairement faux : le serveur l'impose).
create or replace function pg_temp.gauge(p_shift uuid, p_slug text, p_name text, p_fuel text, p_height integer, p_kind text, p_at timestamptz default now())
returns uuid language plpgsql as $$
declare v_ev uuid := gen_random_uuid(); v_id uuid := gen_random_uuid();
begin
  insert into public.evidence_files (id, organization_id, station_id, device_id, employee_id, kind, storage_path, sha256, captured_at_device, device_created_at)
  values (v_ev, pg_temp.org_demo(), pg_temp.station(p_slug), pg_temp.device(p_slug), pg_temp.employee(p_slug, p_name), 'tank_gauge',
          pg_temp.org_demo()::text || '/' || pg_temp.station(p_slug)::text || '/' || v_ev::text || '.jpg', repeat('d', 64), p_at, p_at);
  insert into public.tank_readings (id, organization_id, station_id, device_id, employee_id, tank_id, height_mm, volume_cl, evidence_id, device_created_at, shift_id, kind)
  values (v_id, pg_temp.org_demo(), pg_temp.station(p_slug), pg_temp.device(p_slug), pg_temp.employee(p_slug, p_name), pg_temp.tank(p_slug, p_fuel),
          p_height, 1, v_ev, p_at, p_shift, p_kind::public.tank_reading_kind);
  return v_id;
end $$;

-- Isolation entre organisations et rôle superviseur.
-- Organisation B (plan solo) avec son owner, sa station, son appareil et un employé.
create temporary table ctx as
select
  gen_random_uuid() as org_b,
  pg_temp.new_auth_user('owner-b@test.local') as owner_b,
  pg_temp.new_auth_user('device-b@test.local') as device_user_b,
  pg_temp.new_auth_user('supervisor-a@test.local') as supervisor_a,
  gen_random_uuid() as station_b,
  gen_random_uuid() as device_b;
grant select on ctx to authenticated, service_role, anon;

insert into public.organizations (id, name, plan_code) select org_b, 'Organisation B', 'solo' from ctx;
insert into public.org_members (organization_id, user_id, role) select org_b, owner_b, 'owner' from ctx;
insert into public.org_members (organization_id, user_id, role) select pg_temp.org_demo(), supervisor_a, 'supervisor' from ctx;
insert into public.stations (id, organization_id, name) select station_b, org_b, 'Station B' from ctx;
insert into public.devices (id, organization_id, station_id, auth_user_id, label)
  select device_b, org_b, station_b, device_user_b, 'Tablette B' from ctx;
insert into public.employees (organization_id, station_id, full_name, role)
  select org_b, station_b, 'Employé B', 'manager' from ctx;

-- ---- owner A (démo) ne voit rien de B
select pg_temp.login(pg_temp.owner_demo());
select is((select count(*) from public.organizations), 1::bigint, 'owner A : voit une seule organisation (la sienne)');
select is((select count(*) from public.stations where organization_id = (select org_b from ctx)), 0::bigint, 'owner A : aucune station de B');
select is((select count(*) from public.stations), 3::bigint, 'owner A : voit ses 3 stations');
select is((select count(*) from public.employees where organization_id = (select org_b from ctx)), 0::bigint, 'owner A : aucun employé de B');
select is((select count(*) from public.devices where organization_id = (select org_b from ctx)), 0::bigint, 'owner A : aucun appareil de B');
select is((select count(*) from public.audit_log where organization_id = (select org_b from ctx)), 0::bigint, 'owner A : aucune ligne d''audit de B');
select is((select count(*) from public.org_members where organization_id = (select org_b from ctx)), 0::bigint, 'owner A : aucun membre de B');
select lives_ok(format('update public.organizations set name = %L where id = %L', 'Pirate', (select org_b from ctx)), 'owner A : update sur B ne lève pas d''erreur…');
select pg_temp.logout();
select is((select name from public.organizations where id = (select org_b from ctx)), 'Organisation B', '… mais ne modifie rien (0 ligne visible)');

-- ---- owner B ne voit que B
select pg_temp.login((select owner_b from ctx));
select is((select count(*) from public.stations), 1::bigint, 'owner B : voit sa seule station');
select is((select count(*) from public.stations where organization_id = pg_temp.org_demo()), 0::bigint, 'owner B : aucune station de A');
select is((select count(*) from public.employees), 1::bigint, 'owner B : voit son seul employé');
select is((select count(*) from public.price_changes), 0::bigint, 'owner B : aucun prix de A');
select pg_temp.logout();

-- ---- appareil B ne voit que sa station
select pg_temp.login((select device_user_b from ctx));
select is((select count(*) from public.stations), 1::bigint, 'appareil B : voit sa station');
select is((select count(*) from public.stations where organization_id = pg_temp.org_demo()), 0::bigint, 'appareil B : aucune station de A');
select is((select count(*) from public.nozzles), 0::bigint, 'appareil B : aucun pistolet de A');
select pg_temp.logout();

-- ---- superviseur A : lit tout, n'écrit rien
select pg_temp.login((select supervisor_a from ctx));
select is((select count(*) from public.stations), 3::bigint, 'supervisor A : lit les 3 stations');
select is((select count(*) from public.employees), 9::bigint, 'supervisor A : lit les 9 employés');
select is((select count(*) from public.tank_calibrations), 42::bigint, 'supervisor A : lit le barémage (3 stations × 14 points)');
select throws_ok(
  format('insert into public.stations (organization_id, name) values (%L, %L)', pg_temp.org_demo(), 'Station pirate'),
  '42501', null, 'supervisor A : ne peut pas créer de station'
);
select throws_ok(
  format('insert into public.employees (organization_id, station_id, full_name, role) values (%L, %L, %L, %L)',
         pg_temp.org_demo(), pg_temp.station('mbour'), 'Pirate', 'manager'),
  '42501', null, 'supervisor A : ne peut pas créer d''employé'
);
select throws_ok(
  format('insert into public.price_changes (organization_id, station_id, fuel_product_code, price_fcfa_per_litre, created_by) values (%L, %L, %L, %s, %L)',
         pg_temp.org_demo(), pg_temp.station('mbour'), 'super', 1000, (select supervisor_a from ctx)),
  '42501', null, 'supervisor A : ne peut pas publier de prix'
);
select lives_ok(format('update public.stations set name = %L where id = %L', 'Renommée', pg_temp.station('mbour')), 'supervisor A : update station sans erreur…');
select pg_temp.logout();
select is((select name from public.stations where id = pg_temp.station('mbour')), 'Mbour', '… mais la station n''est pas modifiée');

select * from finish();
rollback;
