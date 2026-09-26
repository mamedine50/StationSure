-- =============================================================================
-- 0006 — Caisse : transactions, lignes, paiements, annulations, crédit clients,
-- versements bancaires. Toutes les tables de mouvement sont append-only.
-- =============================================================================

create type public.transaction_kind as enum ('fuel', 'shop', 'garage', 'wash', 'adjustment');
create type public.payment_method as enum ('cash', 'card', 'wave', 'orange_money', 'credit');
create type public.credit_entry_kind as enum ('sale', 'repayment', 'adjustment');

-- -----------------------------------------------------------------------------
-- transactions : moteur unique pour toutes les activités.
-- -----------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  device_id uuid not null,
  employee_id uuid not null,
  shift_id uuid not null,
  kind public.transaction_kind not null,
  total_fcfa bigint not null,
  reverses_id uuid references public.transactions (id) on delete restrict,
  note text,
  device_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (station_id, organization_id) references public.stations (id, organization_id) on delete restrict,
  foreign key (device_id, station_id) references public.devices (id, station_id) on delete restrict,
  foreign key (employee_id, station_id) references public.employees (id, station_id) on delete restrict,
  foreign key (shift_id, station_id) references public.shifts (id, station_id) on delete restrict,
  unique (id, station_id),
  check (reverses_id is null or reverses_id <> id),
  -- Une vente est positive ; une contre-écriture (reverses_id) est négative ou nulle.
  check ((reverses_id is null and total_fcfa >= 0) or (reverses_id is not null and total_fcfa <= 0))
);
comment on table public.transactions is 'Toute vente (carburant, boutique, garage, lavage) ou ajustement. Append-only : une correction est une nouvelle ligne avec reverses_id.';
comment on column public.transactions.reverses_id is 'Transaction annulée par cette contre-écriture (montant négatif). Une transaction ne peut être contrée qu''une fois.';
create unique index transactions_reverses_once_idx on public.transactions (reverses_id) where reverses_id is not null;
create index transactions_shift_idx on public.transactions (shift_id, device_created_at);
create index transactions_station_idx on public.transactions (station_id, device_created_at desc);

-- La contre-écriture doit viser une transaction de la même station.
create or replace function private.check_reversal_same_station()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_station uuid;
begin
  if new.reverses_id is null then
    return new;
  end if;
  select t.station_id into v_station from public.transactions t where t.id = new.reverses_id;
  if v_station is null or v_station <> new.station_id then
    raise exception 'REVERSAL_STATION_MISMATCH: la contre-écriture doit viser une transaction de la même station'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger check_reversal_same_station before insert on public.transactions
  for each row execute function private.check_reversal_same_station();

-- -----------------------------------------------------------------------------
-- transaction_items
-- -----------------------------------------------------------------------------
create table public.transaction_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  transaction_id uuid not null,
  product_id uuid,
  nozzle_id uuid,
  description text not null check (length(trim(description)) between 1 and 200),
  quantity bigint not null check (quantity <> 0),
  unit_price_fcfa bigint not null check (unit_price_fcfa >= 0),
  amount_fcfa bigint not null,
  created_at timestamptz not null default now(),
  foreign key (station_id, organization_id) references public.stations (id, organization_id) on delete restrict,
  foreign key (transaction_id, station_id) references public.transactions (id, station_id) on delete restrict,
  foreign key (nozzle_id, station_id) references public.nozzles (id, station_id) on delete restrict
);
comment on table public.transaction_items is 'Lignes d''une transaction. quantity en unités ou en cL selon le produit (carburant : cL via nozzle_id). Append-only.';
comment on column public.transaction_items.product_id is 'Produit de stock (boutique, pièce, lubrifiant…). FK ajoutée en 0007.';
create index transaction_items_transaction_idx on public.transaction_items (transaction_id);

-- -----------------------------------------------------------------------------
-- credit_accounts : ardoise client, plafond fixé par le propriétaire.
-- -----------------------------------------------------------------------------
create table public.credit_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  customer_name text not null check (length(trim(customer_name)) between 2 and 120),
  phone text,
  limit_fcfa bigint not null default 0 check (limit_fcfa >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (station_id, organization_id) references public.stations (id, organization_id) on delete restrict,
  unique (id, station_id)
);
comment on table public.credit_accounts is 'Comptes clients à crédit (ardoise). Le plafond est fixé par le propriétaire.';
create index credit_accounts_station_idx on public.credit_accounts (station_id);

