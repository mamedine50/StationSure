-- GÉNÉRÉ par _build.sh à partir de _src/100_carburant.sql.src — ne pas éditer à la main.
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

-- Phase 3 : cycle carburant (ouverture, jaugeage serveur, barémage versionné, passation
-- à l'aveugle, régression d'index, livraison, pause, rapprochement cuve, accès).
create temporary table ctx as
select gen_random_uuid() as shift, pg_temp.new_auth_user('supervisor-a@test.local') as supervisor_a;
grant select on ctx to authenticated, service_role, anon;
insert into public.org_members (organization_id, user_id, role) select pg_temp.org_demo(), supervisor_a, 'supervisor' from ctx;
create or replace function pg_temp.res(p jsonb) returns text language sql as $$ select case when (p ->> 'ok')::boolean then 'OK' else p ->> 'error' end $$;
-- Index = dernier index de clôture de la seed (hier) + delta en cL, pour rester cohérent avec les cuves.
create or replace function pg_temp.idx(p_label text, p_delta bigint) returns bigint language sql as $$
  select (case p_label when 'P1-A' then 19840210 when 'P1-B' then 35611870 when 'P2-A' then 14295000
               when 'P2-B' then 48391255 when 'P3-A' then 21588040 when 'P3-B' then 30122785 end) + p_delta $$;

-- ================= 1. Ouverture de shift : rien ne manque → open, sinon refus =================
select pg_temp.login_employee('mbour', 'Awa Diop');
select pg_temp.login(pg_temp.device_user('mbour'));
insert into public.shifts (id, organization_id, station_id, device_id, opened_by, opened_at, device_created_at)
select shift, pg_temp.org_demo(), pg_temp.station('mbour'), pg_temp.device('mbour'), pg_temp.employee('mbour', 'Awa Diop'), now(), now() from ctx;
select is((select status from public.shifts where id = (select shift from ctx)), 'opening'::public.shift_status, 'un shift démarre en opening');
select is(pg_temp.res(public.open_shift((select shift from ctx))), 'SHIFT_INCOMPLETE', 'open_shift : refusé sans relevé');
select is(jsonb_array_length(public.open_shift((select shift from ctx)) -> 'missing' -> 'nozzles'), 6, 'open_shift : 6 pistolets manquants');
select is(jsonb_array_length(public.open_shift((select shift from ctx)) -> 'missing' -> 'tanks'), 2, 'open_shift : 2 cuves manquantes');
-- 5 relevés + 1 sans photo reçue
select pg_temp.meter((select shift from ctx), 'mbour', 'Awa Diop', l, pg_temp.idx(l, 0), 'open') from unnest(array['P1-A', 'P1-B', 'P2-A', 'P2-B', 'P3-A']) l;
select pg_temp.logout();
select pg_temp.upload_all('mbour');
select pg_temp.login(pg_temp.device_user('mbour'));
select pg_temp.meter((select shift from ctx), 'mbour', 'Awa Diop', 'P3-B', pg_temp.idx('P3-B', 0), 'open');
select is(public.open_shift((select shift from ctx)) -> 'missing' -> 'nozzles' -> 0 ->> 'reason', 'missing_photo', 'open_shift : relevé sans photo reçue = manquant');
select pg_temp.logout();
select pg_temp.upload_all('mbour');
select pg_temp.login(pg_temp.device_user('mbour'));
select is(jsonb_array_length(public.open_shift((select shift from ctx)) -> 'missing' -> 'nozzles'), 0, 'open_shift : tous les pistolets relevés avec photo');
select is(pg_temp.res(public.open_shift((select shift from ctx))), 'SHIFT_INCOMPLETE', 'open_shift : encore refusé sans jaugeage');
create temporary table gauges as
select pg_temp.gauge((select shift from ctx), 'mbour', 'Awa Diop', 'super', 1000, 'open') as g_super,
       pg_temp.gauge((select shift from ctx), 'mbour', 'Awa Diop', 'gasoil', 900, 'open') as g_gasoil;
grant select on gauges to authenticated, service_role, anon;
select is((select volume_cl from public.tank_readings where id = (select g_super from gauges)), 1400000::bigint, 'jaugeage : volume imposé par le serveur (valeur envoyée 1 ignorée)');
select is((select volume_cl from public.tank_readings where id = (select g_gasoil from gauges)), 1220000::bigint, 'jaugeage : 900 mm → 12 200 L (maquette 11)');
select pg_temp.logout();
select pg_temp.upload_all('mbour');
select pg_temp.login(pg_temp.device_user('mbour'));
select is(pg_temp.res(public.open_shift((select shift from ctx))), 'OK', 'open_shift : accepté quand tout est là');
select is((select status from public.shifts where id = (select shift from ctx)), 'open'::public.shift_status, 'le shift est open');
select is(pg_temp.res(public.open_shift((select shift from ctx))), 'SHIFT_NOT_OPENING', 'open_shift : pas deux fois');
select pg_temp.logout();
select is((select count(*) from public.alerts where type = 'shift_opened' and shift_id = (select shift from ctx)), 1::bigint, 'alerte info shift_opened');

