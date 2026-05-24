-- Inventory warehouse v2 foundation.
-- Adds supplier, purchasing, unit conversion, batch, location, stock balance,
-- transfer, expiry, and alert read models without breaking inventory v1.

alter table public.ingredients
  add column if not exists sku text,
  add column if not exists barcode text,
  add column if not exists image_url text,
  add column if not exists base_unit text,
  add column if not exists track_expiration boolean not null default false,
  add column if not exists track_batches boolean not null default false,
  add column if not exists reorder_point numeric(14, 3),
  add column if not exists reorder_target numeric(14, 3),
  add column if not exists default_supplier_id uuid;

alter table public.ingredients
  drop constraint if exists ingredients_sku_format,
  add constraint ingredients_sku_format
    check (sku is null or sku ~ '^[A-Za-z0-9][A-Za-z0-9_.:/ -]{1,63}$'),
  drop constraint if exists ingredients_barcode_format,
  add constraint ingredients_barcode_format
    check (barcode is null or barcode ~ '^[A-Za-z0-9_.:/ -]{3,96}$'),
  drop constraint if exists ingredients_base_unit_format,
  add constraint ingredients_base_unit_format
    check (base_unit is null or base_unit ~ '^[a-zA-Z0-9_%/ .-]{1,24}$'),
  drop constraint if exists ingredients_reorder_quantities_non_negative,
  add constraint ingredients_reorder_quantities_non_negative
    check (
      (reorder_point is null or reorder_point >= 0)
      and (reorder_target is null or reorder_target >= 0)
      and (reorder_target is null or reorder_point is null or reorder_target >= reorder_point)
    );

update public.ingredients
set base_unit = unit
where base_unit is null;

create table if not exists public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid references public.store_branches(id) on delete set null,
  name text not null,
  location_type text not null default 'branch_storage',
  code text,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_locations_name_length check (length(trim(name)) between 1 and 120),
  constraint inventory_locations_type_check check (location_type in ('branch_storage','bar','kitchen','central_warehouse','central_kitchen','cold_storage','dry_storage','waste','in_transit')),
  constraint inventory_locations_code_format check (code is null or code ~ '^[A-Za-z0-9_.:/ -]{1,48}$'),
  constraint inventory_locations_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  address text,
  tax_code text,
  contact_name text,
  payment_terms text,
  default_lead_days integer not null default 0,
  is_preferred boolean not null default false,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suppliers_name_length check (length(trim(name)) between 1 and 160),
  constraint suppliers_phone_format check (phone is null or phone ~ '^[0-9+() .-]{6,24}$'),
  constraint suppliers_email_format check (email is null or email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'),
  constraint suppliers_lead_days_range check (default_lead_days between 0 and 120),
  constraint suppliers_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint suppliers_unique_name unique (restaurant_id, name)
);

alter table public.ingredients
  drop constraint if exists ingredients_default_supplier_id_fkey,
  add constraint ingredients_default_supplier_id_fkey
    foreign key (default_supplier_id) references public.suppliers(id) on delete set null;

create table if not exists public.ingredient_unit_conversions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  from_unit text not null,
  to_unit text not null,
  factor numeric(18, 8) not null,
  is_purchase_unit boolean not null default false,
  is_recipe_unit boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ingredient_unit_conversions_unit_format check (
    from_unit ~ '^[a-zA-Z0-9_%/ .-]{1,24}$'
    and to_unit ~ '^[a-zA-Z0-9_%/ .-]{1,24}$'
  ),
  constraint ingredient_unit_conversions_factor_positive check (factor > 0),
  constraint ingredient_unit_conversions_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint ingredient_unit_conversions_unique unique (restaurant_id, ingredient_id, from_unit, to_unit)
);

create table if not exists public.supplier_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  supplier_sku text,
  purchase_unit text not null,
  unit_cost integer not null default 0,
  min_order_quantity numeric(14, 3) not null default 0,
  lead_days integer not null default 0,
  last_ordered_at timestamptz,
  is_preferred boolean not null default false,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_items_purchase_unit_format check (purchase_unit ~ '^[a-zA-Z0-9_%/ .-]{1,24}$'),
  constraint supplier_items_unit_cost_non_negative check (unit_cost >= 0),
  constraint supplier_items_min_order_non_negative check (min_order_quantity >= 0),
  constraint supplier_items_lead_days_range check (lead_days between 0 and 120),
  constraint supplier_items_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint supplier_items_unique unique (restaurant_id, supplier_id, ingredient_id, purchase_unit)
);

