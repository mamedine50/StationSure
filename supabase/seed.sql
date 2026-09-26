-- =============================================================================
-- DONNÉES DE DÉMO — LOCAL UNIQUEMENT. Ne JAMAIS pousser ce fichier en ligne.
-- Reprend les données de docs/maquette. Les identifiants sont déterministes
-- (md5 d'un libellé) pour que les tests pgTAP puissent les retrouver.
-- =============================================================================

-- Identifiants fixes
-- organisation : md5('org:demo')::uuid
-- owner auth   : md5('user:owner@demo.local')::uuid
-- station      : md5('station:<slug>')::uuid           (mbour, thies, kaolack)
-- appareil     : md5('device:<slug>')::uuid, auth user md5('user:device-<slug>@demo.local')::uuid
-- employé      : md5('employee:<slug>:<Nom complet>')::uuid
-- cuve         : md5('tank:<slug>:<super|gasoil>')::uuid
-- pompe        : md5('pump:<slug>:P<n>')::uuid ; pistolet md5('nozzle:<slug>:P<n>-<A|B>')::uuid

-- -----------------------------------------------------------------------------
-- Comptes auth de démo (mots de passe de DEV, affichés dans le README)
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('owner@demo.local', 'Demo-StationSure-2026!'),
      ('device-mbour@demo.local', 'Demo-Appareil-2026!'),
      ('device-thies@demo.local', 'Demo-Appareil-2026!'),
      ('device-kaolack@demo.local', 'Demo-Appareil-2026!')
    ) as u(email, password)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change, is_sso_user
    ) values (
      '00000000-0000-0000-0000-000000000000', md5('user:' || r.email)::uuid, 'authenticated', 'authenticated', r.email,
      extensions.crypt(r.password, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
      '', '', '', '', false
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), md5('user:' || r.email)::uuid, md5('user:' || r.email)::uuid::text,
      jsonb_build_object('sub', md5('user:' || r.email)::uuid::text, 'email', r.email, 'email_verified', true, 'phone_verified', false),
      'email', now(), now(), now()
    );
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- Organisation de démo (plan groupe) + owner
-- -----------------------------------------------------------------------------
insert into public.organizations (id, name, plan_code)
values (md5('org:demo')::uuid, 'Démo StationSûre', 'groupe');

insert into public.org_members (organization_id, user_id, role)
values (md5('org:demo')::uuid, md5('user:owner@demo.local')::uuid, 'owner');

-- -----------------------------------------------------------------------------
-- Stations, appareils, employés, cuves, barémage, pompes, pistolets, prix
-- -----------------------------------------------------------------------------
do $$
declare
  v_org uuid := md5('org:demo')::uuid;
  v_owner uuid := md5('user:owner@demo.local')::uuid;
  r record;
  v_station uuid;
  v_tank_super uuid;
  v_tank_gasoil uuid;
  v_pump uuid;
  n integer;