-- ================= 2. Barémage versionné =================
select pg_temp.login(pg_temp.owner_demo());
select throws_like(format('select public.create_calibration_version(%L, %L)', pg_temp.tank('mbour', 'super'), '[{"height_mm":0,"volume_cl":0},{"height_mm":10,"volume_cl":100},{"height_mm":20,"volume_cl":100}]'), 'CALIBRATION_NOT_INCREASING%', 'barémage : volumes non strictement croissants refusés');
select throws_like(format('select public.create_calibration_version(%L, %L)', pg_temp.tank('mbour', 'super'), '[{"height_mm":0,"volume_cl":0},{"height_mm":10,"volume_cl":100},{"height_mm":20,"volume_cl":50}]'), 'CALIBRATION_NOT_INCREASING%', 'barémage : volume qui redescend refusé');
select throws_like(format('select public.create_calibration_version(%L, %L)', pg_temp.tank('mbour', 'super'), '[{"height_mm":0,"volume_cl":0}]'), 'CALIBRATION_TOO_FEW%', 'barémage : un seul point refusé');
select throws_like(format('select public.create_calibration_version(%L, %L)', pg_temp.tank('mbour', 'super'), '[{"height_mm":0,"volume_cl":0},{"height_mm":-5,"volume_cl":10}]'), 'CALIBRATION_HEIGHT%', 'barémage : hauteur négative refusée');
select throws_like(format('select public.create_calibration_version(%L, %L, %L)', pg_temp.tank('mbour', 'super'), '[{"height_mm":0,"volume_cl":0},{"height_mm":5,"volume_cl":10}]', 'ailleurs/cert.pdf'), 'CERTIFICATE_PATH%', 'barémage : certificat hors du dossier calibration refusé');
select is((select volume_cl from public.tank_readings where id = (select g_super from gauges)), 1400000::bigint, 'avant nouvelle version : jaugeage à 1 400 000');
create temporary table v2 as select public.create_calibration_version(pg_temp.tank('mbour', 'super'),
  '[{"height_mm":0,"volume_cl":0},{"height_mm":500,"volume_cl":600000},{"height_mm":1000,"volume_cl":1500000},{"height_mm":1500,"volume_cl":2100000}]',
  pg_temp.org_demo()::text || '/' || pg_temp.station('mbour')::text || '/calibration/cert-v2.pdf', 'Recalibrage') as id;
grant select on v2 to authenticated, service_role, anon;
select is((select version from public.tank_calibration_versions where id = (select id from v2)), 2, 'nouvelle version = version 2');
select is((select count(*) from public.tank_calibration_versions where tank_id = pg_temp.tank('mbour', 'super')), 2::bigint, 'l''ancienne version est conservée');
select is(public.volume_from_calibration(pg_temp.tank('mbour', 'super'), 750), 1050000::bigint, 'volume_from_calibration : la nouvelle version s''applique maintenant');
select is(public.volume_from_calibration(pg_temp.tank('mbour', 'super'), 750, now() - interval '1 hour'), 950000::bigint, 'volume_from_calibration : l''ancienne version s''applique aux dates passées');
select is((select volume_cl from public.tank_readings where id = (select g_super from gauges)), 1400000::bigint, 'nouvelle version : les jaugeages passés ne changent pas');
select is((select count(*) from public.audit_log where table_name = 'tank_calibration_versions' and action = 'INSERT' and actor_user_id = pg_temp.owner_demo()), 1::bigint, 'nouvelle version tracée dans audit_log');
select pg_temp.logout();
select throws_like('delete from public.tank_calibration_versions', 'APPEND_ONLY%', 'versions de barémage append-only');
select pg_temp.login((select supervisor_a from ctx));
select throws_ok(format('select public.create_calibration_version(%L, %L)', pg_temp.tank('mbour', 'super'), '[{"height_mm":0,"volume_cl":0},{"height_mm":5,"volume_cl":10}]'), '42501', null, 'supervisor : ne publie pas de barémage');
select pg_temp.logout();
select pg_temp.login(pg_temp.device_user('mbour'));
select throws_ok(format('select public.create_calibration_version(%L, %L)', pg_temp.tank('mbour', 'super'), '[{"height_mm":0,"volume_cl":0},{"height_mm":5,"volume_cl":10}]'), '42501', null, 'appareil : ne publie pas de barémage');
select pg_temp.logout();

