-- GÉNÉRÉ par _build.sh à partir de _src/050_append_only.sql.src — ne pas éditer à la main.
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

-- Garde-fou 1 : append-only pour tout le monde, contre-écriture acceptée, shift clos figé.
create temporary table ctx as
select pg_temp.open_shift('mbour', 'Ibrahima Sarr') as shift,
       pg_temp.new_evidence('mbour', 'Ibrahima Sarr') as evidence,
       gen_random_uuid() as reading,
       gen_random_uuid() as tx,
       gen_random_uuid() as payment,
       gen_random_uuid() as movement;
grant select on ctx to authenticated, service_role, anon;

insert into public.meter_readings (id, organization_id, station_id, device_id, employee_id, shift_id, nozzle_id, kind, index_cl, evidence_id, device_created_at)
select reading, pg_temp.org_demo(), pg_temp.station('mbour'), pg_temp.device('mbour'), pg_temp.employee('mbour', 'Ibrahima Sarr'),
       shift, pg_temp.nozzle('mbour', 'P3-A'), 'open', 21588040, evidence, now() from ctx;

insert into public.transactions (id, organization_id, station_id, device_id, employee_id, shift_id, kind, total_fcfa, device_created_at)
select tx, pg_temp.org_demo(), pg_temp.station('mbour'), pg_temp.device('mbour'), pg_temp.employee('mbour', 'Ibrahima Sarr'),
       shift, 'fuel', 25000, now() from ctx;

insert into public.payments (id, organization_id, station_id, device_id, employee_id, transaction_id, method, amount_fcfa, external_ref, device_created_at)
select payment, pg_temp.org_demo(), pg_temp.station('mbour'), pg_temp.device('mbour'), pg_temp.employee('mbour', 'Ibrahima Sarr'),
       tx, 'wave', 25000, 'WV-TEST-050', now() from ctx;

insert into public.products (id, organization_id, category, name) values (md5('product:test')::uuid, pg_temp.org_demo(), 'shop', 'Eau 1,5 L');
insert into public.inventory_movements (id, organization_id, station_id, device_id, employee_id, product_id, kind, quantity, device_created_at)
select movement, pg_temp.org_demo(), pg_temp.station('mbour'), pg_temp.device('mbour'), pg_temp.employee('mbour', 'Khady Fall'),
       md5('product:test')::uuid, 'purchase', 24, now() from ctx;

-- ---- postgres (propriétaire des tables) : bloqué par le trigger
select throws_like(format('update public.meter_readings set index_cl = 0 where id = %L', (select reading from ctx)), 'APPEND_ONLY%', 'postgres : UPDATE meter_readings refusé');
select throws_like(format('delete from public.meter_readings where id = %L', (select reading from ctx)), 'APPEND_ONLY%', 'postgres : DELETE meter_readings refusé');
select throws_like(format('update public.payments set amount_fcfa = 1 where id = %L', (select payment from ctx)), 'APPEND_ONLY%', 'postgres : UPDATE payments refusé');
select throws_like(format('delete from public.payments where id = %L', (select payment from ctx)), 'APPEND_ONLY%', 'postgres : DELETE payments refusé');
select throws_like(format('update public.inventory_movements set quantity = 1 where id = %L', (select movement from ctx)), 'APPEND_ONLY%', 'postgres : UPDATE inventory_movements refusé');
select throws_like(format('delete from public.inventory_movements where id = %L', (select movement from ctx)), 'APPEND_ONLY%', 'postgres : DELETE inventory_movements refusé');
select throws_like(format('update public.transactions set total_fcfa = 1 where id = %L', (select tx from ctx)), 'APPEND_ONLY%', 'postgres : UPDATE transactions refusé');
select throws_like('delete from public.price_changes', 'APPEND_ONLY%', 'postgres : DELETE price_changes refusé');
select throws_like('delete from public.evidence_files', 'APPEND_ONLY%', 'postgres : DELETE evidence_files refusé');
select throws_like('delete from public.audit_log', 'APPEND_ONLY%', 'postgres : DELETE audit_log refusé');
select throws_like('truncate public.audit_log', 'APPEND_ONLY%', 'postgres : TRUNCATE audit_log refusé');

-- ---- service_role (bypass RLS) : bloqué aussi
select pg_temp.as_service();
select throws_like(format('update public.meter_readings set index_cl = 0 where id = %L', (select reading from ctx)), 'APPEND_ONLY%', 'service_role : UPDATE meter_readings refusé');
select throws_like(format('delete from public.payments where id = %L', (select payment from ctx)), 'APPEND_ONLY%', 'service_role : DELETE payments refusé');
select throws_like(format('delete from public.inventory_movements where id = %L', (select movement from ctx)), 'APPEND_ONLY%', 'service_role : DELETE inventory_movements refusé');
select pg_temp.logout();