create table if not exists public.supplier_price_history (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  purchase_order_id uuid,
  purchase_unit text not null,
  unit_cost integer not null,
  quantity numeric(14, 3) not null default 0,
  recorded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint supplier_price_history_unit_format check (purchase_unit ~ '^[a-zA-Z0-9_%/ .-]{1,24}$'),
  constraint supplier_price_history_unit_cost_non_negative check (unit_cost >= 0),
  constraint supplier_price_history_quantity_non_negative check (quantity >= 0),
  constraint supplier_price_history_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid references public.store_branches(id) on delete set null,
  location_id uuid references public.inventory_locations(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  po_number text not null,
  status text not null default 'draft',
  expected_delivery_at timestamptz,
  delivered_at timestamptz,
  approved_at timestamptz,
  cancelled_at timestamptz,
  subtotal integer not null default 0,
  discount_amount integer not null default 0,
  shipping_fee integer not null default 0,
  total_amount integer not null default 0,
  invoice_image_url text,
  note text,
  actor_user_id uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_orders_number_format check (po_number ~ '^[A-Za-z0-9_.:/ -]{3,64}$'),
  constraint purchase_orders_status_check check (status in ('draft','pending','approved','ordered','partially_delivered','delivered','cancelled')),
  constraint purchase_orders_amounts_non_negative check (
    subtotal >= 0 and discount_amount >= 0 and shipping_fee >= 0 and total_amount >= 0
  ),
  constraint purchase_orders_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint purchase_orders_unique_number unique (restaurant_id, po_number)
);

alter table public.supplier_price_history
  drop constraint if exists supplier_price_history_purchase_order_id_fkey,
  add constraint supplier_price_history_purchase_order_id_fkey
    foreign key (purchase_order_id) references public.purchase_orders(id) on delete set null;

create table if not exists public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  supplier_item_id uuid references public.supplier_items(id) on delete set null,
  order_unit text not null,
  order_quantity numeric(14, 3) not null,
  received_quantity numeric(14, 3) not null default 0,
  unit_cost integer not null default 0,
  line_total integer not null default 0,
  expiration_date date,
  batch_code text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_order_lines_unit_format check (order_unit ~ '^[a-zA-Z0-9_%/ .-]{1,24}$'),
  constraint purchase_order_lines_quantity_positive check (order_quantity > 0 and received_quantity >= 0),
  constraint purchase_order_lines_costs_non_negative check (unit_cost >= 0 and line_total >= 0),
  constraint purchase_order_lines_batch_code_format check (batch_code is null or batch_code ~ '^[A-Za-z0-9_.:/ -]{1,64}$'),
  constraint purchase_order_lines_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.inventory_batches (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  supplier_id uuid references public.suppliers(id) on delete set null,
  purchase_order_line_id uuid references public.purchase_order_lines(id) on delete set null,
  batch_code text,
  received_at timestamptz not null default now(),
  expiration_date date,
  initial_quantity numeric(14, 3) not null default 0,
  remaining_quantity numeric(14, 3) not null default 0,
  unit_cost integer not null default 0,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_batches_quantity_non_negative check (initial_quantity >= 0 and remaining_quantity >= 0),
  constraint inventory_batches_unit_cost_non_negative check (unit_cost >= 0),
  constraint inventory_batches_status_check check (status in ('active','depleted','expired','quarantined','discarded')),
  constraint inventory_batches_batch_code_format check (batch_code is null or batch_code ~ '^[A-Za-z0-9_.:/ -]{1,64}$'),
  constraint inventory_batches_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists inventory_batches_unique_batch_code_idx
  on public.inventory_batches (restaurant_id, ingredient_id, batch_code)
  where batch_code is not null;

create table if not exists public.stock_balances (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid references public.store_branches(id) on delete set null,
  location_id uuid references public.inventory_locations(id) on delete set null,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  batch_id uuid references public.inventory_batches(id) on delete set null,
  on_hand_quantity numeric(14, 3) not null default 0,
  reserved_quantity numeric(14, 3) not null default 0,
  incoming_quantity numeric(14, 3) not null default 0,
  counted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_balances_quantities_non_negative check (
    on_hand_quantity >= 0
    and reserved_quantity >= 0
    and incoming_quantity >= 0
    and reserved_quantity <= on_hand_quantity
  ),
  constraint stock_balances_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists stock_balances_unique_no_batch_idx
  on public.stock_balances (
    restaurant_id,
    coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
    ingredient_id
  )
  where batch_id is null;

create unique index if not exists stock_balances_unique_batch_idx
  on public.stock_balances (
    restaurant_id,
    coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
    ingredient_id,
    batch_id
  )
  where batch_id is not null;

create table if not exists public.branch_transfers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  from_branch_id uuid references public.store_branches(id) on delete set null,
  to_branch_id uuid references public.store_branches(id) on delete set null,
  from_location_id uuid references public.inventory_locations(id) on delete set null,
  to_location_id uuid references public.inventory_locations(id) on delete set null,
  transfer_number text not null,
  status text not null default 'draft',
  requested_by_user_id uuid references public.users(id) on delete set null,
  approved_by_user_id uuid references public.users(id) on delete set null,
  dispatched_at timestamptz,
  received_at timestamptz,
  cancelled_at timestamptz,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branch_transfers_number_format check (transfer_number ~ '^[A-Za-z0-9_.:/ -]{3,64}$'),
  constraint branch_transfers_status_check check (status in ('draft','requested','approved','dispatched','received','cancelled')),
  constraint branch_transfers_different_branch check (
    from_branch_id is null
    or to_branch_id is null
    or from_branch_id <> to_branch_id
  ),
  constraint branch_transfers_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint branch_transfers_unique_number unique (restaurant_id, transfer_number)
);

create table if not exists public.branch_transfer_lines (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  transfer_id uuid not null references public.branch_transfers(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  batch_id uuid references public.inventory_batches(id) on delete set null,
  unit text not null,
  requested_quantity numeric(14, 3) not null,
  dispatched_quantity numeric(14, 3) not null default 0,
  received_quantity numeric(14, 3) not null default 0,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branch_transfer_lines_unit_format check (unit ~ '^[a-zA-Z0-9_%/ .-]{1,24}$'),
  constraint branch_transfer_lines_quantities_non_negative check (
    requested_quantity > 0
    and dispatched_quantity >= 0
    and received_quantity >= 0
  ),
  constraint branch_transfer_lines_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.inventory_alerts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid references public.store_branches(id) on delete set null,
  ingredient_id uuid references public.ingredients(id) on delete cascade,
  alert_type text not null,
  severity text not null default 'medium',
  status text not null default 'open',
  title text not null,
  detail text,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  actor_user_id uuid references public.users(id) on delete set null,
  source_type text not null default 'system',
  source_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_alerts_type_check check (alert_type in ('low_stock','out_of_stock','expiring_soon','expired','abnormal_usage','waste_spike','missing_inventory','supplier_delay','price_spike','recipe_gap')),
  constraint inventory_alerts_severity_check check (severity in ('low','medium','high','critical')),
  constraint inventory_alerts_status_check check (status in ('open','acknowledged','resolved','dismissed')),
  constraint inventory_alerts_title_length check (length(trim(title)) between 1 and 180),
  constraint inventory_alerts_metadata_object check (jsonb_typeof(metadata) = 'object')
);

alter table public.inventory_movements
  add column if not exists branch_id uuid references public.store_branches(id) on delete set null,
  add column if not exists location_id uuid references public.inventory_locations(id) on delete set null,
  add column if not exists batch_id uuid references public.inventory_batches(id) on delete set null,
  add column if not exists purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  add column if not exists transfer_id uuid references public.branch_transfers(id) on delete set null;

alter table public.inventory_movements
  drop constraint if exists inventory_movements_type_check,
  add constraint inventory_movements_type_check check (
    movement_type in (
      'receive',
      'deduct_sale',
      'adjust_increase',
      'adjust_decrease',
      'waste',
      'rollback',
      'transfer_in',
      'transfer_out',
      'expired',
      'internal_use',
      'supplier_return',
      'reserve',
      'release_reserve'
    )
  ),
  drop constraint if exists inventory_movements_source_type_check,
  add constraint inventory_movements_source_type_check check (
    source_type in (
      'manual',
      'order',
      'count',
      'recipe',
      'system',
      'purchase_order',
      'transfer',
      'supplier',
      'expiry',
      'ai_draft'
    )
  );

create index if not exists ingredients_restaurant_sku_idx
  on public.ingredients (restaurant_id, sku)
  where sku is not null;

create index if not exists ingredients_restaurant_barcode_idx
  on public.ingredients (restaurant_id, barcode)
  where barcode is not null;

create index if not exists inventory_locations_restaurant_branch_idx
  on public.inventory_locations (restaurant_id, branch_id, is_active, sort_order, name);

create index if not exists suppliers_restaurant_active_idx
  on public.suppliers (restaurant_id, is_active, is_preferred desc, name);

create index if not exists supplier_items_supplier_idx
  on public.supplier_items (restaurant_id, supplier_id, is_active);

create index if not exists supplier_items_ingredient_idx
  on public.supplier_items (restaurant_id, ingredient_id, is_preferred desc);

create index if not exists supplier_price_history_supplier_idx
  on public.supplier_price_history (restaurant_id, supplier_id, recorded_at desc);

create index if not exists supplier_price_history_ingredient_idx
  on public.supplier_price_history (restaurant_id, ingredient_id, recorded_at desc);

create index if not exists purchase_orders_restaurant_status_idx
  on public.purchase_orders (restaurant_id, status, created_at desc);

create index if not exists purchase_orders_supplier_idx
  on public.purchase_orders (restaurant_id, supplier_id, created_at desc);

create index if not exists purchase_order_lines_order_idx
  on public.purchase_order_lines (purchase_order_id);

create index if not exists inventory_batches_restaurant_expiry_idx
  on public.inventory_batches (restaurant_id, expiration_date, status)
  where expiration_date is not null;

create index if not exists inventory_batches_ingredient_idx
  on public.inventory_batches (restaurant_id, ingredient_id, status);

create index if not exists stock_balances_restaurant_ingredient_idx
  on public.stock_balances (restaurant_id, ingredient_id, branch_id, location_id);

create index if not exists stock_balances_low_stock_idx
  on public.stock_balances (restaurant_id, branch_id, ingredient_id, on_hand_quantity)
  where on_hand_quantity > 0;

create index if not exists branch_transfers_restaurant_status_idx
  on public.branch_transfers (restaurant_id, status, created_at desc);

create index if not exists branch_transfer_lines_transfer_idx
  on public.branch_transfer_lines (transfer_id);

create index if not exists inventory_alerts_restaurant_open_idx
  on public.inventory_alerts (restaurant_id, status, severity, detected_at desc)
  where status in ('open','acknowledged');

create index if not exists inventory_movements_branch_created_idx
  on public.inventory_movements (restaurant_id, branch_id, created_at desc)
  where branch_id is not null;

create index if not exists inventory_movements_batch_created_idx
  on public.inventory_movements (batch_id, created_at desc)
  where batch_id is not null;

drop function if exists public.apply_inventory_movement(uuid, uuid, text, numeric, integer, text, uuid, text, uuid, jsonb);

create or replace function public.apply_inventory_movement(
  target_restaurant_id uuid,
  target_ingredient_id uuid,
  target_movement_type text,
  target_quantity_delta numeric,
  target_unit_cost integer default null,
  target_source_type text default 'manual',
  target_source_id uuid default null,
  target_reason text default null,
  target_actor_user_id uuid default auth.uid(),
  target_metadata jsonb default '{}'::jsonb,
  target_branch_id uuid default null,
  target_location_id uuid default null,
  target_batch_id uuid default null,
  target_purchase_order_id uuid default null,
  target_transfer_id uuid default null
)
returns public.inventory_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  effective_branch_id uuid := target_branch_id;
  effective_location_id uuid := target_location_id;
  inserted_movement public.inventory_movements;
  physical_delta numeric(14, 3) := target_quantity_delta;
  reserved_delta numeric(14, 3) := 0;
  balance_id uuid;
begin
  if target_restaurant_id is distinct from app_private.current_restaurant_id() then
    raise exception 'Inventory restaurant scope mismatch';
  end if;

  if target_quantity_delta = 0 then
    raise exception 'Inventory movement quantity cannot be zero';
  end if;

  if target_movement_type = 'reserve' then
    physical_delta := 0;
    reserved_delta := abs(target_quantity_delta);
  elsif target_movement_type = 'release_reserve' then
    physical_delta := 0;
    reserved_delta := -abs(target_quantity_delta);
  end if;

  if effective_location_id is null then
    select id, branch_id
    into effective_location_id, effective_branch_id
    from public.inventory_locations
    where restaurant_id = target_restaurant_id
      and is_primary = true
      and is_active = true
    order by branch_id nulls last, sort_order, created_at
    limit 1;
  elsif effective_branch_id is null then
    select branch_id
    into effective_branch_id
    from public.inventory_locations
    where id = effective_location_id
      and restaurant_id = target_restaurant_id;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      target_restaurant_id::text || ':' ||
      target_ingredient_id::text || ':' ||
      coalesce(effective_branch_id::text, 'global') || ':' ||
      coalesce(effective_location_id::text, 'global') || ':' ||
      coalesce(target_batch_id::text, 'no-batch'),
      0
    )
  );

  if physical_delta <> 0 then
    update public.ingredients
    set
      on_hand_quantity = on_hand_quantity + physical_delta,
      reference_unit_cost = case
        when target_unit_cost is not null and target_unit_cost >= 0 and physical_delta > 0 then target_unit_cost
        else reference_unit_cost
      end,
      updated_at = now()
    where id = target_ingredient_id
      and restaurant_id = target_restaurant_id
      and on_hand_quantity + physical_delta >= 0;

    if not found then
      raise exception 'Inventory movement would make stock negative or ingredient is missing';
    end if;
  else
    perform 1
    from public.ingredients
    where id = target_ingredient_id
      and restaurant_id = target_restaurant_id;

    if not found then
      raise exception 'Inventory ingredient is missing';
    end if;
  end if;

  if target_batch_id is not null and physical_delta <> 0 then
    update public.inventory_batches
    set
      remaining_quantity = remaining_quantity + physical_delta,
      status = case
        when remaining_quantity + physical_delta <= 0 then 'depleted'
        when status = 'depleted' and remaining_quantity + physical_delta > 0 then 'active'
        else status
      end,
      updated_at = now()
    where id = target_batch_id
      and restaurant_id = target_restaurant_id
      and ingredient_id = target_ingredient_id
      and remaining_quantity + physical_delta >= 0;

    if not found then
      raise exception 'Inventory batch movement would make batch negative or batch is missing';
    end if;
  end if;

  update public.stock_balances
  set
    on_hand_quantity = on_hand_quantity + physical_delta,
    reserved_quantity = reserved_quantity + reserved_delta,
    updated_at = now()
  where restaurant_id = target_restaurant_id
    and ingredient_id = target_ingredient_id
    and coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid) =
      coalesce(effective_branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid) =
      coalesce(effective_location_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and (
      (target_batch_id is null and batch_id is null)
      or batch_id = target_batch_id
    )
    and on_hand_quantity + physical_delta >= 0
    and reserved_quantity + reserved_delta >= 0
    and reserved_quantity + reserved_delta <= on_hand_quantity + physical_delta
  returning id into balance_id;

  if balance_id is null then
    if physical_delta > 0 and reserved_delta = 0 then
      insert into public.stock_balances (
        restaurant_id,
        branch_id,
        location_id,
        ingredient_id,
        batch_id,
        on_hand_quantity,
        reserved_quantity,
        metadata
      )
      values (
        target_restaurant_id,
        effective_branch_id,
        effective_location_id,
        target_ingredient_id,
        target_batch_id,
        physical_delta,
        0,
        jsonb_build_object('createdFrom', 'apply_inventory_movement')
      )
      returning id into balance_id;
    else
      raise exception 'Inventory balance movement would make stock negative, over-reserved, or balance is missing';
    end if;
  end if;

  insert into public.inventory_movements (
    restaurant_id,
    ingredient_id,
    branch_id,
    location_id,
    batch_id,
    purchase_order_id,
    transfer_id,
    movement_type,
    quantity_delta,
    unit_cost,
    source_type,
    source_id,
    reason,
    actor_user_id,
    metadata
  )
  values (
    target_restaurant_id,
    target_ingredient_id,
    effective_branch_id,
    effective_location_id,
    target_batch_id,
    target_purchase_order_id,
    target_transfer_id,
    target_movement_type,
    target_quantity_delta,
    target_unit_cost,
    target_source_type,
    target_source_id,
    nullif(trim(coalesce(target_reason, '')), ''),
    target_actor_user_id,
    coalesce(target_metadata, '{}'::jsonb)
  )
  returning * into inserted_movement;

  return inserted_movement;
end;
$$;

revoke all on function public.apply_inventory_movement(
  uuid,
  uuid,
  text,
  numeric,
  integer,
  text,
  uuid,
  text,
  uuid,
  jsonb,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid
) from public;
grant execute on function public.apply_inventory_movement(
  uuid,
  uuid,
  text,
  numeric,
  integer,
  text,
  uuid,
  text,
  uuid,
  jsonb,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid
) to authenticated, service_role;

drop function if exists public.create_purchase_order(uuid, uuid, uuid, timestamptz, text, uuid, jsonb);

create or replace function public.create_purchase_order(
  target_restaurant_id uuid,
  target_supplier_id uuid default null,
  target_location_id uuid default null,
  target_expected_delivery_at timestamptz default null,
  target_note text default null,
  target_actor_user_id uuid default auth.uid(),
  target_lines jsonb default '[]'::jsonb
)
returns public.purchase_orders
language plpgsql
security invoker
set search_path = public
as $$
declare
  created_order public.purchase_orders;
  selected_location_id uuid;
  selected_branch_id uuid;
  line_item jsonb;
  ingredient_record record;
  supplier_item_id uuid;
  order_unit_value text;
  quantity numeric(14, 3);
  unit_cost integer;
  line_total integer;
  subtotal_amount integer := 0;
  inserted_line_count integer := 0;
  generated_po_number text;
begin
  if target_restaurant_id is distinct from app_private.current_restaurant_id() then
    raise exception 'Purchase order restaurant scope mismatch';
  end if;

  if target_lines is null
    or jsonb_typeof(target_lines) <> 'array'
    or jsonb_array_length(target_lines) = 0
    or jsonb_array_length(target_lines) > 100
  then
    raise exception 'Purchase order requires between 1 and 100 lines';
  end if;

  if target_supplier_id is not null and not exists (
    select 1
    from public.suppliers
    where id = target_supplier_id
      and restaurant_id = target_restaurant_id
      and is_active = true
  ) then
    raise exception 'Purchase order supplier is missing';
  end if;

  if target_location_id is null then
    select id, branch_id
    into selected_location_id, selected_branch_id
    from public.inventory_locations
    where restaurant_id = target_restaurant_id
      and is_primary = true
      and is_active = true
    order by branch_id nulls last, sort_order, created_at
    limit 1;
  else
    select id, branch_id
    into selected_location_id, selected_branch_id
    from public.inventory_locations
    where id = target_location_id
      and restaurant_id = target_restaurant_id
      and is_active = true;

    if selected_location_id is null then
      raise exception 'Purchase order location is missing';
    end if;
  end if;

  generated_po_number :=
    'PO-' ||
    to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYYMMDD-HH24MISS') ||
    '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.purchase_orders (
    restaurant_id,
    branch_id,
    location_id,
    supplier_id,
    po_number,
    status,
    expected_delivery_at,
    note,
    actor_user_id,
    metadata
  )
  values (
    target_restaurant_id,
    selected_branch_id,
    selected_location_id,
    target_supplier_id,
    generated_po_number,
    'ordered',
    target_expected_delivery_at,
    nullif(trim(coalesce(target_note, '')), ''),
    target_actor_user_id,
    jsonb_build_object('createdFrom', 'inventory_workspace')
  )
  returning * into created_order;

  for line_item in
    select value
    from jsonb_array_elements(target_lines)
  loop
    select id, unit, base_unit
    into ingredient_record
    from public.ingredients
    where id = (line_item ->> 'ingredientId')::uuid
      and restaurant_id = target_restaurant_id
      and is_active = true;

    if ingredient_record.id is null then
      raise exception 'Purchase order ingredient is missing';
    end if;

    quantity := (line_item ->> 'quantity')::numeric;
    unit_cost := coalesce(nullif(line_item ->> 'unitCost', '')::integer, 0);
    order_unit_value := nullif(trim(coalesce(line_item ->> 'orderUnit', '')), '');
    order_unit_value := coalesce(order_unit_value, ingredient_record.base_unit, ingredient_record.unit);

    if quantity <= 0 then
      raise exception 'Purchase order quantity must be positive';
    end if;

    if unit_cost < 0 then
      raise exception 'Purchase order unit cost cannot be negative';
    end if;

    line_total := round(quantity * unit_cost)::integer;

    if target_supplier_id is not null then
      insert into public.supplier_items (
        restaurant_id,
        supplier_id,
        ingredient_id,
        purchase_unit,
        unit_cost,
        min_order_quantity,
        last_ordered_at,
        is_active
      )
      values (
        target_restaurant_id,
        target_supplier_id,
        ingredient_record.id,
        order_unit_value,
        unit_cost,
        0,
        now(),
        true
      )
      on conflict (restaurant_id, supplier_id, ingredient_id, purchase_unit)
      do update set
        unit_cost = excluded.unit_cost,
        last_ordered_at = now(),
        is_active = true,
        updated_at = now()
      returning id into supplier_item_id;
    else
      supplier_item_id := null;
    end if;

    insert into public.purchase_order_lines (
      restaurant_id,
      purchase_order_id,
      ingredient_id,
      supplier_item_id,
      order_unit,
      order_quantity,
      unit_cost,
      line_total,
      expiration_date,
      batch_code,
      note,
      metadata
    )
    values (
      target_restaurant_id,
      created_order.id,
      ingredient_record.id,
      supplier_item_id,
      order_unit_value,
      quantity,
      unit_cost,
      line_total,
      nullif(line_item ->> 'expirationDate', '')::date,
      nullif(trim(coalesce(line_item ->> 'batchCode', '')), ''),
      nullif(trim(coalesce(line_item ->> 'note', '')), ''),
      jsonb_build_object('createdFrom', 'inventory_workspace')
    );

    subtotal_amount := subtotal_amount + line_total;
    inserted_line_count := inserted_line_count + 1;
  end loop;

  update public.purchase_orders
  set
    subtotal = subtotal_amount,
    total_amount = greatest(0, subtotal_amount - discount_amount + shipping_fee),
    metadata = metadata || jsonb_build_object('lineCount', inserted_line_count),
    updated_at = now()
  where id = created_order.id
    and restaurant_id = target_restaurant_id
  returning * into created_order;

  return created_order;