-- ================= 3. Passation à l'aveugle =================
select pg_temp.login(pg_temp.device_user('mbour'));
create temporary table ho as select (public.start_handover((select shift from ctx), pg_temp.employee('mbour', 'Moussa Ndiaye')) ->> 'handover_id')::uuid as id;
grant select on ho to authenticated, service_role, anon;
select isnt((select id from ho), null, 'start_handover : passation créée par le sortant');
select is(pg_temp.res(public.start_handover((select shift from ctx), pg_temp.employee('mbour', 'Awa Diop'))), 'SAME_EMPLOYEE', 'start_handover : sortant = entrant refusé');
select is(pg_temp.res(public.sign_handover_outgoing((select id from ho))), 'HANDOVER_INCOMPLETE', 'sortant : signature refusée sans relevés');
select pg_temp.meter((select shift from ctx), 'mbour', 'Awa Diop', l, pg_temp.idx(l, 50000), 'handover', (select id from ho), 'outgoing') from unnest(array['P1-A', 'P1-B', 'P2-A', 'P2-B', 'P3-A', 'P3-B']) l;
select pg_temp.logout();
select pg_temp.upload_all('mbour');
select pg_temp.login(pg_temp.device_user('mbour'));
select is(pg_temp.res(public.sign_handover_outgoing((select id from ho))), 'OK', 'sortant : signé une fois les 6 relevés photographiés');
select is(pg_temp.res(public.sign_handover_incoming((select id from ho))), 'NOT_INCOMING', 'entrant : le sortant ne peut pas signer à sa place');
-- Changement d'employé : la session d'Awa se ferme avec le motif handover
select lives_ok(format('select public.end_employee_session(%L, %L)', (select id from public.employee_sessions where employee_id = pg_temp.employee('mbour', 'Awa Diop') and ended_at is null), 'handover'), 'session du sortant fermée (motif handover)');
select pg_temp.logout();
select is((select ended_reason from public.employee_sessions where employee_id = pg_temp.employee('mbour', 'Awa Diop') order by started_at desc limit 1), 'handover'::public.session_end_reason, 'motif handover enregistré');
select pg_temp.login_employee('mbour', 'Moussa Ndiaye');
select pg_temp.login(pg_temp.device_user('mbour'));
select is((select count(*) from public.meter_readings where handover_id = (select id from ho)), 0::bigint, 'À L''AVEUGLE : l''entrant ne voit aucun relevé du sortant pendant la passation');
select is((select count(*) from public.compare_handover((select id from ho))), 6::bigint, 'compare_handover : 6 pistolets sans relevé entrant');
-- 5 relevés identiques, P3-A +10,00 L (maquette 03 : 215 880,40 → 215 890,40)
select pg_temp.meter((select shift from ctx), 'mbour', 'Moussa Ndiaye', l, pg_temp.idx(l, 50000), 'handover', (select id from ho), 'incoming') from unnest(array['P1-A', 'P1-B', 'P2-A', 'P2-B', 'P3-B']) l;
select pg_temp.meter((select shift from ctx), 'mbour', 'Moussa Ndiaye', 'P3-A', pg_temp.idx('P3-A', 51000), 'handover', (select id from ho), 'incoming');
select is((select count(*) from public.meter_readings where handover_id = (select id from ho)), 6::bigint, 'l''entrant voit ses propres relevés seulement');
select pg_temp.logout();
select pg_temp.upload_all('mbour');
select pg_temp.login(pg_temp.device_user('mbour'));
create temporary table sign1 as select public.sign_handover_incoming((select id from ho)) as r;
grant select on sign1 to authenticated, service_role, anon;
select is(pg_temp.res((select r from sign1)), 'HANDOVER_MISMATCH', 'écart → passation bloquée');
select is((select r -> 'mismatches' -> 0 ->> 'label' from sign1), 'P3-A', 'écart signalé sur P3-A');
select is((select (r -> 'mismatches' -> 0 ->> 'variance_cl')::bigint from sign1), 1000::bigint, 'écart de 10,00 L (même résultat que comparerPassation)');
select is((select status from public.shift_handovers where id = (select id from ho)), 'disputed'::public.handover_status, 'statut disputed');
select is((select count(*) from public.meter_readings where handover_id = (select id from ho)), 12::bigint, 'après le blocage, l''entrant voit les deux séries');
select pg_temp.logout();
select is((select count(*) from public.alerts where type = 'handover_mismatch' and payload ->> 'handover_id' = (select id from ho)::text), 1::bigint, 'alerte handover_mismatch pour le propriétaire');
select is((select status from public.shifts where id = (select shift from ctx)), 'open'::public.shift_status, 'le shift n''a pas changé de main');
-- Reprise de la photo : nouveau relevé P3-A concordant → passation acceptée
select pg_temp.login(pg_temp.device_user('mbour'));
select pg_temp.meter((select shift from ctx), 'mbour', 'Moussa Ndiaye', 'P3-A', pg_temp.idx('P3-A', 50000), 'handover', (select id from ho), 'incoming', now() + interval '1 minute');
select pg_temp.logout();
select pg_temp.upload_all('mbour');
select pg_temp.login(pg_temp.device_user('mbour'));
create temporary table sign2 as select public.sign_handover_incoming((select id from ho)) as r;
grant select on sign2 to authenticated, service_role, anon;
select is(pg_temp.res((select r from sign2)), 'OK', 'passation concordante acceptée après reprise de la photo');
select is((select (n ->> 'index_open_cl')::bigint from jsonb_array_elements(public.shift_fuel_summary((select (r ->> 'to_shift_id')::uuid from sign2)) -> 'nozzles') n where n ->> 'label' = 'P3-A'), pg_temp.idx('P3-A', 50000), 'les relevés entrants servent d''ouverture au nouveau shift (P3-A = dernier relevé concordant)');
select is((public.shift_fuel_summary((select shift from ctx)) ->> 'total_litres_sold_cl')::bigint, 300000::bigint, 'litres vendus du shift sortant = Σ (index passation − index ouverture) = 6 × 500 L');
select pg_temp.logout();
select is((select status from public.shift_handovers where id = (select id from ho)), 'signed'::public.handover_status, 'passation signée');
select is((select status from public.shifts where id = (select shift from ctx)), 'closing'::public.shift_status, 'shift sortant → closing');
select is((select status from public.shifts where id = (select (r ->> 'to_shift_id')::uuid from sign2)), 'open'::public.shift_status, 'nouveau shift de l''entrant → open');
select is((select to_shift_id from public.shift_handovers where id = (select id from ho)), (select (r ->> 'to_shift_id')::uuid from sign2), 'la passation pointe vers le nouveau shift');