-- ---- owner authentifié : aucun privilège UPDATE / DELETE
select pg_temp.login(pg_temp.owner_demo());
select throws_ok(format('update public.meter_readings set index_cl = 0 where id = %L', (select reading from ctx)), '42501', null, 'owner : UPDATE meter_readings refusé');
select throws_ok(format('delete from public.meter_readings where id = %L', (select reading from ctx)), '42501', null, 'owner : DELETE meter_readings refusé');
select throws_ok(format('update public.payments set amount_fcfa = 1 where id = %L', (select payment from ctx)), '42501', null, 'owner : UPDATE payments refusé');
select throws_ok(format('delete from public.payments where id = %L', (select payment from ctx)), '42501', null, 'owner : DELETE payments refusé');
select throws_ok(format('update public.inventory_movements set quantity = 1 where id = %L', (select movement from ctx)), '42501', null, 'owner : UPDATE inventory_movements refusé');
select throws_ok(format('delete from public.inventory_movements where id = %L', (select movement from ctx)), '42501', null, 'owner : DELETE inventory_movements refusé');
select pg_temp.logout();

-- ---- appareil : idem
select pg_temp.login(pg_temp.device_user('mbour'));
select throws_ok(format('update public.meter_readings set index_cl = 0 where id = %L', (select reading from ctx)), '42501', null, 'appareil : UPDATE meter_readings refusé');
select throws_ok(format('delete from public.payments where id = %L', (select payment from ctx)), '42501', null, 'appareil : DELETE payments refusé');
select pg_temp.logout();

select is((select index_cl from public.meter_readings where id = (select reading from ctx)), 21588040::bigint, 'le relevé est intact');
select is((select amount_fcfa from public.payments where id = (select payment from ctx)), 25000::bigint, 'le paiement est intact');

-- ---- Contre-écriture (reverses_id) acceptée, une seule fois, négative
select pg_temp.login_employee('mbour', 'Ibrahima Sarr');
select pg_temp.login(pg_temp.device_user('mbour'));
select throws_ok(
  format('insert into public.transactions (organization_id, station_id, device_id, employee_id, shift_id, kind, total_fcfa, reverses_id, device_created_at)
          values (%L, %L, %L, %L, %L, %L, %s, %L, now())',
         pg_temp.org_demo(), pg_temp.station('mbour'), pg_temp.device('mbour'), pg_temp.employee('mbour', 'Ibrahima Sarr'),
         (select shift from ctx), 'fuel', 25000, (select tx from ctx)),
  '23514', null, 'contre-écriture : un montant positif est refusé'
);
select lives_ok(
  format('insert into public.transactions (organization_id, station_id, device_id, employee_id, shift_id, kind, total_fcfa, reverses_id, device_created_at)
          values (%L, %L, %L, %L, %L, %L, %s, %L, now())',
         pg_temp.org_demo(), pg_temp.station('mbour'), pg_temp.device('mbour'), pg_temp.employee('mbour', 'Ibrahima Sarr'),
         (select shift from ctx), 'fuel', -25000, (select tx from ctx)),
  'contre-écriture : acceptée par l''appareil'
);
select throws_ok(
  format('insert into public.transactions (organization_id, station_id, device_id, employee_id, shift_id, kind, total_fcfa, reverses_id, device_created_at)
          values (%L, %L, %L, %L, %L, %L, %s, %L, now())',
         pg_temp.org_demo(), pg_temp.station('mbour'), pg_temp.device('mbour'), pg_temp.employee('mbour', 'Ibrahima Sarr'),
         (select shift from ctx), 'fuel', -25000, (select tx from ctx)),
  '23505', null, 'contre-écriture : une transaction ne se contre qu''une fois'
);
select pg_temp.logout();
select is((select sum(total_fcfa)::bigint from public.transactions where id = (select tx from ctx) or reverses_id = (select tx from ctx)), 0::bigint, 'contre-écriture : la somme est nulle');

-- ---- Shift clos figé
update public.shifts set status = 'closed', closed_at = now(), closed_by = pg_temp.employee('mbour', 'Ibrahima Sarr') where id = (select shift from ctx);
select throws_like(format('update public.shifts set status = %L where id = %L', 'open', (select shift from ctx)), 'SHIFT_CLOSED%', 'un shift clôturé ne se rouvre pas');
select throws_like(format('update public.shifts set closed_at = now() where id = %L', (select shift from ctx)), 'SHIFT_CLOSED%', 'un shift clôturé ne se modifie plus');

select * from finish();
rollback;
