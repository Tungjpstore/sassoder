-- Real admin data foundation: store settings, table metadata, and promotions.

alter table public.restaurants
  add column if not exists contact_email text,
  add column if not exists hotline text,
  add column if not exists address text,
  add column if not exists description text,
  add column if not exists logo_url text,
  add column if not exists opening_time time,
  add column if not exists closing_time time,
  add column if not exists brand_primary text,
  add column if not exists brand_accent text,
  add column if not exists allow_legacy_qr boolean not null default true;

alter table public.restaurants
  drop constraint if exists restaurants_hotline_format,
  add constraint restaurants_hotline_format
    check (hotline is null or hotline ~ '^[0-9+() .-]{6,24}$');

alter table public.restaurants
  drop constraint if exists restaurants_brand_primary_format,
  add constraint restaurants_brand_primary_format
    check (brand_primary is null or brand_primary ~ '^#[0-9A-Fa-f]{6}$');

alter table public.restaurants
  drop constraint if exists restaurants_brand_accent_format,
  add constraint restaurants_brand_accent_format
    check (brand_accent is null or brand_accent ~ '^#[0-9A-Fa-f]{6}$');

alter table public.tables
  add column if not exists area text not null default 'Khu chính',
  add column if not exists capacity integer not null default 4,
  add column if not exists qr_enabled boolean not null default true;

alter table public.tables
  drop constraint if exists tables_capacity_range,
  add constraint tables_capacity_range check (capacity >= 1 and capacity <= 50);

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  code text not null,
  discount_type text not null default 'PERCENT',
  discount_value integer not null check (discount_value > 0),
  min_order_amount integer not null default 0 check (min_order_amount >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  channels text[] not null default array['IN_STORE', 'QR_MENU']::text[],
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint promotions_discount_type_check check (discount_type in ('PERCENT', 'FIXED')),
  constraint promotions_code_format check (code ~ '^[A-Z0-9_-]{3,32}$'),
  constraint promotions_date_range check (starts_at is null or ends_at is null or starts_at <= ends_at),
  unique (restaurant_id, code)
);

create index if not exists promotions_restaurant_status_idx
  on public.promotions (restaurant_id, is_active, starts_at desc, created_at desc);

alter table public.promotions enable row level security;

drop policy if exists "users can read own restaurant promotions" on public.promotions;
create policy "users can read own restaurant promotions"
on public.promotions for select
using (restaurant_id = public.current_restaurant_id());

drop policy if exists "admins can manage own restaurant promotions" on public.promotions;
create policy "admins can manage own restaurant promotions"
on public.promotions for all
using (
  restaurant_id = public.current_restaurant_id()
  and public.current_user_role() = 'ADMIN'
)
with check (
  restaurant_id = public.current_restaurant_id()
  and public.current_user_role() = 'ADMIN'
);