-- -----------------------------------------------------------------------------
-- payments
-- -----------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  device_id uuid not null,
  employee_id uuid not null,
  transaction_id uuid not null,
  method public.payment_method not null,
  amount_fcfa bigint not null check (amount_fcfa <> 0),
  external_ref text,
  credit_account_id uuid,
  device_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (station_id, organization_id) references public.stations (id, organization_id) on delete restrict,
  foreign key (device_id, station_id) references public.devices (id, station_id) on delete restrict,
  foreign key (employee_id, station_id) references public.employees (id, station_id) on delete restrict,
  foreign key (transaction_id, station_id) references public.transactions (id, station_id) on delete restrict,
  foreign key (credit_account_id, station_id) references public.credit_accounts (id, station_id) on delete restrict,
  unique (id, station_id),
  check ((method = 'credit') = (credit_account_id is not null))
);
comment on table public.payments is 'Encaissements d''une transaction : espèces, carte, Wave, Orange Money, crédit. external_ref = référence opérateur pour le rapprochement. Append-only.';
create index payments_transaction_idx on public.payments (transaction_id);
create index payments_station_method_idx on public.payments (station_id, method, device_created_at desc);

-- -----------------------------------------------------------------------------
-- voids : demandes d'annulation, motif obligatoire.
-- -----------------------------------------------------------------------------
create table public.voids (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  device_id uuid,
  employee_id uuid,
  transaction_id uuid not null,
  reason text not null check (length(trim(reason)) >= 3),
  approved_by uuid references auth.users (id) on delete restrict,
  device_created_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (station_id, organization_id) references public.stations (id, organization_id) on delete restrict,
  foreign key (device_id, station_id) references public.devices (id, station_id) on delete restrict,
  foreign key (employee_id, station_id) references public.employees (id, station_id) on delete restrict,
  foreign key (transaction_id, station_id) references public.transactions (id, station_id) on delete restrict,
  -- Soit une demande depuis un appareil (device + employé), soit une annulation approuvée par un owner.
  check ((device_id is not null and employee_id is not null and device_created_at is not null) or approved_by is not null)
);
comment on table public.voids is 'Annulations : motif obligatoire, plafond par rôle et validation propriétaire (phase 4). Append-only ; l''annulation effective est une contre-écriture dans transactions.';
create index voids_transaction_idx on public.voids (transaction_id);

-- -----------------------------------------------------------------------------
-- credit_entries : mouvements d'ardoise, plafond vérifié en base.
-- -----------------------------------------------------------------------------
create table public.credit_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  device_id uuid not null,
  employee_id uuid not null,
  credit_account_id uuid not null,
  kind public.credit_entry_kind not null,
  -- Positif = la dette du client augmente (vente à crédit) ; négatif = remboursement.
  amount_fcfa bigint not null check (amount_fcfa <> 0),
  transaction_id uuid,
  payment_id uuid,
  device_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (station_id, organization_id) references public.stations (id, organization_id) on delete restrict,
  foreign key (device_id, station_id) references public.devices (id, station_id) on delete restrict,
  foreign key (employee_id, station_id) references public.employees (id, station_id) on delete restrict,
  foreign key (credit_account_id, station_id) references public.credit_accounts (id, station_id) on delete restrict,
  foreign key (transaction_id, station_id) references public.transactions (id, station_id) on delete restrict,
  foreign key (payment_id, station_id) references public.payments (id, station_id) on delete restrict,
  check ((kind = 'sale' and amount_fcfa > 0) or (kind = 'repayment' and amount_fcfa < 0) or kind = 'adjustment')
);
comment on table public.credit_entries is 'Mouvements de crédit client. Le solde ne peut pas dépasser limit_fcfa (trigger). Append-only.';
create index credit_entries_account_idx on public.credit_entries (credit_account_id, device_created_at desc);

create or replace function private.enforce_credit_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit bigint;
  v_balance bigint;