begin
  for r in
    select * from (values
      ('mbour', 'Mbour', 'Mbour'),
      ('thies', 'Thiès', 'Thiès'),
      ('kaolack', 'Kaolack', 'Kaolack')
    ) as s(slug, name, city)
  loop
    v_station := md5('station:' || r.slug)::uuid;

    insert into public.stations (id, organization_id, name, city)
    values (v_station, v_org, r.name, r.city);

    insert into public.devices (id, organization_id, station_id, auth_user_id, label)
    values (md5('device:' || r.slug)::uuid, v_org, v_station,
            md5('user:device-' || r.slug || '@demo.local')::uuid, 'Tablette caisse 01');

    -- Cuves + barémage d'exemple (mm → cL). Table volontairement simple, 4 points.
    v_tank_super := md5('tank:' || r.slug || ':super')::uuid;
    v_tank_gasoil := md5('tank:' || r.slug || ':gasoil')::uuid;
    insert into public.tanks (id, organization_id, station_id, fuel_product_code, label, capacity_cl) values
      (v_tank_super, v_org, v_station, 'super', 'Cuve Super', 2000000),
      (v_tank_gasoil, v_org, v_station, 'gasoil', 'Cuve Gasoil', 3000000);

    -- Barémage version 1 (maquette 13 pour le Gasoil ; 4 points pour le Super = tests de core).
    insert into public.tank_calibration_versions (id, organization_id, station_id, tank_id, version, effective_from, note) values
      (md5('calib:' || r.slug || ':super:1')::uuid, v_org, v_station, v_tank_super, 1, '2026-01-01', 'Version initiale de démo'),
      (md5('calib:' || r.slug || ':gasoil:1')::uuid, v_org, v_station, v_tank_gasoil, 1, '2026-01-01', 'Version initiale de démo');
    insert into public.tank_calibrations (organization_id, station_id, tank_id, version_id, height_mm, volume_cl) values
      (v_org, v_station, v_tank_super, md5('calib:' || r.slug || ':super:1')::uuid, 0, 0),
      (v_org, v_station, v_tank_super, md5('calib:' || r.slug || ':super:1')::uuid, 500, 500000),
      (v_org, v_station, v_tank_super, md5('calib:' || r.slug || ':super:1')::uuid, 1000, 1400000),
      (v_org, v_station, v_tank_super, md5('calib:' || r.slug || ':super:1')::uuid, 1500, 2000000),
      (v_org, v_station, v_tank_gasoil, md5('calib:' || r.slug || ':gasoil:1')::uuid, 0, 0),
      (v_org, v_station, v_tank_gasoil, md5('calib:' || r.slug || ':gasoil:1')::uuid, 300, 240000),
      (v_org, v_station, v_tank_gasoil, md5('calib:' || r.slug || ':gasoil:1')::uuid, 600, 680000),
      (v_org, v_station, v_tank_gasoil, md5('calib:' || r.slug || ':gasoil:1')::uuid, 750, 950000),
      (v_org, v_station, v_tank_gasoil, md5('calib:' || r.slug || ':gasoil:1')::uuid, 900, 1220000),
      (v_org, v_station, v_tank_gasoil, md5('calib:' || r.slug || ':gasoil:1')::uuid, 1205, 1646000),
      (v_org, v_station, v_tank_gasoil, md5('calib:' || r.slug || ':gasoil:1')::uuid, 1500, 2050000),
      (v_org, v_station, v_tank_gasoil, md5('calib:' || r.slug || ':gasoil:1')::uuid, 1800, 2430000),
      (v_org, v_station, v_tank_gasoil, md5('calib:' || r.slug || ':gasoil:1')::uuid, 2100, 2760000),
      (v_org, v_station, v_tank_gasoil, md5('calib:' || r.slug || ':gasoil:1')::uuid, 2400, 3000000);

    -- 3 pompes, 6 pistolets : P<n>-A = Super, P<n>-B = Gasoil
    for n in 1..3 loop
      v_pump := md5('pump:' || r.slug || ':P' || n)::uuid;
      insert into public.pumps (id, organization_id, station_id, label)
      values (v_pump, v_org, v_station, 'P' || n);
      insert into public.nozzles (id, organization_id, station_id, pump_id, tank_id, label) values
        (md5('nozzle:' || r.slug || ':P' || n || '-A')::uuid, v_org, v_station, v_pump, v_tank_super, 'P' || n || '-A'),
        (md5('nozzle:' || r.slug || ':P' || n || '-B')::uuid, v_org, v_station, v_pump, v_tank_gasoil, 'P' || n || '-B');
    end loop;

    -- PRIX FICTIFS DE DÉMO : ce ne sont PAS les prix officiels en vigueur au Sénégal.
    insert into public.price_changes (organization_id, station_id, fuel_product_code, price_fcfa_per_litre, effective_at, created_by) values
      (v_org, v_station, 'super', 990, now() - interval '30 days', v_owner),
      (v_org, v_station, 'gasoil', 755, now() - interval '30 days', v_owner);
  end loop;

  -- Employés (maquette) avec un PIN de démo NON trivial par personne (voir README, local uniquement).
  for r in
    select * from (values
      ('mbour', 'Awa Diop', 'pump_attendant', '4062'),
      ('mbour', 'Moussa Ndiaye', 'pump_attendant', '7391'),
      ('mbour', 'Ibrahima Sarr', 'manager', '8175'),
      ('mbour', 'Khady Fall', 'shop_cashier', '3946'),
      ('mbour', 'Lamine Gueye', 'mechanic', '6203'),
      ('mbour', 'Pape Seck', 'washer', '5817'),
      ('thies', 'Fatou Faye', 'manager', '9034'),
      ('kaolack', 'Cheikh Mbaye', 'manager', '1748'),
      ('kaolack', 'P. Sow', 'washer', '2794')
    ) as e(slug, full_name, role, pin)
  loop
    insert into public.employees (id, organization_id, station_id, full_name, role)
    values (md5('employee:' || r.slug || ':' || r.full_name)::uuid, v_org, md5('station:' || r.slug)::uuid,
            r.full_name, r.role::public.employee_role);
    insert into public.employee_pins (employee_id, organization_id, pin_hash)
    values (md5('employee:' || r.slug || ':' || r.full_name)::uuid, v_org,
            extensions.crypt(r.pin, extensions.gen_salt('bf')));
  end loop;
