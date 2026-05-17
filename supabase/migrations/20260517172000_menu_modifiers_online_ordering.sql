-- Menu modifiers for online ordering: size, sugar/ice levels, toppings and combo add-ons.

create table if not exists public.menu_modifier_groups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  name text not null,
  is_required boolean not null default false,
  min_select integer not null default 0,
  max_select integer,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_modifier_groups_select_range check (
    min_select >= 0
    and (max_select is null or max_select >= min_select)
  )
);

create table if not exists public.menu_modifier_options (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  group_id uuid not null references public.menu_modifier_groups(id) on delete cascade,
  name text not null,
  price_delta integer not null default 0,
  is_available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_modifier_options_price_delta_range check (price_delta >= 0)
);

alter table public.order_items
  add column if not exists base_price integer,
  add column if not exists modifier_total integer not null default 0,
  add column if not exists modifier_snapshot jsonb not null default '[]'::jsonb;

create or replace function public.set_order_item_modifier_defaults()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.base_price := coalesce(new.base_price, new.price);
  new.modifier_total := coalesce(new.modifier_total, 0);
  new.modifier_snapshot := coalesce(new.modifier_snapshot, '[]'::jsonb);
  return new;
end;
$$;

drop trigger if exists order_items_modifier_defaults on public.order_items;
create trigger order_items_modifier_defaults
before insert or update of price, base_price, modifier_total, modifier_snapshot on public.order_items
for each row execute function public.set_order_item_modifier_defaults();

update public.order_items
set base_price = price
where base_price is null;

alter table public.order_items
  alter column base_price set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'order_items_base_price_positive'
  ) then
    alter table public.order_items
      add constraint order_items_base_price_positive check (base_price > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'order_items_modifier_total_range'
  ) then
    alter table public.order_items
      add constraint order_items_modifier_total_range check (modifier_total >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'order_items_modifier_snapshot_array'
  ) then
    alter table public.order_items
      add constraint order_items_modifier_snapshot_array check (jsonb_typeof(modifier_snapshot) = 'array');
  end if;
end $$;

create index if not exists menu_modifier_groups_item_idx
  on public.menu_modifier_groups (menu_item_id, is_active, sort_order);

create index if not exists menu_modifier_groups_restaurant_idx
  on public.menu_modifier_groups (restaurant_id, is_active);

create index if not exists menu_modifier_options_group_idx
  on public.menu_modifier_options (group_id, is_available, sort_order);

alter table public.menu_modifier_groups enable row level security;
alter table public.menu_modifier_options enable row level security;

drop policy if exists "users can read own menu modifier groups" on public.menu_modifier_groups;
create policy "users can read own menu modifier groups"
on public.menu_modifier_groups for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

drop policy if exists "admins can manage own menu modifier groups" on public.menu_modifier_groups;
create policy "admins can manage own menu modifier groups"
on public.menu_modifier_groups for all
to authenticated
using (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN')
with check (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN');

drop policy if exists "users can read own menu modifier options" on public.menu_modifier_options;
create policy "users can read own menu modifier options"
on public.menu_modifier_options for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

drop policy if exists "admins can manage own menu modifier options" on public.menu_modifier_options;
create policy "admins can manage own menu modifier options"
on public.menu_modifier_options for all
to authenticated
using (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN')
with check (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN');