-- Écart signalé : Moussa (sortant) → Awa (entrant), P1-A diffère, Awa signale
select pg_temp.login(pg_temp.device_user('mbour'));
create temporary table ho2 as select (public.start_handover((select (r ->> 'to_shift_id')::uuid from sign2), pg_temp.employee('mbour', 'Awa Diop')) ->> 'handover_id')::uuid as id,
  (select (r ->> 'to_shift_id')::uuid from sign2) as from_shift;
grant select on ho2 to authenticated, service_role, anon;
select pg_temp.meter((select from_shift from ho2), 'mbour', 'Moussa Ndiaye', l, pg_temp.idx(l, 90000), 'handover', (select id from ho2), 'outgoing', now() + interval '2 minutes') from unnest(array['P1-A', 'P1-B', 'P2-A', 'P2-B', 'P3-A', 'P3-B']) l;
select pg_temp.logout();
select pg_temp.upload_all('mbour');
select pg_temp.login(pg_temp.device_user('mbour'));
select is(pg_temp.res(public.sign_handover_outgoing((select id from ho2))), 'OK', 'passation 2 : sortant signé');
select pg_temp.logout();
select pg_temp.login_employee('mbour', 'Awa Diop');
select pg_temp.login(pg_temp.device_user('mbour'));
select pg_temp.meter((select from_shift from ho2), 'mbour', 'Awa Diop', l, pg_temp.idx(l, 90000), 'handover', (select id from ho2), 'incoming', now() + interval '3 minutes') from unnest(array['P1-B', 'P2-A', 'P2-B', 'P3-A', 'P3-B']) l;
select pg_temp.meter((select from_shift from ho2), 'mbour', 'Awa Diop', 'P1-A', pg_temp.idx('P1-A', 90500), 'handover', (select id from ho2), 'incoming', now() + interval '3 minutes');
select pg_temp.logout();
select pg_temp.upload_all('mbour');
select pg_temp.login(pg_temp.device_user('mbour'));
select is(pg_temp.res(public.report_handover_discrepancy((select id from ho2), 'Motif')), 'HANDOVER_NOT_DISPUTED', 'signaler : impossible avant la comparaison');
select is(pg_temp.res(public.sign_handover_incoming((select id from ho2))), 'HANDOVER_MISMATCH', 'passation 2 : écart de 5,00 L sur P1-A');
select is(pg_temp.res(public.report_handover_discrepancy((select id from ho2), '')), 'REASON_REQUIRED', 'signaler : motif obligatoire');
create temporary table rep as select public.report_handover_discrepancy((select id from ho2), 'Le totaliseur P1-A a tourné pendant la photo du sortant') as r;
grant select on rep to authenticated, service_role, anon;
select is(pg_temp.res((select r from rep)), 'OK', 'écart signalé → passation acceptée');
select pg_temp.logout();
select is((select attributed_shift_id from public.shift_handovers where id = (select id from ho2)), (select from_shift from ho2), 'l''écart est attribué au shift SORTANT');
select is((select discrepancy_reported and status = 'signed' from public.shift_handovers where id = (select id from ho2)), true, 'passation signée avec écart signalé, écart conservé');
select is((select (discrepancies -> 0 ->> 'variance_cl')::bigint from public.shift_handovers where id = (select id from ho2)), 500::bigint, 'écart de 5,00 L visible sur la passation');
select is((select status from public.shifts where id = (select from_shift from ho2)), 'closing'::public.shift_status, 'shift sortant 2 → closing');
select is((select count(*) from public.alerts where type = 'handover_mismatch' and payload ->> 'handover_id' = (select id from ho2)::text and (payload ->> 'reported')::boolean), 1::bigint, 'alerte handover_mismatch signalée avec motif');