begin
  if new.amount_fcfa <= 0 then
    return new;
  end if;
  perform 1 from public.credit_accounts a where a.id = new.credit_account_id for update;
  select a.limit_fcfa into v_limit from public.credit_accounts a where a.id = new.credit_account_id and a.active;
  if v_limit is null then
    raise exception 'CREDIT_ACCOUNT_INACTIVE' using errcode = 'P0001';
  end if;
  select coalesce(sum(e.amount_fcfa), 0) into v_balance
  from public.credit_entries e where e.credit_account_id = new.credit_account_id;
  if v_balance + new.amount_fcfa > v_limit then
    raise exception 'CREDIT_LIMIT: solde % + % dépasse le plafond % FCFA', v_balance, new.amount_fcfa, v_limit
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger enforce_credit_limit before insert on public.credit_entries
  for each row execute function private.enforce_credit_limit();

-- -----------------------------------------------------------------------------
-- bank_deposits : versements déclarés avec photo du bordereau.
-- -----------------------------------------------------------------------------
create table public.bank_deposits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  device_id uuid not null,
  employee_id uuid not null,
  shift_id uuid not null,
  amount_fcfa bigint not null check (amount_fcfa > 0),
  bank_ref text,
  deposited_at timestamptz not null,
  evidence_id uuid not null,
  device_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (station_id, organization_id) references public.stations (id, organization_id) on delete restrict,
  foreign key (device_id, station_id) references public.devices (id, station_id) on delete restrict,
  foreign key (employee_id, station_id) references public.employees (id, station_id) on delete restrict,
  foreign key (shift_id, station_id) references public.shifts (id, station_id) on delete restrict,
  foreign key (evidence_id, station_id) references public.evidence_files (id, station_id) on delete restrict
);
comment on table public.bank_deposits is 'Versements bancaires déclarés, rapprochés du cash de la clôture. Bordereau obligatoire. Append-only.';
create index bank_deposits_shift_idx on public.bank_deposits (shift_id);

-- -----------------------------------------------------------------------------
-- updated_at, audit, append-only
-- -----------------------------------------------------------------------------
select private.enable_updated_at('public.credit_accounts');
select private.enable_audit('public.credit_accounts');

select private.enable_append_only('public.transactions');
select private.enable_append_only('public.transaction_items');
select private.enable_append_only('public.payments');
select private.enable_append_only('public.voids');
select private.enable_append_only('public.credit_entries');
select private.enable_append_only('public.bank_deposits');

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.transactions enable row level security;
alter table public.transaction_items enable row level security;
alter table public.credit_accounts enable row level security;
alter table public.payments enable row level security;
alter table public.voids enable row level security;
alter table public.credit_entries enable row level security;
alter table public.bank_deposits enable row level security;

select private.policy_select_org('public.transactions');
select private.policy_select_device('public.transactions');
select private.policy_insert_device('public.transactions');
revoke update, delete on public.transactions from authenticated;

-- transaction_items n'a pas de device_id : l'appareil insère les lignes d'une
-- transaction de sa station.
select private.policy_select_org('public.transaction_items');
select private.policy_select_device('public.transaction_items');
create policy transaction_items_insert_device on public.transaction_items for insert to authenticated
  with check (
    station_id = public.current_device_station_id()
    and organization_id = public.current_device_organization_id()
  );
revoke update, delete on public.transaction_items from authenticated;

select private.policy_select_org('public.credit_accounts');
select private.policy_select_device('public.credit_accounts');
select private.policy_write_owner('public.credit_accounts');

select private.policy_select_org('public.payments');
select private.policy_select_device('public.payments');
select private.policy_insert_device('public.payments');
revoke update, delete on public.payments from authenticated;

-- voids : l'appareil demande (approved_by null), l'owner peut insérer une annulation approuvée.
select private.policy_select_org('public.voids');
select private.policy_select_device('public.voids');
create policy voids_insert_device on public.voids for insert to authenticated
  with check (
    station_id = public.current_device_station_id()
    and device_id = public.current_device_id()
    and organization_id = public.current_device_organization_id()
    and approved_by is null
  );
create policy voids_insert_owner on public.voids for insert to authenticated
  with check (public.is_org_owner(organization_id) and approved_by = auth.uid());
revoke update, delete on public.voids from authenticated;

select private.policy_select_org('public.credit_entries');
select private.policy_select_device('public.credit_entries');
select private.policy_insert_device('public.credit_entries');
revoke update, delete on public.credit_entries from authenticated;

select private.policy_select_org('public.bank_deposits');
select private.policy_select_device('public.bank_deposits');
select private.policy_insert_device('public.bank_deposits');
revoke update, delete on public.bank_deposits from authenticated;