end
$$;


-- -----------------------------------------------------------------------------
-- Historique carburant de Mbour (hier) : un shift clos avec relevés d'ouverture et
-- de clôture (index de la maquette 03), jaugeages, et une livraison Gasoil
-- signée avec réserve (maquette 12 : 750 mm → 1 205 mm, facturé 7 000 L, −0,57 %).
-- Les preuves sont marquées reçues sans fichier réel dans le bucket (démo).
-- -----------------------------------------------------------------------------
do $$
declare
  v_org uuid := md5('org:demo')::uuid;
  v_station uuid := md5('station:mbour')::uuid;
  v_device uuid := md5('device:mbour')::uuid;
  v_manager uuid := md5('employee:mbour:Ibrahima Sarr')::uuid;
  v_shift uuid := md5('shift:mbour:hier')::uuid;
  v_jour date := current_date - 1;
  r record;
  v_ev uuid;
  v_before uuid;
  v_after uuid;
  v_delivery uuid := md5('delivery:mbour:hier')::uuid;
begin
  perform set_config('app.shift_rpc', 'on', true);
  insert into public.shifts (id, organization_id, station_id, device_id, opened_by, closed_by, opened_at, closed_at, status, fuel_closed_at, device_created_at, label)
  values (v_shift, v_org, v_station, v_device, v_manager, v_manager, v_jour + time '06:00', v_jour + time '22:30', 'closed', v_jour + time '22:10', v_jour + time '06:00', 'Journée (démo)');

  -- Relevés d'index : (pistolet, index ouverture cL, index clôture cL)
  for r in
    select * from (values
      ('P1-A', 19770210, 19840210), ('P1-B', 35481870, 35611870), ('P2-A', 14230000, 14295000),
      ('P2-B', 48263255, 48391255), ('P3-A', 21509040, 21588040), ('P3-B', 29993785, 30122785)
    ) as m(label, idx_open, idx_close)
  loop
    v_ev := md5('evidence:mbour:open:' || r.label)::uuid;
    insert into public.evidence_files (id, organization_id, station_id, device_id, employee_id, kind, storage_path, sha256, captured_at_device, device_created_at)
    values (v_ev, v_org, v_station, v_device, v_manager, 'meter_photo', v_org::text || '/' || v_station::text || '/' || v_ev::text || '.jpg', md5(v_ev::text) || md5(v_ev::text), v_jour + time '06:02', v_jour + time '06:02');
    insert into public.evidence_uploads (evidence_id, organization_id, station_id, object_size) values (v_ev, v_org, v_station, 180000);
    insert into public.meter_readings (organization_id, station_id, device_id, employee_id, shift_id, nozzle_id, kind, index_cl, evidence_id, device_created_at)
    values (v_org, v_station, v_device, v_manager, v_shift, md5('nozzle:mbour:' || r.label)::uuid, 'open', r.idx_open, v_ev, v_jour + time '06:02');

    v_ev := md5('evidence:mbour:close:' || r.label)::uuid;
    insert into public.evidence_files (id, organization_id, station_id, device_id, employee_id, kind, storage_path, sha256, captured_at_device, device_created_at)
    values (v_ev, v_org, v_station, v_device, v_manager, 'meter_photo', v_org::text || '/' || v_station::text || '/' || v_ev::text || '.jpg', md5(v_ev::text) || md5(v_ev::text), v_jour + time '22:02', v_jour + time '22:02');
    insert into public.evidence_uploads (evidence_id, organization_id, station_id, object_size) values (v_ev, v_org, v_station, 180000);
    insert into public.meter_readings (organization_id, station_id, device_id, employee_id, shift_id, nozzle_id, kind, index_cl, evidence_id, device_created_at)
    values (v_org, v_station, v_device, v_manager, v_shift, md5('nozzle:mbour:' || r.label)::uuid, 'close', r.idx_close, v_ev, v_jour + time '22:02');
  end loop;

  -- Jaugeages : (cuve, hauteur mm, type, heure)
  for r in
    select * from (values
      ('super', 1000, 'open', time '06:05'), ('gasoil', 750, 'open', time '06:06'),
      ('gasoil', 750, 'delivery_before', time '06:15'), ('gasoil', 1205, 'delivery_after', time '06:50'),
      ('super', 881, 'close', time '22:05'), ('gasoil', 928, 'close', time '22:06')
    ) as g(fuel, height, kind, heure)
  loop
    v_ev := md5('evidence:mbour:gauge:' || r.fuel || ':' || r.kind)::uuid;
    insert into public.evidence_files (id, organization_id, station_id, device_id, employee_id, kind, storage_path, sha256, captured_at_device, device_created_at)
    values (v_ev, v_org, v_station, v_device, v_manager, 'tank_gauge', v_org::text || '/' || v_station::text || '/' || v_ev::text || '.jpg', md5(v_ev::text) || md5(v_ev::text), v_jour + r.heure, v_jour + r.heure);
    insert into public.evidence_uploads (evidence_id, organization_id, station_id, object_size) values (v_ev, v_org, v_station, 180000);
    insert into public.tank_readings (id, organization_id, station_id, device_id, employee_id, tank_id, height_mm, volume_cl, evidence_id, device_created_at, shift_id, kind)
    values (md5('reading:mbour:' || r.fuel || ':' || r.kind)::uuid, v_org, v_station, v_device, v_manager, md5('tank:mbour:' || r.fuel)::uuid, r.height, 0, v_ev, v_jour + r.heure, v_shift, r.kind::public.tank_reading_kind);
  end loop;

  -- Livraison Gasoil signée avec réserve (bon n° 44871, 7 000 L facturés, 6 960 L reçus)
  v_before := md5('reading:mbour:gasoil:delivery_before')::uuid;
  v_after := md5('reading:mbour:gasoil:delivery_after')::uuid;
  v_ev := md5('evidence:mbour:delivery_note')::uuid;
  insert into public.evidence_files (id, organization_id, station_id, device_id, employee_id, kind, storage_path, sha256, captured_at_device, device_created_at)
  values (v_ev, v_org, v_station, v_device, v_manager, 'delivery_note', v_org::text || '/' || v_station::text || '/' || v_ev::text || '.jpg', md5(v_ev::text) || md5(v_ev::text), v_jour + time '06:55', v_jour + time '06:55');
  insert into public.evidence_uploads (evidence_id, organization_id, station_id, object_size) values (v_ev, v_org, v_station, 180000);
  insert into public.fuel_deliveries (id, organization_id, station_id, device_id, employee_id, tank_id, supplier, invoice_ref, invoiced_cl, before_cl, after_cl, evidence_id,
    device_created_at, before_reading_id, after_reading_id, variance_pct, signed_with_reserve, reserve_reason, unloading_started_at, unloading_ended_at)
  values (v_delivery, v_org, v_station, v_device, v_manager, md5('tank:mbour:gasoil')::uuid, 'Dépôt Diamniadio (démo)', '44871', 700000, 950000, 1646000, v_ev,
    v_jour + time '06:55', v_before, v_after, -0.57, true, 'Manquant 40 L constaté à la jauge', v_jour + time '06:16', v_jour + time '06:48');
  insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload, created_at)
  values (v_org, v_station, v_shift, 'delivery_shortfall', 'critical',
          jsonb_build_object('delivery_id', v_delivery, 'received_cl', 696000, 'invoiced_cl', 700000, 'variance_pct', -0.57), v_jour + time '06:55');
  perform set_config('app.shift_rpc', 'off', true);
