-- QR Restaurant SaaS Supabase schema
-- Run this in Supabase SQL Editor before deploying the app.

create extension if not exists "pgcrypto";
create extension if not exists btree_gist;

create type public.user_role as enum ('ADMIN', 'STAFF');
create type public.business_type as enum ('CAFE', 'RESTAURANT', 'FAST_FOOD', 'BAR', 'OTHER');
create type public.order_status as enum (
  'pending',
  'ordering',
  'waiting_payment',
  'waiting_confirm',
  'paid',
  'completed',
  'cancelled'
);
create type public.payment_method as enum ('QR', 'CASH');
create type public.table_bill_status as enum ('open', 'waiting_payment', 'waiting_confirm', 'paid', 'cancelled');
create type public.payment_log_status as enum ('pending', 'waiting_confirm', 'confirmed', 'failed', 'cancelled');

create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  business_type public.business_type,
  table_count integer check (table_count is null or (table_count >= 1 and table_count <= 300)),
  bank_code text,
  bank_account text,
  bank_account_name text,
  contact_email text,
  hotline text,
  address text,
  description text,
  logo_url text,
  opening_time time,
  closing_time time,
  brand_primary text,
  brand_accent text,
  allow_legacy_qr boolean not null default true,
  online_ordering_enabled boolean not null default false,
  pickup_enabled boolean not null default true,
  delivery_enabled boolean not null default false,
  store_lat double precision,
  store_lng double precision,
  delivery_radius_km numeric(6,2) not null default 5,
  free_delivery_radius_km numeric(6,2) not null default 0,
  delivery_base_fee integer not null default 0,
  delivery_fee_per_km integer not null default 0,
  min_order_for_delivery integer not null default 0,
  pickup_eta_minutes integer not null default 15,
  delivery_eta_minutes integer not null default 45,
  online_payment_mode text not null default 'PAY_AFTER',
  delivery_tracking_enabled boolean not null default true,
  notify_new_order boolean not null default true,
  notify_payment_waiting boolean not null default true,
  receipt_footer text,
  receipt_show_qr boolean not null default true,
  show_promotions_on_menu boolean not null default true,
  reservations_enabled boolean not null default false,
  reservation_deposit_enabled boolean not null default false,
  reservation_deposit_type text not null default 'FIXED',
  reservation_deposit_value integer not null default 0,
  reservation_hold_minutes integer not null default 10,
  reservation_duration_minutes integer not null default 90,
  reservation_buffer_minutes integer not null default 15,
  reservation_min_notice_minutes integer not null default 30,
  reservation_max_days_ahead integer not null default 30,
  reservation_arrival_grace_minutes integer not null default 15,
  created_at timestamptz not null default now(),
  constraint restaurants_slug_format check (slug ~ '^[a-z0-9-]+$'),
  constraint restaurants_bank_code_format check (bank_code is null or bank_code ~ '^[A-Z0-9]{2,20}$'),
  constraint restaurants_bank_account_format check (bank_account is null or bank_account ~ '^[0-9]{4,32}$'),
  constraint restaurants_hotline_format check (hotline is null or hotline ~ '^[0-9+() .-]{6,24}$'),
  constraint restaurants_brand_primary_format check (brand_primary is null or brand_primary ~ '^#[0-9A-Fa-f]{6}$'),
  constraint restaurants_brand_accent_format check (brand_accent is null or brand_accent ~ '^#[0-9A-Fa-f]{6}$'),
  constraint restaurants_store_lat_range check (store_lat is null or (store_lat >= -90 and store_lat <= 90)),
  constraint restaurants_store_lng_range check (store_lng is null or (store_lng >= -180 and store_lng <= 180)),
  constraint restaurants_delivery_radius_range check (delivery_radius_km >= 0 and delivery_radius_km <= 200),
  constraint restaurants_free_delivery_radius_range check (free_delivery_radius_km >= 0 and free_delivery_radius_km <= delivery_radius_km),
  constraint restaurants_delivery_fee_range check (
    delivery_base_fee >= 0
    and delivery_fee_per_km >= 0
    and min_order_for_delivery >= 0
    and pickup_eta_minutes between 1 and 240
    and delivery_eta_minutes between 1 and 240
  ),
  constraint restaurants_online_payment_mode_check check (online_payment_mode in ('PAY_AFTER', 'QR_PREPAID')),
  constraint restaurants_reservation_deposit_type_check check (reservation_deposit_type in ('FIXED', 'PER_PERSON')),
  constraint restaurants_reservation_settings_range check (
    reservation_deposit_value >= 0
    and reservation_hold_minutes between 1 and 1440
    and reservation_duration_minutes between 15 and 480
    and reservation_buffer_minutes between 0 and 240
    and reservation_min_notice_minutes between 0 and 10080
    and reservation_max_days_ahead between 1 and 365
    and reservation_arrival_grace_minutes between 0 and 240
  )
);

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role public.user_role not null default 'STAFF',
  restaurant_id uuid not null references public.restaurants(id) on delete cascade
);

