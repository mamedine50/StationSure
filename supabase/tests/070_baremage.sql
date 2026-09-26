-- GÉNÉRÉ par _build.sh à partir de _src/070_baremage.sql.src — ne pas éditer à la main.
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

-- Garde-fou 5 : volume_from_calibration = mêmes résultats que packages/core (carburant.test.ts).
-- Table de la seed (cuve Super de Mbour) : 0→0, 500 mm→500 000, 1000 mm→1 400 000, 1500 mm→2 000 000 cL.
select is(public.volume_from_calibration(pg_temp.tank('mbour', 'super'), 500), 500000::bigint, 'point exact : 50 cm → 500 000 cL');
select is(public.volume_from_calibration(pg_temp.tank('mbour', 'super'), 0), 0::bigint, 'point exact : 0 cm → 0');
select is(public.volume_from_calibration(pg_temp.tank('mbour', 'super'), 1500), 2000000::bigint, 'point exact : 150 cm → 2 000 000');
select is(public.volume_from_calibration(pg_temp.tank('mbour', 'super'), 750), 950000::bigint, 'interpolation : 75 cm → 950 000 (core)');
select is(public.volume_from_calibration(pg_temp.tank('mbour', 'super'), 600), 680000::bigint, 'interpolation : 60 cm → 680 000 (core)');
select is(public.volume_from_calibration(pg_temp.tank('mbour', 'super'), 1205), 1646000::bigint, 'interpolation : 120,5 cm → 1 646 000 (core)');
select throws_like(format('select public.volume_from_calibration(%L, 1501)', pg_temp.tank('mbour', 'super')), 'BAREMAGE_HORS_TABLE%', 'hors table (au-dessus) → erreur');
select throws_like(format('select public.volume_from_calibration(%L, -1)', pg_temp.tank('mbour', 'super')), 'BAREMAGE_HORS_TABLE%', 'hors table (en dessous) → erreur');
select throws_like(format('select public.volume_from_calibration(%L, 100)', gen_random_uuid()), 'BAREMAGE_TABLE_VIDE%', 'cuve sans barémage → erreur');

-- Arrondi au centilitre le plus proche (1 mm entre 0 et 500 mm : 1000 cL/mm ; ici 999 cL / 3 mm)
insert into public.tanks (id, organization_id, station_id, fuel_product_code, label, capacity_cl)
values (md5('tank:test:arrondi')::uuid, pg_temp.org_demo(), pg_temp.station('mbour'), 'super', 'Cuve test', 100000);
insert into public.tank_calibrations (organization_id, station_id, tank_id, height_mm, volume_cl) values
  (pg_temp.org_demo(), pg_temp.station('mbour'), md5('tank:test:arrondi')::uuid, 0, 0),
  (pg_temp.org_demo(), pg_temp.station('mbour'), md5('tank:test:arrondi')::uuid, 3, 1000);
select is(public.volume_from_calibration(md5('tank:test:arrondi')::uuid, 1), 333::bigint, 'arrondi : 333,33 → 333');
select is(public.volume_from_calibration(md5('tank:test:arrondi')::uuid, 2), 667::bigint, 'arrondi : 666,67 → 667');

-- Le jaugeage stocke le volume calculé par le serveur, pas celui envoyé par l'appareil.
create temporary table ctx as select pg_temp.new_evidence('mbour', 'Ibrahima Sarr') as evidence, gen_random_uuid() as reading;
grant select on ctx to authenticated, service_role, anon;
insert into public.tank_readings (id, organization_id, station_id, device_id, employee_id, tank_id, height_mm, volume_cl, evidence_id, device_created_at)
select reading, pg_temp.org_demo(), pg_temp.station('mbour'), pg_temp.device('mbour'), pg_temp.employee('mbour', 'Ibrahima Sarr'),
       pg_temp.tank('mbour', 'super'), 750, 1, evidence, now() from ctx;
select is((select volume_cl from public.tank_readings where id = (select reading from ctx)), 950000::bigint, 'tank_readings.volume_cl est recalculé côté serveur');
select throws_like(
  format('insert into public.tank_readings (organization_id, station_id, device_id, employee_id, tank_id, height_mm, volume_cl, evidence_id, device_created_at)
          values (%L, %L, %L, %L, %L, 9999, 1, %L, now())',
         pg_temp.org_demo(), pg_temp.station('mbour'), pg_temp.device('mbour'), pg_temp.employee('mbour', 'Ibrahima Sarr'),
         pg_temp.tank('mbour', 'super'), (select evidence from ctx)),
  'BAREMAGE_HORS_TABLE%', 'un jaugeage hors table est refusé'
);

-- Unicité (tank_id, height_mm)
select throws_ok(
  format('insert into public.tank_calibrations (organization_id, station_id, tank_id, height_mm, volume_cl) values (%L, %L, %L, 500, 1)',
         pg_temp.org_demo(), pg_temp.station('mbour'), pg_temp.tank('mbour', 'super')),
  '23505', null, 'barémage : une hauteur ne peut pas apparaître deux fois'
);

select * from finish();
rollback;
