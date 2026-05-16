-- Inventory foundation for recipe-based stock operations.

create table if not exists public.ingredient_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ingredient_categories_name_length check (length(trim(name)) between 1 and 120),
  constraint ingredient_categories_unique unique (restaurant_id, name)
);

create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id uuid references public.ingredient_categories(id) on delete set null,
  name text not null,
  unit text not null default 'unit',
  on_hand_quantity numeric(14, 3) not null default 0,
  minimum_quantity numeric(14, 3) not null default 0,
  reference_unit_cost integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ingredients_name_length check (length(trim(name)) between 1 and 160),
  constraint ingredients_unit_format check (unit ~ '^[a-zA-Z0-9_%/ .-]{1,24}$'),
  constraint ingredients_quantity_non_negative check (on_hand_quantity >= 0 and minimum_quantity >= 0),
  constraint ingredients_unit_cost_non_negative check (reference_unit_cost >= 0),
  constraint ingredients_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint ingredients_unique unique (restaurant_id, name)
);

create table if not exists public.menu_item_recipes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  quantity_per_item numeric(14, 3) not null,
  waste_percent numeric(5, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_item_recipes_quantity_positive check (quantity_per_item > 0),
  constraint menu_item_recipes_waste_percent_range check (waste_percent >= 0 and waste_percent <= 100),
  constraint menu_item_recipes_unique unique (restaurant_id, menu_item_id, ingredient_id)
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  movement_type text not null,
  quantity_delta numeric(14, 3) not null,
  unit_cost integer,
  source_type text not null default 'manual',
  source_id uuid,
  reason text,
  actor_user_id uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint inventory_movements_type_check check (movement_type in ('receive','deduct_sale','adjust_increase','adjust_decrease','waste','rollback')),
  constraint inventory_movements_source_type_check check (source_type in ('manual','order','count','recipe','system')),
  constraint inventory_movements_quantity_non_zero check (quantity_delta <> 0),
  constraint inventory_movements_unit_cost_non_negative check (unit_cost is null or unit_cost >= 0),
  constraint inventory_movements_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.inventory_counts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  status text not null default 'draft',
  title text not null default 'Kiem ke kho',
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  applied_at timestamptz,
  cancelled_at timestamptz,
  actor_user_id uuid references public.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_counts_status_check check (status in ('draft','submitted','applied','cancelled')),
  constraint inventory_counts_title_length check (length(trim(title)) between 1 and 160)
);