create table public.tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  area text not null default 'Khu chính',
  capacity integer not null default 4 check (capacity >= 1 and capacity <= 50),
  qr_enabled boolean not null default true,
  unique (restaurant_id, name)
);

create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  unique (restaurant_id, name)
);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id uuid not null references public.menu_categories(id) on delete cascade,
  name text not null,
  price integer not null check (price > 0),
  image_url text,
  is_available boolean not null default true,
  unique (restaurant_id, name)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id uuid references public.tables(id) on delete restrict,
  bill_id uuid,
  fulfillment_type text not null default 'DINE_IN',
  status public.order_status not null default 'pending',
  subtotal integer not null check (subtotal >= 0),
  discount_amount integer not null default 0,
  promotion_id uuid,
  promotion_code text,
  total integer not null check (total >= 0),
  payment_method public.payment_method,
  payment_status text not null default 'unpaid',
  paid_at timestamptz,
  customer_session_id text,
  customer_note text,
  customer_name text,
  customer_phone text,
  delivery_address text,
  delivery_lat double precision,
  delivery_lng double precision,
  delivery_distance_km numeric(8,2),
  delivery_fee integer not null default 0,
  delivery_status text not null default 'none',
  delivery_route_geometry jsonb,
  delivery_route_duration_minutes integer,
  delivery_tracking_updated_at timestamptz,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  served_at timestamptz,
  service_due_at timestamptz,
  constraint orders_customer_session_id_format
    check (customer_session_id is null or customer_session_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  constraint orders_fulfillment_type_check check (fulfillment_type in ('DINE_IN', 'PICKUP', 'DELIVERY')),
  constraint orders_delivery_status_check check (delivery_status in ('none', 'requested', 'accepted', 'out_for_delivery', 'delivered', 'rejected')),
  constraint orders_payment_status_check check (payment_status in ('unpaid', 'waiting_payment', 'waiting_confirm', 'paid', 'failed', 'refunded')),
  constraint orders_delivery_route_duration_check check (delivery_route_duration_minutes is null or delivery_route_duration_minutes between 0 and 1440),
  constraint orders_delivery_route_geometry_check check (
    delivery_route_geometry is null
    or (
      jsonb_typeof(delivery_route_geometry) = 'object'
      and delivery_route_geometry->>'type' = 'LineString'
      and jsonb_typeof(delivery_route_geometry->'coordinates') = 'array'
    )
  ),
  constraint orders_delivery_lat_range check (delivery_lat is null or (delivery_lat >= -90 and delivery_lat <= 90)),
  constraint orders_delivery_lng_range check (delivery_lng is null or (delivery_lng >= -180 and delivery_lng <= 180)),
  constraint orders_remote_customer_required check (
    fulfillment_type = 'DINE_IN'
    or (customer_name is not null and length(trim(customer_name)) >= 2 and customer_phone is not null and length(trim(customer_phone)) >= 6)
  ),
  constraint orders_delivery_address_required check (fulfillment_type <> 'DELIVERY' or delivery_address is not null),
  constraint orders_discount_amount_range check (discount_amount >= 0 and discount_amount <= subtotal),
  constraint orders_total_matches_discount check (total = subtotal - discount_amount),
  constraint orders_promotion_code_format check (promotion_code is null or promotion_code ~ '^[A-Z0-9_-]{3,32}$')
);