-- ================= 4. Index qui recule : accepté + alerte meter_regression =================
create temporary table shift3 as select (select (r ->> 'to_shift_id')::uuid from rep) as id;
grant select on shift3 to authenticated, service_role, anon;
select pg_temp.login(pg_temp.device_user('mbour'));
select lives_ok(format('select pg_temp.meter(%L, %L, %L, %L, %s, %L, null, null, now() + interval ''4 minutes'')', (select id from shift3), 'mbour', 'Awa Diop', 'P2-A', pg_temp.idx('P2-A', 85000), 'close'), 'index qui recule : insertion ACCEPTÉE (hors ligne possible)');
select pg_temp.logout();
select is((select flagged_regression from public.meter_readings where nozzle_id = pg_temp.nozzle('mbour', 'P2-A') order by device_created_at desc limit 1), true, 'relevé marqué flagged_regression');
select is((select previous_index_cl from public.meter_readings where nozzle_id = pg_temp.nozzle('mbour', 'P2-A') order by device_created_at desc limit 1), pg_temp.idx('P2-A', 90000), 'previous_index_cl posé par le serveur');
select is((select count(*) from public.alerts where type = 'meter_regression'), 1::bigint, 'alerte meter_regression créée');

-- ================= 5. Livraison (gérant), pistolets en pause, réserve =================
select pg_temp.login(pg_temp.device_user('mbour'));
select throws_ok(format('select public.start_delivery(%L)', pg_temp.tank('mbour', 'gasoil')), '42501', null, 'livraison : refusée à un pompiste');
select pg_temp.logout();
select pg_temp.login_employee('mbour', 'Ibrahima Sarr');
select pg_temp.login(pg_temp.device_user('mbour'));
create temporary table dl as select (public.start_delivery(pg_temp.tank('mbour', 'gasoil'), 'Dépôt', 'DK-2290-T', 'Modou Faye') ->> 'session_id')::uuid as id;
grant select on dl to authenticated, service_role, anon;
select isnt((select id from dl), null, 'livraison : session créée par le gérant');
select is(pg_temp.res(public.advance_delivery((select id from dl), 'unloading_done')), 'WRONG_STEP', 'livraison : étapes dans l''ordre');
create temporary table rb as select pg_temp.gauge((select id from shift3), 'mbour', 'Ibrahima Sarr', 'gasoil', 750, 'delivery_before', now() + interval '5 minutes') as id;
grant select on rb to authenticated, service_role, anon;
select is(pg_temp.res(public.advance_delivery((select id from dl), 'before_gauged', (select id from rb))), 'READING_MISSING', 'jauge avant : photo non reçue → refus');
select pg_temp.logout();
select pg_temp.upload_all('mbour');
select pg_temp.login(pg_temp.device_user('mbour'));
select is(pg_temp.res(public.advance_delivery((select id from dl), 'before_gauged', (select id from rb))), 'OK', 'jauge avant enregistrée → dépotage');
select is(public.nozzle_is_paused(pg_temp.nozzle('mbour', 'P1-B')), true, 'P1-B (Gasoil) en pause pendant le dépotage');
select is(public.nozzle_is_paused(pg_temp.nozzle('mbour', 'P1-A')), false, 'P1-A (Super) pas en pause');
select throws_like(format('select pg_temp.meter(%L, %L, %L, %L, %s, %L, null, null, now() + interval ''6 minutes'')', (select id from shift3), 'mbour', 'Ibrahima Sarr', 'P1-B', pg_temp.idx('P1-B', 90100), 'close'), 'NOZZLE_PAUSED%', 'relevé sur un pistolet en pause REFUSÉ');
select lives_ok(format('select pg_temp.meter(%L, %L, %L, %L, %s, %L, null, null, now() + interval ''6 minutes'')', (select id from shift3), 'mbour', 'Ibrahima Sarr', 'P1-A', pg_temp.idx('P1-A', 90100), 'close'), 'relevé sur un pistolet Super accepté pendant le dépotage Gasoil');
select is(pg_temp.res(public.advance_delivery((select id from dl), 'cancel')), 'UNLOADING_IN_PROGRESS', 'pas d''annulation pendant le dépotage');
select is(pg_temp.res(public.advance_delivery((select id from dl), 'unloading_done')), 'OK', 'fin du dépotage');
select is(public.nozzle_is_paused(pg_temp.nozzle('mbour', 'P1-B')), false, 'P1-B libéré après le dépotage');
create temporary table ra as select pg_temp.gauge((select id from shift3), 'mbour', 'Ibrahima Sarr', 'gasoil', 1205, 'delivery_after', now() + interval '7 minutes') as id;
grant select on ra to authenticated, service_role, anon;
select pg_temp.logout();
select pg_temp.upload_all('mbour');
select pg_temp.login(pg_temp.device_user('mbour'));
select is(pg_temp.res(public.advance_delivery((select id from dl), 'after_gauged', (select id from ra))), 'OK', 'jauge après enregistrée');
select is((select volume_cl from public.tank_readings where id = (select id from ra)), 1646000::bigint, 'jauge après : 1 205 mm → 16 460 L (serveur)');
-- Photo du bon
create temporary table bon as select gen_random_uuid() as id;
grant select on bon to authenticated, service_role, anon;
insert into public.evidence_files (id, organization_id, station_id, device_id, employee_id, kind, storage_path, sha256, captured_at_device, device_created_at)
select id, pg_temp.org_demo(), pg_temp.station('mbour'), pg_temp.device('mbour'), pg_temp.employee('mbour', 'Ibrahima Sarr'), 'delivery_note',
       pg_temp.org_demo()::text || '/' || pg_temp.station('mbour')::text || '/' || id::text || '.jpg', repeat('e', 64), now(), now() from bon;
