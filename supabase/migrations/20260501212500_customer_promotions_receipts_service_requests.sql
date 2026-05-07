-- Customer-facing upgrades: real promotion application, receipt data, and staff call requests.

alter table public.restaurants
  add column if not exists show_promotions_on_menu boolean not null default true;

alter table public.promotions
  add column if not exists show_on_customer_menu boolean not null default true;

update public.promotions
set discount_value = 100
where discount_type = 'PERCENT'
  and discount_value > 100;

alter table public.promotions
  drop constraint if exists promotions_percent_range,
  add constraint promotions_percent_range
    check (discount_type <> 'PERCENT' or discount_value between 1 and 100);

alter table public.orders
  add column if not exists subtotal integer,
  add column if not exists discount_amount integer not null default 0,
  add column if not exists promotion_id uuid references public.promotions(id) on delete set null,
  add column if not exists promotion_code text;

update public.orders
set subtotal = total + coalesce(discount_amount, 0)
where subtotal is null;

alter table public.orders
  alter column subtotal set not null,
  drop constraint if exists orders_discount_amount_range,
  add constraint orders_discount_amount_range check (discount_amount >= 0 and discount_amount <= subtotal),
  drop constraint if exists orders_total_matches_discount,
  add constraint orders_total_matches_discount check (total = subtotal - discount_amount),
  drop constraint if exists orders_promotion_code_format,
  add constraint orders_promotion_code_format check (promotion_code is null or promotion_code ~ '^[A-Z0-9_-]{3,32}$');

create index if not exists orders_restaurant_promotion_created_idx
  on public.orders (restaurant_id, promotion_id, created_at desc)
  where promotion_id is not null;

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id uuid references public.tables(id) on delete set null,
  customer_session_id text,
  type text not null default 'CALL_STAFF',
  status text not null default 'open',
  message text,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  constraint service_requests_type_check check (type in ('CALL_STAFF')),
  constraint service_requests_status_check check (status in ('open', 'acknowledged', 'resolved', 'cancelled')),
  constraint service_requests_customer_session_id_format
    check (customer_session_id is null or customer_session_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
);

create index if not exists service_requests_restaurant_status_created_idx
  on public.service_requests (restaurant_id, status, created_at desc);

create index if not exists service_requests_restaurant_table_created_idx
  on public.service_requests (restaurant_id, table_id, created_at desc);

alter table public.service_requests enable row level security;

drop policy if exists "staff can read own service requests" on public.service_requests;
create policy "staff can read own service requests"
on public.service_requests for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

drop policy if exists "staff can update own service requests" on public.service_requests;
create policy "staff can update own service requests"
on public.service_requests for update
to authenticated
using (restaurant_id = public.current_restaurant_id())
with check (restaurant_id = public.current_restaurant_id());