create table public.table_bills (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id uuid not null references public.tables(id) on delete restrict,
  status public.table_bill_status not null default 'open',
  total integer not null default 0 check (total >= 0),
  payment_method public.payment_method,
  customer_session_id text,
  reservation_id uuid,
  deposit_applied_amount integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  closed_at timestamptz,
  constraint table_bills_customer_session_id_format
    check (customer_session_id is null or customer_session_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
);

alter table public.orders
  add constraint orders_bill_id_fkey
  foreign key (bill_id) references public.table_bills(id) on delete set null;

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete restrict,
  quantity integer not null check (quantity > 0 and quantity <= 50),
  price integer not null check (price > 0),
  note text
);

create table public.payment_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  bill_id uuid references public.table_bills(id) on delete set null,
  method public.payment_method not null,
  status public.payment_log_status not null default 'pending',
  amount integer not null check (amount >= 0),
  raw_data jsonb,
  created_at timestamptz not null default now()
);

create table public.promotions (
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
  show_on_customer_menu boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint promotions_discount_type_check check (discount_type in ('PERCENT', 'FIXED')),
  constraint promotions_percent_range check (discount_type <> 'PERCENT' or discount_value between 1 and 100),
  constraint promotions_code_format check (code ~ '^[A-Z0-9_-]{3,32}$'),
  constraint promotions_date_range check (starts_at is null or ends_at is null or starts_at <= ends_at),
  unique (restaurant_id, code)
);

alter table public.orders
  add constraint orders_promotion_id_fkey
  foreign key (promotion_id) references public.promotions(id) on delete set null;