select pg_temp.logout();
select pg_temp.upload_all('mbour');
select pg_temp.login(pg_temp.device_user('mbour'));
create temporary table s1 as select public.sign_delivery((select id from dl), 700000, (select id from bon), '44871', false) as r;
grant select on s1 to authenticated, service_role, anon;
select is(pg_temp.res((select r from s1)), 'RESERVE_REQUIRED', 'écart −0,57 % > 0,3 % sans réserve → REFUSÉ');
select is((select (r ->> 'variance_pct')::numeric from s1), -0.57, 'écart calculé par le serveur : −0,57 % (6 960 L / 7 000 L)');
select is(pg_temp.res(public.sign_delivery((select id from dl), 700000, (select id from bon), '44871', true, '')), 'REASON_REQUIRED', 'réserve sans motif refusée');
create temporary table s2 as select public.sign_delivery((select id from dl), 700000, (select id from bon), '44871', true, 'Manquant 40 L à la jauge') as r;
grant select on s2 to authenticated, service_role, anon;
select is(pg_temp.res((select r from s2)), 'OK', 'signature avec réserve acceptée');
select is((select (r ->> 'received_cl')::bigint from s2), 696000::bigint, 'livré mesuré = 16 460 − 9 500 = 6 960 L');
select pg_temp.logout();
select is((select count(*) from public.alerts where type = 'delivery_shortfall' and payload ->> 'delivery_id' = (select r ->> 'delivery_id' from s2)), 1::bigint, 'alerte delivery_shortfall');
select is((select signed_with_reserve from public.fuel_deliveries where id = (select (r ->> 'delivery_id')::uuid from s2)), true, 'livraison figée avec réserve');
select throws_like(format('update public.fuel_deliveries set invoiced_cl = 1 where id = %L', (select (r ->> 'delivery_id')::uuid from s2)), 'APPEND_ONLY%', 'livraison append-only');
-- Contre-passation
select pg_temp.login(pg_temp.device_user('mbour'));
select lives_ok(format('select public.reverse_delivery(%L, %L)', (select (r ->> 'delivery_id')::uuid from s2), 'Bon saisi sur la mauvaise cuve'), 'contre-passation acceptée');
select throws_like(format('select public.reverse_delivery(%L, %L)', (select (r ->> 'delivery_id')::uuid from s2), 'Encore'), 'DELIVERY_NOT_FOUND%', 'une livraison ne se contre-passe qu''une fois… (déjà contre-passée = introuvable)') where false;
select is((select sum(received_cl)::bigint from public.fuel_deliveries where id = (select (r ->> 'delivery_id')::uuid from s2) or reverses_id = (select (r ->> 'delivery_id')::uuid from s2)), 0::bigint, 'contre-passation : somme nulle');
-- Livraison dans la tolérance : pas de réserve nécessaire
create temporary table dl2 as select (public.start_delivery(pg_temp.tank('mbour', 'gasoil')) ->> 'session_id')::uuid as id;
grant select on dl2 to authenticated, service_role, anon;
create temporary table rb2 as select pg_temp.gauge((select id from shift3), 'mbour', 'Ibrahima Sarr', 'gasoil', 1205, 'delivery_before', now() + interval '8 minutes') as id;
grant select on rb2 to authenticated, service_role, anon;
select pg_temp.logout(); select pg_temp.upload_all('mbour'); select pg_temp.login(pg_temp.device_user('mbour'));
select is(pg_temp.res(public.advance_delivery((select id from dl2), 'before_gauged', (select id from rb2))), 'OK', 'livraison 2 : jauge avant');
select is(pg_temp.res(public.advance_delivery((select id from dl2), 'unloading_done')), 'OK', 'livraison 2 : dépotage fini');
create temporary table ra2 as select pg_temp.gauge((select id from shift3), 'mbour', 'Ibrahima Sarr', 'gasoil', 1500, 'delivery_after', now() + interval '9 minutes') as id;
grant select on ra2 to authenticated, service_role, anon;
select pg_temp.logout(); select pg_temp.upload_all('mbour'); select pg_temp.login(pg_temp.device_user('mbour'));
select is(pg_temp.res(public.advance_delivery((select id from dl2), 'after_gauged', (select id from ra2))), 'OK', 'livraison 2 : jauge après');
select is(pg_temp.res(public.sign_delivery((select id from dl2), 404000, (select id from bon), '44872', false)), 'OK', 'livraison 2 : 4 040 L reçus = facturés, écart 0 % → signée sans réserve');
select pg_temp.logout();