end
$$;

-- -----------------------------------------------------------------------------
-- Caisse (phase 4) — Mbour, avant-hier soir : shift clos avec paiements mixtes et
-- l'écart −35 000 de la maquette 04 (attendu 2 385 000 = carburant 2 190 000 +
-- boutique 145 000 + lavage 50 000 ; espèces 1 120 000 + Wave 640 000 + OM 410 000
-- + carte 150 000 + crédit 30 000). Transports Ndiaye (plafond 500 000, 320 000 dû),
-- demande de compte « Garage Diallo », annulation en attente, bordereau manquant à Thiès.
-- -----------------------------------------------------------------------------
do $$
declare
  v_org uuid := md5('org:demo')::uuid;
  v_station uuid := md5('station:mbour')::uuid;
  v_device uuid := md5('device:mbour')::uuid;
  v_manager uuid := md5('employee:mbour:Ibrahima Sarr')::uuid;
  v_khady uuid := md5('employee:mbour:Khady Fall')::uuid;
  v_shift uuid := md5('shift:mbour:avant-hier-soir')::uuid;
  v_jour date := current_date - 2;
  v_account uuid := md5('credit:mbour:Transports Ndiaye')::uuid;
  v_count uuid := md5('cash_count:mbour:avant-hier-soir')::uuid;
  v_closing uuid := md5('cash_closing:mbour:avant-hier-soir')::uuid;
  r record;
  v_ev uuid;
  v_tx uuid;
  v_pay uuid;