end;
$$;

revoke all on function public.create_purchase_order(uuid, uuid, uuid, timestamptz, text, uuid, jsonb) from public;
grant execute on function public.create_purchase_order(uuid, uuid, uuid, timestamptz, text, uuid, jsonb) to authenticated, service_role;

drop function if exists public.receive_purchase_order(uuid, uuid, uuid, timestamptz);

create or replace function public.receive_purchase_order(
  target_restaurant_id uuid,
  target_purchase_order_id uuid,
  target_actor_user_id uuid default auth.uid(),
  target_received_at timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  order_record public.purchase_orders;
  line_record record;
  stock_unit text;
  conversion_factor numeric(18, 8);
  purchase_quantity numeric(14, 3);
  stock_quantity numeric(14, 3);
  batch_id uuid;
  received_line_count integer := 0;
  received_total_quantity numeric(14, 3) := 0;
  received_total_value integer := 0;
  effective_batch_code text;
begin
  if target_restaurant_id is distinct from app_private.current_restaurant_id() then
    raise exception 'Purchase receipt restaurant scope mismatch';
  end if;

  select *
  into order_record
  from public.purchase_orders
  where id = target_purchase_order_id
    and restaurant_id = target_restaurant_id
  for update;

  if order_record.id is null then
    raise exception 'Purchase order is missing';
  end if;

  if order_record.status in ('cancelled', 'delivered') then
    raise exception 'Purchase order cannot be received in current status';
  end if;

  for line_record in
    select
      l.*,
      i.unit as ingredient_unit,
      i.base_unit as ingredient_base_unit
    from public.purchase_order_lines l
    join public.ingredients i on i.id = l.ingredient_id
    where l.purchase_order_id = order_record.id
      and l.restaurant_id = target_restaurant_id
    order by l.created_at, l.id
    for update of l
  loop
    purchase_quantity := line_record.order_quantity - line_record.received_quantity;
    if purchase_quantity <= 0 then
      continue;
    end if;

    stock_unit := coalesce(line_record.ingredient_base_unit, line_record.ingredient_unit);
    conversion_factor := 1;

    if line_record.order_unit <> stock_unit then
      select factor
      into conversion_factor
      from public.ingredient_unit_conversions
      where restaurant_id = target_restaurant_id
        and ingredient_id = line_record.ingredient_id
        and from_unit = line_record.order_unit
        and to_unit = stock_unit
      limit 1;

      if conversion_factor is null then
        raise exception 'Missing unit conversion from % to %', line_record.order_unit, stock_unit;
      end if;
    end if;

    stock_quantity := round((purchase_quantity * conversion_factor)::numeric, 3);
    effective_batch_code := coalesce(
      nullif(trim(coalesce(line_record.batch_code, '')), ''),
      order_record.po_number || '-' || substr(line_record.id::text, 1, 8)
    );

    insert into public.inventory_batches (
      restaurant_id,
      ingredient_id,
      supplier_id,
      purchase_order_line_id,
      batch_code,
      received_at,
      expiration_date,
      initial_quantity,
      remaining_quantity,
      unit_cost,
      metadata
    )
    values (
      target_restaurant_id,
      line_record.ingredient_id,
      order_record.supplier_id,
      line_record.id,
      effective_batch_code,
      target_received_at,
      line_record.expiration_date,
      stock_quantity,
      0,
      line_record.unit_cost,
      jsonb_build_object(
        'purchaseQuantity', purchase_quantity,
        'purchaseUnit', line_record.order_unit,
        'stockUnit', stock_unit,
        'conversionFactor', conversion_factor
      )
    )
    on conflict (restaurant_id, ingredient_id, batch_code) where batch_code is not null
    do update set
      initial_quantity = public.inventory_batches.initial_quantity + excluded.initial_quantity,
      unit_cost = excluded.unit_cost,
      updated_at = now(),
      metadata = public.inventory_batches.metadata || excluded.metadata
    returning id into batch_id;

    perform public.apply_inventory_movement(
      target_restaurant_id,
      line_record.ingredient_id,
      'receive',
      stock_quantity,
      line_record.unit_cost,
      'purchase_order',
      order_record.id,
      'Nhan hang tu PO ' || order_record.po_number,
      target_actor_user_id,
      jsonb_build_object(
        'purchaseOrderLineId', line_record.id,
        'purchaseQuantity', purchase_quantity,
        'purchaseUnit', line_record.order_unit,
        'stockUnit', stock_unit,
        'conversionFactor', conversion_factor
      ),
      order_record.branch_id,
      order_record.location_id,
      batch_id,
      order_record.id,
      null
    );

    update public.purchase_order_lines
    set
      received_quantity = order_quantity,
      updated_at = now()
    where id = line_record.id
      and restaurant_id = target_restaurant_id;

    if order_record.supplier_id is not null then
      insert into public.supplier_price_history (
        restaurant_id,
        supplier_id,
        ingredient_id,
        purchase_order_id,
        purchase_unit,
        unit_cost,
        quantity,
        recorded_at,
        metadata
      )
      values (
        target_restaurant_id,
        order_record.supplier_id,
        line_record.ingredient_id,
        order_record.id,
        line_record.order_unit,
        line_record.unit_cost,
        purchase_quantity,
        target_received_at,
        jsonb_build_object('purchaseOrderLineId', line_record.id)
      );
    end if;

    received_line_count := received_line_count + 1;
    received_total_quantity := received_total_quantity + stock_quantity;
    received_total_value := received_total_value + round(purchase_quantity * line_record.unit_cost)::integer;
  end loop;

  if received_line_count = 0 then
    raise exception 'Purchase order has no remaining quantity to receive';
  end if;

  update public.purchase_orders
  set
    status = 'delivered',
    delivered_at = target_received_at,
    metadata = metadata || jsonb_build_object(
      'lastReceiptAt', target_received_at,
      'lastReceiptLineCount', received_line_count,
      'lastReceiptValue', received_total_value
    ),
    updated_at = now()
  where id = order_record.id
    and restaurant_id = target_restaurant_id;

  return jsonb_build_object(
    'purchaseOrderId', order_record.id,
    'poNumber', order_record.po_number,
    'receivedLines', received_line_count,
    'receivedQuantity', received_total_quantity,
    'receivedValue', received_total_value
  );
end;
$$;

revoke all on function public.receive_purchase_order(uuid, uuid, uuid, timestamptz) from public;
grant execute on function public.receive_purchase_order(uuid, uuid, uuid, timestamptz) to authenticated, service_role;

alter table public.inventory_locations enable row level security;
alter table public.suppliers enable row level security;
alter table public.ingredient_unit_conversions enable row level security;
alter table public.supplier_items enable row level security;
alter table public.supplier_price_history enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.inventory_batches enable row level security;
alter table public.stock_balances enable row level security;
alter table public.branch_transfers enable row level security;
alter table public.branch_transfer_lines enable row level security;
alter table public.inventory_alerts enable row level security;

grant select, insert, update, delete on
  public.inventory_locations,
  public.suppliers,
  public.ingredient_unit_conversions,
  public.supplier_items,
  public.supplier_price_history,
  public.purchase_orders,
  public.purchase_order_lines,
  public.inventory_batches,
  public.stock_balances,
  public.branch_transfers,
  public.branch_transfer_lines,
  public.inventory_alerts
to authenticated;

grant select, insert, update, delete on
  public.inventory_locations,
  public.suppliers,
  public.ingredient_unit_conversions,
  public.supplier_items,
  public.supplier_price_history,
  public.purchase_orders,
  public.purchase_order_lines,
  public.inventory_batches,
  public.stock_balances,
  public.branch_transfers,
  public.branch_transfer_lines,
  public.inventory_alerts
to service_role;

revoke all on
  public.inventory_locations,
  public.suppliers,
  public.ingredient_unit_conversions,
  public.supplier_items,
  public.supplier_price_history,
  public.purchase_orders,
  public.purchase_order_lines,
  public.inventory_batches,
  public.stock_balances,
  public.branch_transfers,
  public.branch_transfer_lines,
  public.inventory_alerts
from anon;

drop trigger if exists inventory_locations_set_updated_at on public.inventory_locations;
create trigger inventory_locations_set_updated_at
before update on public.inventory_locations
for each row execute function public.set_updated_at();

drop trigger if exists suppliers_set_updated_at on public.suppliers;
create trigger suppliers_set_updated_at
before update on public.suppliers
for each row execute function public.set_updated_at();

drop trigger if exists ingredient_unit_conversions_set_updated_at on public.ingredient_unit_conversions;
create trigger ingredient_unit_conversions_set_updated_at
before update on public.ingredient_unit_conversions
for each row execute function public.set_updated_at();

drop trigger if exists supplier_items_set_updated_at on public.supplier_items;
create trigger supplier_items_set_updated_at
before update on public.supplier_items
for each row execute function public.set_updated_at();

drop trigger if exists purchase_orders_set_updated_at on public.purchase_orders;
create trigger purchase_orders_set_updated_at
before update on public.purchase_orders
for each row execute function public.set_updated_at();

drop trigger if exists purchase_order_lines_set_updated_at on public.purchase_order_lines;
create trigger purchase_order_lines_set_updated_at
before update on public.purchase_order_lines
for each row execute function public.set_updated_at();

drop trigger if exists inventory_batches_set_updated_at on public.inventory_batches;
create trigger inventory_batches_set_updated_at
before update on public.inventory_batches
for each row execute function public.set_updated_at();

drop trigger if exists stock_balances_set_updated_at on public.stock_balances;
create trigger stock_balances_set_updated_at
before update on public.stock_balances
for each row execute function public.set_updated_at();

drop trigger if exists branch_transfers_set_updated_at on public.branch_transfers;
create trigger branch_transfers_set_updated_at
before update on public.branch_transfers
for each row execute function public.set_updated_at();

drop trigger if exists branch_transfer_lines_set_updated_at on public.branch_transfer_lines;
create trigger branch_transfer_lines_set_updated_at
before update on public.branch_transfer_lines
for each row execute function public.set_updated_at();

drop trigger if exists inventory_alerts_set_updated_at on public.inventory_alerts;
create trigger inventory_alerts_set_updated_at
before update on public.inventory_alerts
for each row execute function public.set_updated_at();

drop policy if exists "restaurant users can read own inventory locations" on public.inventory_locations;
create policy "restaurant users can read own inventory locations"
on public.inventory_locations for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "admins can manage own inventory locations" on public.inventory_locations;
create policy "admins can manage own inventory locations"
on public.inventory_locations for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

drop policy if exists "restaurant users can read own suppliers" on public.suppliers;
create policy "restaurant users can read own suppliers"
on public.suppliers for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "admins can manage own suppliers" on public.suppliers;
create policy "admins can manage own suppliers"
on public.suppliers for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

drop policy if exists "restaurant users can read own ingredient unit conversions" on public.ingredient_unit_conversions;
create policy "restaurant users can read own ingredient unit conversions"
on public.ingredient_unit_conversions for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "admins can manage own ingredient unit conversions" on public.ingredient_unit_conversions;
create policy "admins can manage own ingredient unit conversions"
on public.ingredient_unit_conversions for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

drop policy if exists "restaurant users can read own supplier items" on public.supplier_items;
create policy "restaurant users can read own supplier items"
on public.supplier_items for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "admins can manage own supplier items" on public.supplier_items;
create policy "admins can manage own supplier items"
on public.supplier_items for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

drop policy if exists "restaurant users can read own supplier price history" on public.supplier_price_history;
create policy "restaurant users can read own supplier price history"
on public.supplier_price_history for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "admins can manage own supplier price history" on public.supplier_price_history;
create policy "admins can manage own supplier price history"
on public.supplier_price_history for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

drop policy if exists "restaurant users can read own purchase orders" on public.purchase_orders;
create policy "restaurant users can read own purchase orders"
on public.purchase_orders for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "admins can manage own purchase orders" on public.purchase_orders;
create policy "admins can manage own purchase orders"
on public.purchase_orders for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

drop policy if exists "restaurant users can read own purchase order lines" on public.purchase_order_lines;
create policy "restaurant users can read own purchase order lines"
on public.purchase_order_lines for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "admins can manage own purchase order lines" on public.purchase_order_lines;
create policy "admins can manage own purchase order lines"
on public.purchase_order_lines for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

drop policy if exists "restaurant users can read own inventory batches" on public.inventory_batches;
create policy "restaurant users can read own inventory batches"
on public.inventory_batches for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "admins can manage own inventory batches" on public.inventory_batches;
create policy "admins can manage own inventory batches"
on public.inventory_batches for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

drop policy if exists "restaurant users can read own stock balances" on public.stock_balances;
create policy "restaurant users can read own stock balances"
on public.stock_balances for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "admins can manage own stock balances" on public.stock_balances;
create policy "admins can manage own stock balances"
on public.stock_balances for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

drop policy if exists "restaurant users can read own branch transfers" on public.branch_transfers;
create policy "restaurant users can read own branch transfers"
on public.branch_transfers for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "admins can manage own branch transfers" on public.branch_transfers;
create policy "admins can manage own branch transfers"
on public.branch_transfers for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

drop policy if exists "restaurant users can read own branch transfer lines" on public.branch_transfer_lines;
create policy "restaurant users can read own branch transfer lines"
on public.branch_transfer_lines for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "admins can manage own branch transfer lines" on public.branch_transfer_lines;
create policy "admins can manage own branch transfer lines"
on public.branch_transfer_lines for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

drop policy if exists "restaurant users can read own inventory alerts" on public.inventory_alerts;
create policy "restaurant users can read own inventory alerts"
on public.inventory_alerts for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "admins can manage own inventory alerts" on public.inventory_alerts;
create policy "admins can manage own inventory alerts"
on public.inventory_alerts for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

do $$
declare
  realtime_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach realtime_table in array array[
      'inventory_locations',
      'suppliers',
      'supplier_price_history',
      'purchase_orders',
      'purchase_order_lines',
      'inventory_batches',
      'stock_balances',
      'branch_transfers',
      'branch_transfer_lines',
      'inventory_alerts',
      'inventory_movements'
    ]
    loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = realtime_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', realtime_table);
      end if;
    end loop;
  end if;
end $$;

insert into public.inventory_locations (restaurant_id, branch_id, name, location_type, code, is_primary, sort_order, metadata)
select
  b.restaurant_id,
  b.id,
  b.name || ' - Kho chính',
  'branch_storage',
  'MAIN',
  true,
  0,
  jsonb_build_object('seededFrom', 'store_branches')
from public.store_branches b
where b.is_active = true
on conflict do nothing;

insert into public.stock_balances (restaurant_id, branch_id, location_id, ingredient_id, on_hand_quantity, metadata)
select
  i.restaurant_id,
  l.branch_id,
  l.id,
  i.id,
  i.on_hand_quantity,
  jsonb_build_object('seededFrom', 'ingredients.on_hand_quantity')
from public.ingredients i
left join lateral (
  select id, branch_id
  from public.inventory_locations
  where restaurant_id = i.restaurant_id
    and is_primary = true
    and is_active = true
  order by branch_id nulls last, sort_order, created_at
  limit 1
) l on true
where i.on_hand_quantity > 0
on conflict do nothing;

insert into public.staff_permissions (permission_key, group_key, label, description, is_dangerous)
values
  ('inventory.purchase_orders', 'inventory', 'Quản lý đơn mua hàng', 'Tạo, duyệt và nhận purchase order.', true),
  ('inventory.suppliers', 'inventory', 'Quản lý nhà cung cấp', 'Quản lý nhà cung cấp, giá và lịch sử mua.', true),
  ('inventory.transfers', 'inventory', 'Điều chuyển kho', 'Tạo và duyệt chuyển kho giữa chi nhánh.', true),
  ('inventory.counts', 'inventory', 'Kiểm kê kho', 'Tạo, gửi và áp dụng phiên kiểm kê.', true),
  ('inventory.analytics', 'inventory', 'Phân tích kho', 'Xem phân tích tồn kho, hao hụt và dự báo.', false)
on conflict (permission_key) do update set
  group_key = excluded.group_key,
  label = excluded.label,
  description = excluded.description,
  is_dangerous = excluded.is_dangerous;