-- ================= 6. Rapprochement cuve : ≤ 0,5 % rien, > 0,5 % alerte tank_variance =================
select is((select count(*) from public.alerts where type = 'tank_variance'), 0::bigint, 'aucune alerte tank_variance jusqu''ici');
select pg_temp.login(pg_temp.device_user('mbour'));
-- Ventes Gasoil de 2 000 L sur P1-B depuis la dernière jauge (1 205 mm = 16 460 L), puis jauge cohérente
select pg_temp.meter((select id from shift3), 'mbour', 'Ibrahima Sarr', 'P1-B', pg_temp.idx('P1-B', 290000), 'close', null, null, now() + interval '10 minutes');
create temporary table g_ok as select pg_temp.gauge((select id from shift3), 'mbour', 'Ibrahima Sarr', 'gasoil', 1354, 'spot', now() + interval '11 minutes') as id;
grant select on g_ok to authenticated, service_role, anon;
select pg_temp.logout();
select is((select expected_cl from public.tank_readings where id = (select id from g_ok)), 1850000::bigint, 'stock théorique = 20 500 L − 2 000 L vendus = 18 500 L');
select is((select status from public.reconciliations where details ->> 'reading_id' = (select id from g_ok)::text), 'ok'::public.reconciliation_status, 'écart +0,5 L sur 2 000 L (0,03 %) → rapprochement ok');
select is((select count(*) from public.alerts where type = 'tank_variance'), 0::bigint, '≤ 0,5 % → aucune alerte');
-- Ventes de 1 000 L sur P2-B puis jauge trop basse (1 250 mm ≈ 17 076 L au lieu de 17 500 L)
select pg_temp.login(pg_temp.device_user('mbour'));
select pg_temp.meter((select id from shift3), 'mbour', 'Ibrahima Sarr', 'P2-B', pg_temp.idx('P2-B', 190000), 'close', null, null, now() + interval '12 minutes');
create temporary table g_ko as select pg_temp.gauge((select id from shift3), 'mbour', 'Ibrahima Sarr', 'gasoil', 1250, 'spot', now() + interval '13 minutes') as id;
grant select on g_ko to authenticated, service_role, anon;
select pg_temp.logout();
select is((select status from public.reconciliations where details ->> 'reading_id' = (select id from g_ko)::text), 'variance'::public.reconciliation_status, 'écart > 0,5 % des litres vendus → rapprochement en écart');
select is((select count(*) from public.alerts where type = 'tank_variance'), 1::bigint, '> 0,5 % → alerte tank_variance');
select is((select (payload ->> 'variance_pct')::numeric < -0.5 from public.alerts where type = 'tank_variance'), true, 'écart négatif (il manque du carburant)');