begin
  perform set_config('app.shift_rpc', 'on', true);
  insert into public.shifts (id, organization_id, station_id, device_id, opened_by, closed_by, opened_at, closed_at, status, fuel_closed_at, device_created_at, label)
  values (v_shift, v_org, v_station, v_device, v_manager, v_manager, v_jour + time '14:00', v_jour + time '22:30', 'closed', v_jour + time '22:10', v_jour + time '14:00', 'Shift soir (démo)');

  -- Relevés : Super vendu uniquement sur P1-A (1 067,77 L × 990 = 1 057 092), Gasoil sur P1-B (1 500,54 L × 755 = 1 132 908) → 2 190 000.
  for r in
    select * from (values
      ('P1-A', 19663433, 19770210), ('P1-B', 35331816, 35481870), ('P2-A', 14230000, 14230000),
      ('P2-B', 48263255, 48263255), ('P3-A', 21509040, 21509040), ('P3-B', 29993785, 29993785)
    ) as m(label, idx_open, idx_close)
  loop
    v_ev := md5('evidence:mbour:soir:open:' || r.label)::uuid;
    insert into public.evidence_files (id, organization_id, station_id, device_id, employee_id, kind, storage_path, sha256, captured_at_device, device_created_at)
    values (v_ev, v_org, v_station, v_device, v_manager, 'meter_photo', v_org::text || '/' || v_station::text || '/' || v_ev::text || '.jpg', md5(v_ev::text) || md5(v_ev::text), v_jour + time '14:02', v_jour + time '14:02');
    insert into public.evidence_uploads (evidence_id, organization_id, station_id, object_size) values (v_ev, v_org, v_station, 180000);
    insert into public.meter_readings (organization_id, station_id, device_id, employee_id, shift_id, nozzle_id, kind, index_cl, evidence_id, device_created_at)
    values (v_org, v_station, v_device, v_manager, v_shift, md5('nozzle:mbour:' || r.label)::uuid, 'open', r.idx_open, v_ev, v_jour + time '14:02');
    v_ev := md5('evidence:mbour:soir:close:' || r.label)::uuid;
    insert into public.evidence_files (id, organization_id, station_id, device_id, employee_id, kind, storage_path, sha256, captured_at_device, device_created_at)
    values (v_ev, v_org, v_station, v_device, v_manager, 'meter_photo', v_org::text || '/' || v_station::text || '/' || v_ev::text || '.jpg', md5(v_ev::text) || md5(v_ev::text), v_jour + time '22:02', v_jour + time '22:02');
    insert into public.evidence_uploads (evidence_id, organization_id, station_id, object_size) values (v_ev, v_org, v_station, 180000);
    insert into public.meter_readings (organization_id, station_id, device_id, employee_id, shift_id, nozzle_id, kind, index_cl, evidence_id, device_created_at)
    values (v_org, v_station, v_device, v_manager, v_shift, md5('nozzle:mbour:' || r.label)::uuid, 'close', r.idx_close, v_ev, v_jour + time '22:02');
  end loop;

  -- Compte crédit Transports Ndiaye : plafond 500 000, 290 000 déjà dus avant ce shift.
  insert into public.credit_accounts (id, organization_id, station_id, customer_name, phone, limit_fcfa, active, status)
  values (v_account, v_org, v_station, 'Transports Ndiaye', '77 000 00 00', 500000, true, 'active');
  v_ev := md5('evidence:mbour:credit:ancien')::uuid;
  insert into public.evidence_files (id, organization_id, station_id, device_id, employee_id, kind, storage_path, sha256, captured_at_device, device_created_at)
  values (v_ev, v_org, v_station, v_device, v_manager, 'credit_note', v_org::text || '/' || v_station::text || '/' || v_ev::text || '.jpg', md5(v_ev::text) || md5(v_ev::text), v_jour - 3 + time '10:00', v_jour - 3 + time '10:00');
  insert into public.evidence_uploads (evidence_id, organization_id, station_id, object_size) values (v_ev, v_org, v_station, 150000);
  insert into public.credit_entries (organization_id, station_id, device_id, employee_id, credit_account_id, kind, amount_fcfa, vehicle_plate, evidence_id, device_created_at)
  values (v_org, v_station, v_device, v_manager, v_account, 'sale', 290000, 'DK-4821-BC', v_ev, v_jour - 3 + time '10:00');

  -- Transactions et paiements du shift : (type, montant, mode, référence / TPE, description, plaque)
  for r in
    select * from (values
      ('fuel', 640000, 'wave', 'WV-88240', 'Gasoil flotte', null),
      ('fuel', 410000, 'orange_money', 'OM-551903', 'Gasoil flotte', null),
      ('fuel', 150000, 'card', '4821', 'Super', null),
      ('fuel', 18000, 'credit', null, 'Gasoil · Transports Ndiaye', 'DK-4821-BC'),
      ('fuel', 12000, 'credit', null, 'Gasoil · Transports Ndiaye', 'DK-4821-BC'),
      ('fuel', 960000, 'cash', null, 'Ventes carburant espèces', null),
      ('shop', 145000, 'cash', null, 'Ticket boutique 1043', null),
      ('wash', 50000, 'cash', null, 'Lavages', null)
    ) as t(kind, amount, method, ref, description, plate)
  loop
    v_tx := gen_random_uuid();
    insert into public.transactions (id, organization_id, station_id, device_id, employee_id, shift_id, kind, total_fcfa, note, device_created_at)
    values (v_tx, v_org, v_station, v_device, case when r.kind = 'shop' then v_khady else v_manager end, v_shift, r.kind::public.transaction_kind, r.amount, r.description, v_jour + time '16:00');
    insert into public.transaction_items (organization_id, station_id, transaction_id, nozzle_id, description, quantity, unit_price_fcfa, amount_fcfa)
    values (v_org, v_station, v_tx, case when r.kind = 'fuel' then md5('nozzle:mbour:P1-B')::uuid end, r.description, 1, r.amount, r.amount);
    v_pay := gen_random_uuid();
    insert into public.payments (id, organization_id, station_id, device_id, employee_id, transaction_id, method, amount_fcfa, external_ref, card_last4, credit_account_id, device_created_at)
    values (v_pay, v_org, v_station, v_device, v_manager, v_tx, r.method::public.payment_method, r.amount,
            case when r.method in ('wave', 'orange_money') then r.ref end, case when r.method = 'card' then r.ref end,
            case when r.method = 'credit' then v_account end, v_jour + time '16:00');
    if r.method = 'credit' then
      v_ev := gen_random_uuid();
      insert into public.evidence_files (id, organization_id, station_id, device_id, employee_id, kind, storage_path, sha256, captured_at_device, device_created_at)
      values (v_ev, v_org, v_station, v_device, v_manager, 'credit_note', v_org::text || '/' || v_station::text || '/' || v_ev::text || '.jpg', md5(v_ev::text) || md5(v_ev::text), v_jour + time '16:00', v_jour + time '16:00');
      insert into public.evidence_uploads (evidence_id, organization_id, station_id, object_size) values (v_ev, v_org, v_station, 150000);
      insert into public.credit_entries (organization_id, station_id, device_id, employee_id, credit_account_id, kind, amount_fcfa, transaction_id, payment_id, vehicle_plate, evidence_id, device_created_at)
      values (v_org, v_station, v_device, v_manager, v_account, 'sale', r.amount, v_tx, v_pay, r.plate, v_ev, v_jour + time '16:00');
    end if;
    if r.kind = 'shop' then
      -- Annulation demandée par Khady Fall (en attente de l'owner) : article scanné deux fois.
      insert into public.voids (organization_id, station_id, device_id, employee_id, transaction_id, reason, amount_fcfa, shift_id, device_created_at)
      values (v_org, v_station, v_device, v_khady, v_tx, 'Erreur de saisie (article scanné deux fois)', 25000, v_shift, v_jour + time '15:08');
      insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload, created_at)
      values (v_org, v_station, v_shift, 'void_requested', 'warning', jsonb_build_object('transaction_id', v_tx, 'amount_fcfa', 25000, 'employee_id', v_khady, 'reason', 'Erreur de saisie'), v_jour + time '15:08');
    end if;
  end loop;

  -- Billetage (maquette 14) : 1 120 000 FCFA, puis clôture avec écart −35 000 (maquette 04).
  insert into public.cash_counts (id, organization_id, station_id, device_id, employee_id, shift_id, denominations, device_created_at, created_at)
  values (v_count, v_org, v_station, v_device, v_manager, v_shift,
          '{"10000": 78, "5000": 42, "2000": 45, "1000": 25, "500": 16, "200": 20, "100": 25, "50": 10}'::jsonb, v_jour + time '22:12', v_jour + time '22:12');
  insert into public.cash_closings (id, organization_id, station_id, device_id, employee_id, shift_id, cash_count_id,
    expected_fuel_fcfa, expected_shop_fcfa, expected_wash_fcfa, expected_garage_fcfa, credit_repayments_fcfa, approved_voids_fcfa, expected_total_fcfa,
    wave_fcfa, orange_money_fcfa, card_fcfa, credit_fcfa, expected_cash_fcfa, counted_cash_fcfa, variance_fcfa, justification, deposit_mode, closed_at, created_at)
  values (v_closing, v_org, v_station, v_device, v_manager, v_shift, v_count,
    2190000, 145000, 50000, 0, 0, 0, 2385000, 640000, 410000, 150000, 30000, 1155000, 1120000, -35000,
    'Erreur de rendu de monnaie sur un gros billet.', 'later', v_jour + time '22:30', v_jour + time '22:30');
  insert into public.reconciliations (organization_id, station_id, shift_id, kind, expected, actual, status, details, created_at)
  values (v_org, v_station, v_shift, 'cash', 1155000, 1120000, 'variance', jsonb_build_object('closing_id', v_closing), v_jour + time '22:30');
  insert into public.alerts (organization_id, station_id, shift_id, type, severity, payload, created_at)
  values (v_org, v_station, v_shift, 'cash_variance', 'critical',
          jsonb_build_object('closing_id', v_closing, 'variance_fcfa', -35000, 'employee_id', v_manager, 'employee_name', 'Ibrahima Sarr', 'justification', 'Erreur de rendu de monnaie sur un gros billet.'), v_jour + time '22:30');

  -- Demande de compte « Garage Diallo » par le gérant (plafond 0, en attente).
  insert into public.credit_accounts (id, organization_id, station_id, customer_name, phone, limit_fcfa, active, status, requested_by_employee_id, requested_at)
  values (md5('credit:mbour:Garage Diallo')::uuid, v_org, v_station, 'Garage Diallo', '77 000 00 00', 0, false, 'pending', v_manager, current_date + time '10:12');
  insert into public.alerts (organization_id, station_id, type, severity, payload)
  values (v_org, v_station, 'credit_account_requested', 'info', jsonb_build_object('credit_account_id', md5('credit:mbour:Garage Diallo')::uuid, 'customer_name', 'Garage Diallo', 'employee_id', v_manager));

  -- Thiès : shift clos il y a 36 h (Fatou Faye), 940 000 comptés, aucun bordereau → deposit_missing.
  insert into public.shifts (id, organization_id, station_id, device_id, opened_by, closed_by, opened_at, closed_at, status, fuel_closed_at, device_created_at, label)
  values (md5('shift:thies:avant-hier-soir')::uuid, v_org, md5('station:thies')::uuid, md5('device:thies')::uuid, md5('employee:thies:Fatou Faye')::uuid, md5('employee:thies:Fatou Faye')::uuid,
          now() - interval '44 hours', now() - interval '36 hours', 'closed', now() - interval '36 hours 20 minutes', now() - interval '44 hours', 'Shift soir (démo)');
  insert into public.cash_counts (id, organization_id, station_id, device_id, employee_id, shift_id, denominations, device_created_at, created_at)
  values (md5('cash_count:thies:avant-hier-soir')::uuid, v_org, md5('station:thies')::uuid, md5('device:thies')::uuid, md5('employee:thies:Fatou Faye')::uuid, md5('shift:thies:avant-hier-soir')::uuid,
          '{"10000": 94}'::jsonb, now() - interval '36 hours 10 minutes', now() - interval '36 hours 10 minutes');
  insert into public.cash_closings (id, organization_id, station_id, device_id, employee_id, shift_id, cash_count_id,
    expected_fuel_fcfa, expected_total_fcfa, expected_cash_fcfa, counted_cash_fcfa, variance_fcfa, deposit_mode, closed_at, created_at)
  values (md5('cash_closing:thies:avant-hier-soir')::uuid, v_org, md5('station:thies')::uuid, md5('device:thies')::uuid, md5('employee:thies:Fatou Faye')::uuid, md5('shift:thies:avant-hier-soir')::uuid, md5('cash_count:thies:avant-hier-soir')::uuid,
    940000, 940000, 940000, 940000, 0, 'later', now() - interval '36 hours', now() - interval '36 hours');
  perform set_config('app.shift_rpc', 'off', true);
  perform public.flag_missing_deposits();
end
$$;
