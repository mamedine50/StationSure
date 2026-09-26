-- =============================================================================
-- 0007 — Stock générique : produits, mouvements, comptages à l'aveugle.
-- Une seule table de mouvements pour boutique, garage, Car Wash et gaz.
-- La quantité théorique n'est JAMAIS exposée à l'appareil : il n'a aucune
-- policy de lecture sur inventory_movements, et aucune table ne stocke de stock.
-- =============================================================================

create type public.product_category as enum ('shop', 'garage_part', 'lubricant', 'wash_supply', 'gas');
create type public.product_unit as enum ('unit', 'cl');
create type public.inventory_movement_kind as enum (
  'purchase', 'sale', 'work_order', 'wash', 'loss', 'adjustment', 'transfer', 'count_correction'
);
create type public.blind_count_status as enum ('requested', 'submitted', 'cancelled');

-- -----------------------------------------------------------------------------
-- products : catalogue de l'organisation (partagé entre stations).
-- -----------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  category public.product_category not null,
  unit public.product_unit not null default 'unit',
  name text not null check (length(trim(name)) between 1 and 120),
  barcode text check (barcode is null or length(trim(barcode)) between 4 and 64),
  sale_price_fcfa bigint check (sale_price_fcfa is null or sale_price_fcfa >= 0),
  reorder_threshold bigint not null default 0 check (reorder_threshold >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);
comment on table public.products is 'Catalogue produits de l''organisation. Prix de vente fixé par le propriétaire. Aucune colonne de stock : le stock se déduit des mouvements.';
create unique index products_barcode_idx on public.products (organization_id, barcode) where barcode is not null;
create index products_org_idx on public.products (organization_id, category);

alter table public.transaction_items
  add constraint transaction_items_product_fk
  foreign key (product_id, organization_id) references public.products (id, organization_id) on delete restrict;

-- -----------------------------------------------------------------------------
-- inventory_movements
-- -----------------------------------------------------------------------------
create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  device_id uuid,
  employee_id uuid,
  product_id uuid not null,
  kind public.inventory_movement_kind not null,
  -- Signée : entrée > 0, sortie < 0. Unités ou cL selon products.unit.
  quantity bigint not null check (quantity <> 0),
  unit_cost_fcfa bigint check (unit_cost_fcfa is null or unit_cost_fcfa >= 0),
  -- Objet d'origine (transaction, ordre de travail, ticket de lavage, comptage…).
  reference_kind text,
  reference_id uuid,
  device_created_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (station_id, organization_id) references public.stations (id, organization_id) on delete restrict,
  foreign key (device_id, station_id) references public.devices (id, station_id) on delete restrict,
  foreign key (employee_id, station_id) references public.employees (id, station_id) on delete restrict,
  foreign key (product_id, organization_id) references public.products (id, organization_id) on delete restrict,
  check (
    (kind = 'purchase' and quantity > 0)
    or (kind in ('sale', 'work_order', 'wash', 'loss') and quantity < 0)
    or kind in ('adjustment', 'transfer', 'count_correction')
  ),
  -- Un mouvement saisi sur un appareil porte l'appareil et l'employé ; seule une
  -- correction de comptage (calculée par le serveur) peut s'en passer.
  check (kind = 'count_correction' or (device_id is not null and employee_id is not null and device_created_at is not null))
);
comment on table public.inventory_movements is 'Tous les mouvements de stock, toutes activités confondues. Append-only. Jamais lisible par un appareil (inventaire à l''aveugle).';
create index inventory_movements_product_idx on public.inventory_movements (product_id, station_id, created_at desc);
create index inventory_movements_reference_idx on public.inventory_movements (reference_id) where reference_id is not null;

-- -----------------------------------------------------------------------------
-- blind_counts : comptage surprise demandé par le propriétaire (ou le système).
-- -----------------------------------------------------------------------------
create table public.blind_counts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  requested_by uuid references auth.users (id) on delete set null,
  requested_at timestamptz not null default now(),
  due_at timestamptz not null,
  status public.blind_count_status not null default 'requested',
  device_id uuid,
  employee_id uuid,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (station_id, organization_id) references public.stations (id, organization_id) on delete restrict,
  foreign key (device_id, station_id) references public.devices (id, station_id) on delete restrict,
  foreign key (employee_id, station_id) references public.employees (id, station_id) on delete restrict,
  unique (id, station_id),
  check (status <> 'submitted' or (submitted_at is not null and device_id is not null and employee_id is not null))
);
comment on table public.blind_counts is 'Comptage surprise : l''employé compte SANS voir le stock théorique. L''écart est calculé côté serveur et attribué au shift.';
comment on column public.blind_counts.requested_by is 'Propriétaire demandeur ; null si tirage aléatoire par le système.';
create index blind_counts_station_idx on public.blind_counts (station_id, status, due_at);

create table public.blind_count_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  station_id uuid not null,
  device_id uuid not null,
  employee_id uuid not null,
  blind_count_id uuid not null,
  product_id uuid not null,
  counted_qty bigint not null check (counted_qty >= 0),
  device_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (station_id, organization_id) references public.stations (id, organization_id) on delete restrict,
  foreign key (device_id, station_id) references public.devices (id, station_id) on delete restrict,
  foreign key (employee_id, station_id) references public.employees (id, station_id) on delete restrict,
  foreign key (blind_count_id, station_id) references public.blind_counts (id, station_id) on delete restrict,
  foreign key (product_id, organization_id) references public.products (id, organization_id) on delete restrict,
  unique (blind_count_id, product_id)
);
comment on table public.blind_count_lines is 'Quantités comptées par l''employé. Aucune quantité théorique ici, par construction. Append-only.';

-- -----------------------------------------------------------------------------
-- updated_at, audit, append-only
-- -----------------------------------------------------------------------------
select private.enable_updated_at('public.products');
select private.enable_updated_at('public.blind_counts');
select private.enable_audit('public.products');
select private.enable_append_only('public.inventory_movements');
select private.enable_append_only('public.blind_count_lines');

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.products enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.blind_counts enable row level security;
alter table public.blind_count_lines enable row level security;

-- products : lecture membres + appareil de l'organisation ; écriture owner.
select private.policy_select_org('public.products');
create policy products_select_device on public.products for select to authenticated
  using (organization_id = public.current_device_organization_id());
select private.policy_write_owner('public.products');

-- inventory_movements : lecture membres UNIQUEMENT ; insertion appareil (sans lecture).
select private.policy_select_org('public.inventory_movements');
select private.policy_insert_device('public.inventory_movements');
revoke update, delete on public.inventory_movements from authenticated;

-- blind_counts : l'owner demande et peut annuler ; l'appareil lit et soumet.
select private.policy_select_org('public.blind_counts');
select private.policy_select_device('public.blind_counts');
create policy blind_counts_insert_owner on public.blind_counts for insert to authenticated
  with check (public.is_org_owner(organization_id) and requested_by = auth.uid());
create policy blind_counts_update_owner on public.blind_counts for update to authenticated
  using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
select private.policy_update_device('public.blind_counts');
revoke delete on public.blind_counts from authenticated;

select private.policy_select_org('public.blind_count_lines');
select private.policy_select_device('public.blind_count_lines');
select private.policy_insert_device('public.blind_count_lines');
revoke update, delete on public.blind_count_lines from authenticated;