create table public.service_requests (
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

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  status text not null default 'holding',
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  party_size integer not null check (party_size between 1 and 100),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  hold_expires_at timestamptz,
  deposit_required_amount integer not null default 0,
  deposit_paid_amount integer not null default 0,
  deposit_status text not null default 'none',
  payment_method public.payment_method,
  customer_note text,
  internal_note text,
  source text not null default 'PUBLIC',
  access_token_hash text not null,
  idempotency_key text,
  seated_table_bill_id uuid references public.table_bills(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  seated_at timestamptz,
  cancelled_at timestamptz,
  expired_at timestamptz,
  no_show_at timestamptz,
  constraint reservations_time_range check (starts_at < ends_at),
  constraint reservations_status_check check (status in ('draft','holding','waiting_deposit_confirm','confirmed','seated','completed','cancelled','expired','no_show')),
  constraint reservations_deposit_status_check check (deposit_status in ('none','required','waiting_payment','waiting_confirm','paid','refundable','forfeited','refunded')),
  constraint reservations_deposit_amount_range check (deposit_required_amount >= 0 and deposit_paid_amount >= 0 and deposit_paid_amount <= deposit_required_amount),
  constraint reservations_customer_phone_format check (customer_phone ~ '^[0-9+() .-]{6,24}$'),
  constraint reservations_customer_email_format check (customer_email is null or customer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

create table public.reservation_table_locks (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id uuid not null references public.tables(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint reservation_table_locks_time_range check (starts_at < ends_at),
  constraint reservation_table_locks_status_check check (status in ('active','released')),
  constraint reservation_no_overlap_per_table exclude using gist (
    restaurant_id with =,
    table_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status = 'active')
);

create table public.reservation_deposit_logs (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  method public.payment_method not null default 'QR',
  status public.payment_log_status not null default 'pending',
  amount integer not null check (amount >= 0),
  raw_data jsonb,
  created_at timestamptz not null default now()
);

alter table public.table_bills
  add constraint table_bills_reservation_id_fkey
  foreign key (reservation_id) references public.reservations(id) on delete set null;

create table public.registration_intents (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  user_id uuid references auth.users(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours'),
  consumed_at timestamptz,
  constraint registration_intents_email_format check (position('@' in email) > 1)
);

create table public.report_schedules (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  enabled boolean not null default false,
  frequency text not null default 'weekly',
  recipients text[] not null default '{}'::text[],
  send_hour smallint not null default 8,
  send_day_of_week smallint not null default 1,
  send_day_of_month smallint not null default 1,
  send_month smallint not null default 1,
  timezone text not null default 'Asia/Ho_Chi_Minh',
  include_csv boolean not null default true,
  include_json boolean not null default false,
  last_sent_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_schedules_frequency_check check (frequency in ('weekly', 'monthly', 'yearly')),
  constraint report_schedules_send_hour_check check (send_hour between 0 and 23),
  constraint report_schedules_day_of_week_check check (send_day_of_week between 1 and 7),
  constraint report_schedules_day_of_month_check check (send_day_of_month between 1 and 31),
  constraint report_schedules_month_check check (send_month between 1 and 12),
  constraint report_schedules_recipients_check check (cardinality(recipients) <= 10),
  constraint report_schedules_unique_restaurant unique (restaurant_id)
);

create table public.report_send_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  schedule_id uuid references public.report_schedules(id) on delete set null,
  period_type text not null,
  period_start date not null,
  period_end date not null,
  recipient_emails text[] not null default '{}'::text[],
  status text not null,
  subject text,
  provider text,
  provider_message_id text,
  error_message text,
  raw_data jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint report_send_logs_period_type_check check (period_type in ('weekly', 'monthly', 'yearly')),
  constraint report_send_logs_status_check check (status in ('queued', 'sent', 'failed', 'skipped')),
  constraint report_send_logs_period_range check (period_start <= period_end)
);

create index restaurants_slug_idx on public.restaurants (slug);
create index users_restaurant_id_idx on public.users (restaurant_id);
create index tables_restaurant_id_idx on public.tables (restaurant_id);
create index menu_categories_restaurant_id_idx on public.menu_categories (restaurant_id);
create index menu_items_restaurant_category_idx on public.menu_items (restaurant_id, category_id);
create index table_bills_restaurant_table_status_idx on public.table_bills (restaurant_id, table_id, status, created_at desc);
create unique index table_bills_open_table_idx
  on public.table_bills (restaurant_id, table_id)
  where status = 'open';
create index orders_restaurant_status_created_idx on public.orders (restaurant_id, status, created_at desc);
create index orders_restaurant_payment_status_created_idx on public.orders (restaurant_id, payment_status, created_at desc);
create index orders_bill_id_idx on public.orders (bill_id);
create index orders_restaurant_table_created_idx on public.orders (restaurant_id, table_id, created_at desc);
create index orders_restaurant_table_status_due_idx on public.orders (restaurant_id, table_id, status, service_due_at);
create index orders_restaurant_fulfillment_created_idx on public.orders (restaurant_id, fulfillment_type, created_at desc);
create index orders_restaurant_delivery_status_created_idx
  on public.orders (restaurant_id, delivery_status, created_at desc)
  where fulfillment_type = 'DELIVERY';
create index orders_restaurant_promotion_created_idx
  on public.orders (restaurant_id, promotion_id, created_at desc)
  where promotion_id is not null;
create index orders_restaurant_remote_customer_created_idx
  on public.orders (restaurant_id, customer_phone, created_at desc)
  where fulfillment_type in ('PICKUP', 'DELIVERY') and customer_phone is not null;
create index orders_customer_session_created_idx
  on public.orders (restaurant_id, table_id, customer_session_id, created_at desc)
  where customer_session_id is not null;
create unique index orders_restaurant_table_idempotency_idx
  on public.orders (restaurant_id, table_id, idempotency_key)
  where idempotency_key is not null;
create unique index orders_restaurant_remote_idempotency_idx
  on public.orders (restaurant_id, idempotency_key)
  where table_id is null and idempotency_key is not null;
create index order_items_order_id_idx on public.order_items (order_id);
create index payment_logs_order_created_idx on public.payment_logs (order_id, created_at desc);
create index promotions_restaurant_status_idx on public.promotions (restaurant_id, is_active, starts_at desc, created_at desc);
create index service_requests_restaurant_status_created_idx
  on public.service_requests (restaurant_id, status, created_at desc);
create index service_requests_restaurant_table_created_idx
  on public.service_requests (restaurant_id, table_id, created_at desc);
create index reservations_restaurant_status_starts_idx
  on public.reservations (restaurant_id, status, starts_at desc);
create index reservations_restaurant_phone_created_idx
  on public.reservations (restaurant_id, customer_phone, created_at desc);
create unique index reservations_restaurant_idempotency_idx
  on public.reservations (restaurant_id, idempotency_key)
  where idempotency_key is not null;
create index reservation_locks_restaurant_table_time_idx
  on public.reservation_table_locks (restaurant_id, table_id, starts_at, ends_at)
  where status = 'active';
create index reservation_deposit_logs_reservation_created_idx
  on public.reservation_deposit_logs (reservation_id, created_at desc);
create index registration_intents_user_pending_idx
  on public.registration_intents (user_id, created_at desc)
  where consumed_at is null;
create index registration_intents_email_pending_idx
  on public.registration_intents (email, created_at desc)
  where consumed_at is null;
create index report_schedules_due_idx
  on public.report_schedules (enabled, next_run_at)
  where enabled = true;
create index report_schedules_restaurant_idx on public.report_schedules (restaurant_id);
create index report_send_logs_restaurant_created_idx
  on public.report_send_logs (restaurant_id, created_at desc);
create index report_send_logs_schedule_created_idx
  on public.report_send_logs (schedule_id, created_at desc);

alter table public.restaurants enable row level security;
alter table public.users enable row level security;
alter table public.tables enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.table_bills enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payment_logs enable row level security;
alter table public.promotions enable row level security;
alter table public.service_requests enable row level security;
alter table public.reservations enable row level security;
alter table public.reservation_table_locks enable row level security;
alter table public.reservation_deposit_logs enable row level security;
alter table public.registration_intents enable row level security;
alter table public.report_schedules enable row level security;
alter table public.report_send_logs enable row level security;

create or replace function public.current_restaurant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select restaurant_id
  from public.users
  where id = auth.uid()
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by case when id = auth.uid() then 0 else 1 end
  limit 1
$$;

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.users
  where id = auth.uid()
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by case when id = auth.uid() then 0 else 1 end
  limit 1
$$;

create or replace function public.get_admin_dashboard_snapshot(
  target_restaurant_id uuid,
  today_start timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with allowed_restaurant as (
    select r.*
    from public.restaurants r
    where r.id = target_restaurant_id
      and (
        auth.role() = 'service_role'
        or public.current_restaurant_id() = r.id
      )
    limit 1
  ),
  counts as (
    select
      (select count(*)::int from public.menu_items mi where mi.restaurant_id = ar.id) as menu_items,
      (select count(*)::int from public.tables t where t.restaurant_id = ar.id) as tables,
      (
        select count(*)::int
        from public.orders o
        where o.restaurant_id = ar.id
          and o.status in ('pending', 'ordering', 'completed', 'waiting_payment', 'waiting_confirm')
      ) as active_orders
    from allowed_restaurant ar
  ),
  today as (
    select
      count(o.id)::int as today_orders,
      count(o.id) filter (where o.status = 'paid' or o.payment_status = 'paid')::int as paid,
      count(o.id) filter (where o.status = 'completed')::int as completed_today,
      coalesce(sum(o.total) filter (where o.status = 'paid' or o.payment_status = 'paid'), 0)::int as today_revenue,
      coalesce(sum(o.total) filter (where (o.status = 'paid' or o.payment_status = 'paid') and o.payment_method = 'QR'), 0)::int as qr_revenue,
      coalesce(sum(o.total) filter (where (o.status = 'paid' or o.payment_status = 'paid') and o.payment_method = 'CASH'), 0)::int as cash_revenue
    from allowed_restaurant ar
    left join public.orders o
      on o.restaurant_id = ar.id
      and o.created_at >= today_start
  ),
  open_orders as (
    select
      count(o.id) filter (where o.status = 'pending')::int as pending,
      count(o.id) filter (where o.status = 'ordering')::int as ordering,
      count(o.id) filter (where o.status = 'completed')::int as completed,
      count(o.id) filter (where o.status = 'waiting_payment')::int as waiting_payment,
      count(o.id) filter (where o.status = 'waiting_confirm')::int as waiting_confirm,
      coalesce(sum(o.total), 0)::int as open_order_total
    from allowed_restaurant ar
    left join public.orders o
      on o.restaurant_id = ar.id
      and o.status in ('pending', 'ordering', 'completed', 'waiting_payment', 'waiting_confirm')
  ),
  recent as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', latest.id,
          'status', latest.status,
          'total', latest.total,
          'paymentMethod', latest.payment_method,
          'createdAt', latest.created_at,
          'tableName', latest.table_name
        )
        order by latest.created_at desc
      ),
      '[]'::jsonb
    ) as recent_orders
    from (
      select
        o.id,
        o.status,
        o.total,
        o.payment_method,
        o.created_at,
        case
          when o.fulfillment_type = 'DELIVERY' then 'Giao hàng'
          when o.fulfillment_type = 'PICKUP' then 'Đến lấy'
          else coalesce(t.name, 'Không rõ bàn')
        end as table_name
      from allowed_restaurant ar
      join public.orders o on o.restaurant_id = ar.id
      left join public.tables t on t.id = o.table_id
      order by o.created_at desc
      limit 6
    ) latest
  )
  select jsonb_build_object(
    'dashboard', jsonb_build_object(
      'restaurant', to_jsonb(ar),
      'menuItems', coalesce(c.menu_items, 0),
      'tables', coalesce(c.tables, 0),
      'activeOrders', coalesce(c.active_orders, 0)
    ),
    'operations', jsonb_build_object(
      'pending', coalesce(o.pending, 0),
      'ordering', coalesce(o.ordering, 0),
      'completed', coalesce(o.completed, 0),
      'waitingPayment', coalesce(o.waiting_payment, 0),
      'waitingConfirm', coalesce(o.waiting_confirm, 0),
      'paid', coalesce(td.paid, 0),
      'completedToday', coalesce(td.completed_today, 0),
      'todayOrders', coalesce(td.today_orders, 0),
      'todayRevenue', coalesce(td.today_revenue, 0),
      'qrRevenue', coalesce(td.qr_revenue, 0),
      'cashRevenue', coalesce(td.cash_revenue, 0),
      'averageTicket',
        case
          when coalesce(td.paid, 0) > 0 then round(td.today_revenue::numeric / td.paid)::int
          else 0
        end,
      'openOrderTotal', coalesce(o.open_order_total, 0),
      'recentOrders', coalesce(r.recent_orders, '[]'::jsonb)
    )
  )
  from allowed_restaurant ar
  cross join counts c
  cross join today td
  cross join open_orders o
  cross join recent r;
$$;

revoke all on function public.get_admin_dashboard_snapshot(uuid, timestamptz) from public;
grant execute on function public.get_admin_dashboard_snapshot(uuid, timestamptz) to authenticated, service_role;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

drop trigger if exists table_bills_set_updated_at on public.table_bills;

create trigger table_bills_set_updated_at
before update on public.table_bills
for each row execute function public.set_updated_at();

create trigger report_schedules_set_updated_at
before update on public.report_schedules
for each row execute function public.set_updated_at();

create trigger reservations_set_updated_at
before update on public.reservations
for each row execute function public.set_updated_at();

create or replace function public.recalculate_table_bill_total(target_bill_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.table_bills
  set total = coalesce((
    select sum(total)
    from public.orders
    where bill_id = target_bill_id
      and status <> 'cancelled'
  ), 0)
  where id = target_bill_id;
end;
$$;

create or replace function public.sync_table_bill_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.bill_id is not null then
      perform public.recalculate_table_bill_total(old.bill_id);
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.bill_id is not null and old.bill_id is distinct from new.bill_id then
    perform public.recalculate_table_bill_total(old.bill_id);
  end if;

  if new.bill_id is not null then
    perform public.recalculate_table_bill_total(new.bill_id);
  end if;

  return new;
end;
$$;

create trigger orders_sync_table_bill_total
after insert or update of bill_id, total, status or delete on public.orders
for each row execute function public.sync_table_bill_total();

create policy "authenticated can read own restaurant"
on public.restaurants for select
to authenticated
using (id = public.current_restaurant_id());

create policy "staff can update own restaurant"
on public.restaurants for update
to authenticated
using (id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN')
with check (id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN');

create policy "users can read own restaurant users"
on public.users for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

create policy "admins can manage own restaurant users"
on public.users for all
to authenticated
using (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN')
with check (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN');

create policy "users can read own tables"
on public.tables for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

create policy "admins can mutate own tables"
on public.tables for all
to authenticated
using (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN')
with check (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN');

create policy "users can read own menu categories"
on public.menu_categories for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

create policy "admins can mutate own menu categories"
on public.menu_categories for all
to authenticated
using (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN')
with check (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN');

create policy "users can read own menu items"
on public.menu_items for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

create policy "admins can mutate own menu items"
on public.menu_items for all
to authenticated
using (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN')
with check (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN');

create policy "staff can read own table bills"
on public.table_bills for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

create policy "staff can update own table bills"
on public.table_bills for update
to authenticated
using (restaurant_id = public.current_restaurant_id())
with check (restaurant_id = public.current_restaurant_id());

create policy "staff can read own restaurant orders"
on public.orders for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

create policy "staff can update own restaurant orders"
on public.orders for update
to authenticated
using (restaurant_id = public.current_restaurant_id())
with check (restaurant_id = public.current_restaurant_id());

create policy "staff can read own order items"
on public.order_items for select
to authenticated
using (
  exists (
    select 1 from public.orders
    where orders.id = order_items.order_id
      and orders.restaurant_id = public.current_restaurant_id()
  )
);

create policy "staff can read own payment logs"
on public.payment_logs for select
to authenticated
using (
  exists (
    select 1 from public.orders
    where orders.id = payment_logs.order_id
      and orders.restaurant_id = public.current_restaurant_id()
  )
);

create policy "staff can insert own payment logs"
on public.payment_logs for insert
to authenticated
with check (
  exists (
    select 1 from public.orders
    where orders.id = payment_logs.order_id
      and orders.restaurant_id = public.current_restaurant_id()
  )
);

create policy "users can read own restaurant promotions"
on public.promotions for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

create policy "admins can manage own restaurant promotions"
on public.promotions for all
to authenticated
using (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN')
with check (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN');

create policy "staff can read own service requests"
on public.service_requests for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

create policy "staff can update own service requests"
on public.service_requests for update
to authenticated
using (restaurant_id = public.current_restaurant_id())
with check (restaurant_id = public.current_restaurant_id());

create policy "staff can read own reservations"
on public.reservations for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

create policy "staff can update own reservations"
on public.reservations for update
to authenticated
using (restaurant_id = public.current_restaurant_id())
with check (restaurant_id = public.current_restaurant_id());

create policy "staff can read own reservation locks"
on public.reservation_table_locks for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

create policy "staff can read own reservation deposits"
on public.reservation_deposit_logs for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

create policy "admins can manage own report schedules"
on public.report_schedules for all
to authenticated
using (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN')
with check (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN');

create policy "staff can read own report logs"
on public.report_send_logs for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-images',
  'menu-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "public can read menu images"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'menu-images');

create policy "staff can upload own restaurant menu images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'menu-images'
  and (storage.foldername(name))[1] = public.current_restaurant_id()::text
);

create policy "staff can update own restaurant menu images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'menu-images'
  and (storage.foldername(name))[1] = public.current_restaurant_id()::text
)
with check (
  bucket_id = 'menu-images'
  and (storage.foldername(name))[1] = public.current_restaurant_id()::text
);

create policy "staff can delete own restaurant menu images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'menu-images'
  and (storage.foldername(name))[1] = public.current_restaurant_id()::text
);

alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_items;
alter publication supabase_realtime add table public.payment_logs;
alter publication supabase_realtime add table public.reservations;

create policy "anon can receive customer order broadcasts"
on realtime.messages
for select
to anon
using (topic like 'customer-order:%');

create or replace function public.broadcast_customer_order_status()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'status', new.status,
      'payment_status', new.payment_status,
      'payment_method', new.payment_method,
      'paid_at', new.paid_at,
      'delivery_status', new.delivery_status,
      'delivery_distance_km', new.delivery_distance_km,
      'delivery_fee', new.delivery_fee,
      'delivery_route_duration_minutes', new.delivery_route_duration_minutes,
      'delivery_tracking_updated_at', new.delivery_tracking_updated_at,
      'total', new.total,
      'updated_at', new.updated_at
    ),
    'order_status',
    'customer-order:' || new.id::text,
    false
  );

  return null;
end;
$$;

create trigger orders_customer_status_broadcast
after insert or update of status, total, payment_method, payment_status, paid_at, delivery_status, delivery_distance_km, delivery_fee, delivery_route_duration_minutes, delivery_tracking_updated_at, updated_at on public.orders
for each row execute function public.broadcast_customer_order_status();

create or replace function public.touch_order_for_realtime()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders
  set status = status
  where id = coalesce(new.order_id, old.order_id);
  return coalesce(new, old);
end;
$$;

create trigger order_items_realtime_touch
after insert or update or delete on public.order_items
for each row execute function public.touch_order_for_realtime();

create trigger payment_logs_realtime_touch
after insert or update or delete on public.payment_logs
for each row execute function public.touch_order_for_realtime();