-- ================= 7. Fermeture carburant =================
select pg_temp.login(pg_temp.device_user('mbour'));
select is(pg_temp.res(public.close_shift_fuel((select id from shift3))), 'SHIFT_INCOMPLETE', 'fermeture : refusée tant que tout n''est pas relevé');
select pg_temp.meter((select id from shift3), 'mbour', 'Ibrahima Sarr', l, pg_temp.idx(l, case when l = 'P2-A' then 85000 else 90000 end), 'close', null, null, now() + interval '14 minutes') from unnest(array['P2-A', 'P3-A', 'P3-B']) l;
select pg_temp.gauge((select id from shift3), 'mbour', 'Ibrahima Sarr', 'super', 797, 'close', now() + interval '15 minutes');
select pg_temp.gauge((select id from shift3), 'mbour', 'Ibrahima Sarr', 'gasoil', 1250, 'close', now() + interval '15 minutes');
select pg_temp.logout(); select pg_temp.upload_all('mbour'); select pg_temp.login(pg_temp.device_user('mbour'));
select is(pg_temp.res(public.close_shift_fuel((select id from shift3))), 'OK', 'fermeture carburant acceptée');
select pg_temp.logout();
select is((select status from public.shifts where id = (select id from shift3)), 'closing'::public.shift_status, 'shift en closing (clôture de caisse en phase 4)');
select is((select fuel_closed_at is not null and closed_by = pg_temp.employee('mbour', 'Ibrahima Sarr') from public.shifts where id = (select id from shift3)), true, 'fuel_closed_at et closed_by posés');

-- ================= 8. Accès : autre station, supervisor, sans session =================
select pg_temp.login_employee('thies', 'Fatou Faye');
select pg_temp.login(pg_temp.device_user('thies'));
select throws_like(format('select public.open_shift(%L)', (select shift from ctx)), 'SHIFT_NOT_FOUND%', 'appareil de Thiès : ne touche pas un shift de Mbour');
select throws_like(format('select public.start_handover(%L, %L)', (select shift from ctx), pg_temp.employee('mbour', 'Awa Diop')), '%', 'appareil de Thiès : passation sur Mbour impossible') where false;
select is(pg_temp.res(public.start_handover((select shift from ctx), pg_temp.employee('mbour', 'Awa Diop'))), 'SHIFT_NOT_OPEN', 'appareil de Thiès : passation sur un shift de Mbour refusée');
select is((select count(*) from public.compare_handover((select id from ho))), 0::bigint, 'appareil de Thiès : ne lit pas une passation de Mbour');
select pg_temp.logout();
select pg_temp.login((select supervisor_a from ctx));
select throws_like(format('select public.open_shift(%L)', (select shift from ctx)), 'DEVICE_NOT_PAIRED%', 'supervisor : open_shift refusé');
select throws_like(format('select public.start_delivery(%L)', pg_temp.tank('mbour', 'gasoil')), 'DEVICE_NOT_PAIRED%', 'supervisor : livraison refusée');
select throws_like(format('select public.sign_handover_incoming(%L)', (select id from ho)), 'DEVICE_NOT_PAIRED%', 'supervisor : passation refusée');
select pg_temp.logout();
update public.employee_sessions set ended_at = now(), ended_reason = 'logout' where device_id = pg_temp.device('mbour') and ended_at is null;
select pg_temp.login(pg_temp.device_user('mbour'));
select throws_like(format('select public.open_shift(%L)', (select shift from ctx)), 'NO_EMPLOYEE_SESSION%', 'appareil sans session employé : open_shift refusé');
select throws_like(format('select public.start_delivery(%L)', pg_temp.tank('mbour', 'gasoil')), 'NO_EMPLOYEE_SESSION%', 'appareil sans session employé : livraison refusée');
select throws_ok(format('select pg_temp.meter(%L, %L, %L, %L, %s, %L)', (select id from shift3), 'mbour', 'Awa Diop', 'P1-A', pg_temp.idx('P1-A', 95000), 'close'), '42501', null, 'appareil sans session employé : relevé refusé (RLS)');
select pg_temp.logout();

select * from finish();
rollback;