create table if not exists public.inventory_count_lines (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references public.inventory_counts(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  expected_quantity numeric(14, 3) not null default 0,
  counted_quantity numeric(14, 3),
  variance_quantity numeric(14, 3) generated always as (coalesce(counted_quantity, expected_quantity) - expected_quantity) stored,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_count_lines_expected_non_negative check (expected_quantity >= 0),
  constraint inventory_count_lines_counted_non_negative check (counted_quantity is null or counted_quantity >= 0),
  constraint inventory_count_lines_unique unique (count_id, ingredient_id)
);

create index if not exists ingredient_categories_restaurant_idx
  on public.ingredient_categories (restaurant_id, name);

create index if not exists ingredients_restaurant_active_idx
  on public.ingredients (restaurant_id, is_active, name);

create index if not exists ingredients_restaurant_low_stock_idx
  on public.ingredients (restaurant_id, on_hand_quantity, minimum_quantity)
  where is_active = true;

create index if not exists menu_item_recipes_restaurant_menu_idx
  on public.menu_item_recipes (restaurant_id, menu_item_id);

create index if not exists menu_item_recipes_restaurant_ingredient_idx
  on public.menu_item_recipes (restaurant_id, ingredient_id);

create index if not exists inventory_movements_restaurant_created_idx
  on public.inventory_movements (restaurant_id, created_at desc);

create index if not exists inventory_movements_ingredient_created_idx
  on public.inventory_movements (ingredient_id, created_at desc);

create unique index if not exists inventory_movements_order_deduction_unique_idx
  on public.inventory_movements (restaurant_id, source_id, ingredient_id, movement_type)
  where source_type = 'order' and movement_type = 'deduct_sale' and source_id is not null;

create unique index if not exists inventory_movements_order_rollback_unique_idx
  on public.inventory_movements (restaurant_id, source_id, ingredient_id, movement_type)
  where source_type = 'order' and movement_type = 'rollback' and source_id is not null;

create index if not exists inventory_counts_restaurant_status_idx
  on public.inventory_counts (restaurant_id, status, created_at desc);

create index if not exists inventory_count_lines_count_idx
  on public.inventory_count_lines (count_id);

alter table public.ingredient_categories enable row level security;
alter table public.ingredients enable row level security;
alter table public.menu_item_recipes enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_counts enable row level security;
alter table public.inventory_count_lines enable row level security;

drop policy if exists "staff can read own ingredient categories" on public.ingredient_categories;
create policy "staff can read own ingredient categories"
on public.ingredient_categories for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

drop policy if exists "admins can manage own ingredient categories" on public.ingredient_categories;
create policy "admins can manage own ingredient categories"
on public.ingredient_categories for all
to authenticated
using (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN')
with check (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN');

drop policy if exists "staff can read own ingredients" on public.ingredients;
create policy "staff can read own ingredients"
on public.ingredients for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

drop policy if exists "admins can manage own ingredients" on public.ingredients;
create policy "admins can manage own ingredients"
on public.ingredients for all
to authenticated
using (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN')
with check (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN');

drop policy if exists "staff can read own menu recipes" on public.menu_item_recipes;
create policy "staff can read own menu recipes"
on public.menu_item_recipes for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

drop policy if exists "admins can manage own menu recipes" on public.menu_item_recipes;
create policy "admins can manage own menu recipes"
on public.menu_item_recipes for all
to authenticated
using (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN')
with check (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN');

drop policy if exists "staff can read own inventory movements" on public.inventory_movements;
create policy "staff can read own inventory movements"
on public.inventory_movements for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

drop policy if exists "admins can create own inventory movements" on public.inventory_movements;
create policy "admins can create own inventory movements"
on public.inventory_movements for insert
to authenticated
with check (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN');

drop policy if exists "staff can read own inventory counts" on public.inventory_counts;
create policy "staff can read own inventory counts"
on public.inventory_counts for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

drop policy if exists "admins can manage own inventory counts" on public.inventory_counts;
create policy "admins can manage own inventory counts"
on public.inventory_counts for all
to authenticated
using (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN')
with check (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN');

drop policy if exists "staff can read own inventory count lines" on public.inventory_count_lines;
create policy "staff can read own inventory count lines"
on public.inventory_count_lines for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

drop policy if exists "admins can manage own inventory count lines" on public.inventory_count_lines;
create policy "admins can manage own inventory count lines"
on public.inventory_count_lines for all
to authenticated
using (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN')
with check (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN');

drop trigger if exists ingredient_categories_set_updated_at on public.ingredient_categories;
create trigger ingredient_categories_set_updated_at
before update on public.ingredient_categories
for each row execute function public.set_updated_at();

drop trigger if exists ingredients_set_updated_at on public.ingredients;
create trigger ingredients_set_updated_at
before update on public.ingredients
for each row execute function public.set_updated_at();

drop trigger if exists menu_item_recipes_set_updated_at on public.menu_item_recipes;
create trigger menu_item_recipes_set_updated_at
before update on public.menu_item_recipes
for each row execute function public.set_updated_at();

drop trigger if exists inventory_counts_set_updated_at on public.inventory_counts;
create trigger inventory_counts_set_updated_at
before update on public.inventory_counts
for each row execute function public.set_updated_at();

drop trigger if exists inventory_count_lines_set_updated_at on public.inventory_count_lines;
create trigger inventory_count_lines_set_updated_at
before update on public.inventory_count_lines
for each row execute function public.set_updated_at();

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
  target_metadata jsonb default '{}'::jsonb
)
returns public.inventory_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_movement public.inventory_movements;
begin
  if target_restaurant_id <> public.current_restaurant_id() then
    raise exception 'Inventory restaurant scope mismatch';
  end if;

  if target_quantity_delta = 0 then
    raise exception 'Inventory movement quantity cannot be zero';
  end if;

  update public.ingredients
  set
    on_hand_quantity = on_hand_quantity + target_quantity_delta,
    reference_unit_cost = case
      when target_unit_cost is not null and target_unit_cost >= 0 and target_quantity_delta > 0 then target_unit_cost
      else reference_unit_cost
    end,
    updated_at = now()
  where id = target_ingredient_id
    and restaurant_id = target_restaurant_id
    and on_hand_quantity + target_quantity_delta >= 0;

  if not found then
    raise exception 'Inventory movement would make stock negative or ingredient is missing';
  end if;

  insert into public.inventory_movements (
    restaurant_id,
    ingredient_id,
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

revoke all on function public.apply_inventory_movement(uuid, uuid, text, numeric, integer, text, uuid, text, uuid, jsonb) from public;
grant execute on function public.apply_inventory_movement(uuid, uuid, text, numeric, integer, text, uuid, text, uuid, jsonb) to authenticated, service_role;

with plan_ids as (
  select
    (select id from public.saas_plans where code = 'pro' limit 1) as pro_id,
    (select id from public.saas_plans where code = 'premium' limit 1) as premium_id
),
capabilities as (
  select pro_id as plan_id, 'inventory_management' as feature_key, true as enabled, null::integer as limit_value
  from plan_ids
  where pro_id is not null
  union all
  select premium_id as plan_id, 'inventory_management' as feature_key, true as enabled, null::integer as limit_value
  from plan_ids
  where premium_id is not null
)
insert into public.plan_capabilities (plan_id, feature_key, enabled, limit_value, config)
select plan_id, feature_key, enabled, limit_value, '{}'::jsonb
from capabilities
on conflict (plan_id, feature_key) do update set
  enabled = excluded.enabled,
  limit_value = excluded.limit_value,
  updated_at = now();

insert into public.feature_flags (key, name, category, badge, preview_payload)
values (
  'inventory_management',
  'Quan ly kho hang',
  'operations',
  'PRO',
  '{"route":"/dashboard/inventory","summary":"Quan ly nguyen lieu, dinh luong mon, ton kho va food cost."}'::jsonb
)
on conflict (key) do update set
  name = excluded.name,
  category = excluded.category,
  badge = excluded.badge,
  preview_payload = excluded.preview_payload,
  updated_at = now();

with plans as (
  select id, code
  from public.subscription_plans
  where code in ('pro', 'premium')
),
flag as (
  select id
  from public.feature_flags
  where key = 'inventory_management'
)
insert into public.plan_entitlements (
  plan_id,
  feature_flag_id,
  feature_key,
  access_mode,
  quota_dimension,
  limit_value,
  trial_limit,
  reset_window,
  config,
  metadata
)
select
  plans.id,
  flag.id,
  'inventory_management',
  'active'::public.entitlement_access_mode,
  null::public.quota_dimension,
  null,
  null,
  null::public.quota_window,
  '{}'::jsonb,
  '{}'::jsonb
from plans
cross join flag
on conflict (plan_id, feature_key) do update set
  feature_flag_id = excluded.feature_flag_id,
  access_mode = excluded.access_mode,
  limit_value = excluded.limit_value,
  updated_at = now();

update public.users
set permissions = (
  select jsonb_agg(distinct permission)
  from jsonb_array_elements_text(
    permissions || '["inventory.view","inventory.manage"]'::jsonb
  ) as permission
)
where role = 'ADMIN';
