-- QR Restaurant SaaS Supabase schema
-- Run this in Supabase SQL Editor before deploying the app.

create schema if not exists extensions;
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated, service_role;

create extension if not exists "pgcrypto";
create extension if not exists btree_gist;
create extension if not exists postgis with schema extensions;

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
create type public.payment_log_status as enum ('pending', 'waiting_confirm', 'confirmed', 'failed', 'cancelled', 'refunded');

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
  store_geog extensions.geography(Point, 4326) generated always as (
    case
      when store_lat is not null and store_lng is not null then
        extensions.ST_SetSRID(extensions.ST_MakePoint(store_lng, store_lat), 4326)::extensions.geography
      else null
    end
  ) stored,
  delivery_radius_km numeric(6,2) not null default 5,
  free_delivery_radius_km numeric(6,2) not null default 0,
  delivery_base_fee integer not null default 0,
  delivery_fee_per_km integer not null default 0,
  min_order_for_delivery integer not null default 0,
  pickup_eta_minutes integer not null default 15,
  delivery_eta_minutes integer not null default 45,
  online_payment_mode text not null default 'PAY_AFTER',
  delivery_tracking_enabled boolean not null default true,
  map_provider text not null default 'maplibre',
  map_geocoding_provider text not null default 'nominatim',
  map_routing_provider text not null default 'osrm',
  map_default_zoom integer not null default 14,
  map_display_style text not null default 'LIGHT',
  show_store_marker_on_ordering boolean not null default true,
  show_customer_distance boolean not null default true,
  delivery_area_mode text not null default 'RADIUS',
  delivery_area_name text,
  delivery_area_note text,
  delivery_area_polygon jsonb not null default '[]'::jsonb,
  delivery_area_ward_count integer not null default 0,
  delivery_exclusion_zones jsonb not null default '[]'::jsonb,
  delivery_fee_enabled boolean not null default true,
  delivery_fee_tiers jsonb not null default '[]'::jsonb,
  service_fee_enabled boolean not null default false,
  service_fee_type text not null default 'ORDER_PERCENT',
  service_fee_percent numeric(5,2) not null default 0,
  service_fee_min integer not null default 0,
  service_fee_max integer,
  allow_outside_delivery_area boolean not null default false,
  show_delivery_eta boolean not null default true,
  require_outside_area_confirmation boolean not null default true,
  auto_suggest_nearest_branch boolean not null default true,
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
  constraint restaurants_map_provider_check check (map_provider in ('maplibre', 'mapbox')),
  constraint restaurants_map_geocoding_provider_check check (map_geocoding_provider in ('nominatim', 'mapbox', 'vietmap', 'goong')),
  constraint restaurants_map_routing_provider_check check (map_routing_provider in ('osrm', 'mapbox', 'vietmap', 'goong')),
  constraint restaurants_map_display_style_check check (map_display_style in ('LIGHT', 'DARK')),
  constraint restaurants_map_default_zoom_range check (map_default_zoom between 8 and 18),
  constraint restaurants_delivery_area_mode_check check (delivery_area_mode in ('RADIUS', 'CUSTOM')),
  constraint restaurants_delivery_area_json_check check (
    jsonb_typeof(delivery_area_polygon) = 'array'
    and jsonb_typeof(delivery_exclusion_zones) = 'array'
    and jsonb_typeof(delivery_fee_tiers) = 'array'
  ),
  constraint restaurants_delivery_area_ward_count_range check (delivery_area_ward_count >= 0),
  constraint restaurants_service_fee_check check (
    service_fee_type in ('ORDER_PERCENT')
    and service_fee_percent >= 0
    and service_fee_percent <= 100
    and service_fee_min >= 0
    and (service_fee_max is null or service_fee_max >= service_fee_min)
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
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_title text not null default 'Phục vụ',
  permission_profile text not null default 'service',
  permissions jsonb not null default '["dashboard.view","orders.manage","tables.manage","reservations.manage"]'::jsonb,
  constraint users_permission_profile_check check (
    permission_profile in ('manager', 'cashier', 'kitchen', 'service', 'delivery', 'viewer')
  ),
  constraint users_permissions_array_check check (jsonb_typeof(permissions) = 'array')
);

create table public.table_areas (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  floor_label text not null default 'Tầng trệt',
  seating_zone text not null default 'indoor',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, name),
  constraint table_areas_seating_zone_check check (seating_zone in ('indoor', 'outdoor', 'mixed')),
  constraint table_areas_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create table public.tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid,
  name text not null,
  area text not null default 'Khu chính',
  capacity integer not null default 4 check (capacity >= 1 and capacity <= 50),
  qr_enabled boolean not null default true,
  table_area_id uuid references public.table_areas(id) on delete set null,
  floor_label text not null default 'Tầng trệt',
  seating_zone text not null default 'indoor',
  table_kind text not null default 'standard',
  reservation_priority integer not null default 100,
  is_bookable boolean not null default true,
  is_hidden boolean not null default false,
  is_under_maintenance boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  qr_token_version integer not null default 1,
  qr_token_enforced boolean not null default false,
  qr_token_rotated_at timestamptz,
  constraint tables_qr_token_version_positive check (qr_token_version >= 1),
  constraint tables_reservation_metadata_check check (
    seating_zone in ('indoor', 'outdoor', 'mixed')
    and table_kind in ('standard', 'vip', 'bar', 'community')
    and reservation_priority between 1 and 999
    and jsonb_typeof(metadata) = 'object'
  ),
  unique (restaurant_id, name)
);

create table public.store_branches (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  address text not null,
  latitude double precision not null,
  longitude double precision not null,
  location_geog extensions.geography(Point, 4326) generated always as (
    extensions.ST_SetSRID(extensions.ST_MakePoint(longitude, latitude), 4326)::extensions.geography
  ) stored,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  delivery_radius_km numeric(6,2) not null default 5,
  free_delivery_radius_km numeric(6,2) not null default 0,
  delivery_base_fee integer not null default 15000,
  delivery_fee_per_km integer not null default 5000,
  pickup_eta_minutes integer not null default 15,
  delivery_eta_minutes integer not null default 45,
  accepting_delivery boolean not null default true,
  delivery_paused boolean not null default false,
  temporarily_closed boolean not null default false,
  delivery_opening_time time,
  delivery_closing_time time,
  delivery_availability_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_branches_latitude_range check (latitude between -90 and 90),
  constraint store_branches_longitude_range check (longitude between -180 and 180),
  constraint store_branches_delivery_radius_range check (delivery_radius_km >= 0 and delivery_radius_km <= 200),
  constraint store_branches_free_delivery_radius_range check (free_delivery_radius_km >= 0 and free_delivery_radius_km <= delivery_radius_km),
  constraint store_branches_delivery_fee_range check (
    delivery_base_fee >= 0
    and delivery_fee_per_km >= 0
    and pickup_eta_minutes between 1 and 240
    and delivery_eta_minutes between 1 and 240
  ),
  unique (restaurant_id, name)
);

alter table public.tables
  add constraint tables_branch_id_fkey foreign key (branch_id) references public.store_branches(id) on delete set null;

create table public.delivery_couriers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  phone text,
  status text not null default 'offline',
  metadata jsonb not null default '{}'::jsonb,
  last_location_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_couriers_status_check check (status in ('offline', 'available', 'assigned', 'busy', 'paused')),
  constraint delivery_couriers_phone_format check (phone is null or phone ~ '^[0-9+() .-]{6,24}$'),
  constraint delivery_couriers_metadata_object_check check (jsonb_typeof(metadata) = 'object')
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

create table public.menu_modifier_groups (
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

create table public.menu_modifier_options (
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

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id uuid references public.tables(id) on delete restrict,
  bill_id uuid,
  branch_id uuid references public.store_branches(id) on delete set null,
  branch_assignment_source text,
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
  service_fee integer not null default 0,
  delivery_status text not null default 'none',
  delivery_route_geometry jsonb,
  delivery_route_duration_minutes integer,
  delivery_route_provider text,
  delivery_route_confidence text,
  delivery_quote_version text,
  delivery_quote_snapshot jsonb,
  delivery_tracking_updated_at timestamptz,
  delivery_courier_id uuid references public.delivery_couriers(id) on delete set null,
  delivery_assigned_at timestamptz,
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
  constraint orders_delivery_route_provider_check check (
    delivery_route_provider is null
    or delivery_route_provider in ('goong', 'vietmap', 'osrm', 'mapbox', 'haversine')
  ),
  constraint orders_delivery_route_confidence_check check (
    delivery_route_confidence is null
    or delivery_route_confidence in ('high', 'medium', 'low')
  ),
  constraint orders_delivery_quote_snapshot_check check (
    delivery_quote_snapshot is null
    or jsonb_typeof(delivery_quote_snapshot) = 'object'
  ),
  constraint orders_delivery_lat_range check (delivery_lat is null or (delivery_lat >= -90 and delivery_lat <= 90)),
  constraint orders_delivery_lng_range check (delivery_lng is null or (delivery_lng >= -180 and delivery_lng <= 180)),
  constraint orders_service_fee_range check (service_fee >= 0),
  constraint orders_remote_customer_required check (
    fulfillment_type = 'DINE_IN'
    or (customer_name is not null and length(trim(customer_name)) >= 2 and customer_phone is not null and length(trim(customer_phone)) >= 6)
  ),
  constraint orders_delivery_address_required check (fulfillment_type <> 'DELIVERY' or delivery_address is not null),
  constraint orders_discount_amount_range check (discount_amount >= 0 and discount_amount <= subtotal),
  constraint orders_total_matches_discount check (total = subtotal - discount_amount),
  constraint orders_branch_assignment_source_check check (
    branch_assignment_source is null
    or branch_assignment_source in ('delivery_quote', 'single_branch', 'primary_branch', 'manual', 'legacy_backfill')
  ),
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
  base_price integer not null check (base_price > 0),
  modifier_total integer not null default 0 check (modifier_total >= 0),
  modifier_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(modifier_snapshot) = 'array'),
  note text,
  prepared_at timestamptz
);

create table public.payment_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  bill_id uuid references public.table_bills(id) on delete set null,
  method public.payment_method not null,
  status public.payment_log_status not null default 'pending',
  amount integer not null check (amount >= 0),
  transition_key text,
  raw_data jsonb,
  created_at timestamptz not null default now()
);

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  code text not null,
  discount_scope text not null default 'ORDER',
  discount_type text not null default 'PERCENT',
  discount_value integer not null check (discount_value > 0),
  min_order_amount integer not null default 0 check (min_order_amount >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  channels text[] not null default array['IN_STORE', 'QR_MENU']::text[],
  show_on_customer_menu boolean not null default true,
  total_usage_limit integer,
  per_customer_usage_limit integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint promotions_discount_scope_check check (discount_scope in ('ORDER', 'DELIVERY_FEE')),
  constraint promotions_discount_type_check check (discount_type in ('PERCENT', 'FIXED')),
  constraint promotions_percent_range check (discount_type <> 'PERCENT' or discount_value between 1 and 100),
  constraint promotions_total_usage_limit_check check (total_usage_limit is null or total_usage_limit > 0),
  constraint promotions_per_customer_usage_limit_check check (per_customer_usage_limit is null or per_customer_usage_limit > 0),
  constraint promotions_code_format check (code ~ '^[A-Z0-9_-]{3,32}$'),
  constraint promotions_date_range check (starts_at is null or ends_at is null or starts_at <= ends_at),
  unique (restaurant_id, code)
);

create table public.ingredient_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ingredient_categories_name_length check (length(trim(name)) between 1 and 120),
  constraint ingredient_categories_unique unique (restaurant_id, name)
);

create table public.ingredients (
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

create table public.menu_item_recipes (
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

create table public.inventory_movements (
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

create table public.inventory_counts (
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

create table public.inventory_count_lines (
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
  preferred_table_area_id uuid references public.table_areas(id) on delete set null,
  preferred_seating_zone text,
  preferred_table_kind text,
  source text not null default 'PUBLIC',
  access_token_hash text not null,
  idempotency_key text,
  seated_table_bill_id uuid references public.table_bills(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  checked_in_at timestamptz,
  seated_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  rejected_at timestamptz,
  expired_at timestamptz,
  no_show_at timestamptz,
  constraint reservations_time_range check (starts_at < ends_at),
  constraint reservations_status_check check (status in ('draft','pending','holding','waiting_deposit_confirm','confirmed','checked_in','seated','completed','cancelled','rejected','expired','no_show')),
  constraint reservations_deposit_status_check check (deposit_status in ('none','required','waiting_payment','waiting_confirm','paid','refundable','forfeited','refunded')),
  constraint reservations_deposit_amount_range check (deposit_required_amount >= 0 and deposit_paid_amount >= 0 and deposit_paid_amount <= deposit_required_amount),
  constraint reservations_customer_phone_format check (customer_phone ~ '^[0-9+() .-]{6,24}$'),
  constraint reservations_customer_email_format check (customer_email is null or customer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint reservations_preferred_seating_zone_check check (preferred_seating_zone is null or preferred_seating_zone in ('indoor','outdoor','mixed')),
  constraint reservations_preferred_table_kind_check check (preferred_table_kind is null or preferred_table_kind in ('standard','vip','bar','community'))
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

create table public.reservation_status_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_type text not null default 'system',
  actor_user_id uuid references public.users(id) on delete set null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint reservation_status_logs_status_check check (
    (from_status is null or from_status in ('draft','pending','holding','waiting_deposit_confirm','confirmed','checked_in','seated','completed','cancelled','rejected','expired','no_show'))
    and to_status in ('draft','pending','holding','waiting_deposit_confirm','confirmed','checked_in','seated','completed','cancelled','rejected','expired','no_show')
  ),
  constraint reservation_status_logs_actor_type_check check (actor_type in ('customer', 'merchant', 'staff', 'system')),
  constraint reservation_status_logs_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create table public.reservation_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  audience text not null default 'customer',
  channel text not null default 'in_app',
  status text not null default 'queued',
  title text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  constraint reservation_notification_outbox_audience_check check (audience in ('customer','merchant','staff')),
  constraint reservation_notification_outbox_channel_check check (channel in ('in_app','sms','zalo','email','webhook')),
  constraint reservation_notification_outbox_status_check check (status in ('queued','sent','failed','skipped')),
  constraint reservation_notification_outbox_payload_object_check check (jsonb_typeof(payload) = 'object'),
  constraint reservation_notification_outbox_dedupe_key_format check (dedupe_key is null or dedupe_key ~ '^[a-z0-9_:-]{6,160}$')
);

create table public.occupancy_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id uuid references public.tables(id) on delete set null,
  table_bill_id uuid references public.table_bills(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete set null,
  event_type text not null,
  party_size integer,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint occupancy_logs_event_type_check check (
    event_type in ('reservation_created', 'reservation_cancelled', 'reservation_no_show', 'reservation_checked_in', 'reservation_seated', 'reservation_completed', 'table_released')
  ),
  constraint occupancy_logs_party_size_check check (party_size is null or party_size between 1 and 100),
  constraint occupancy_logs_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create table public.reservation_deposit_logs (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  method public.payment_method not null default 'QR',
  status public.payment_log_status not null default 'pending',
  amount integer not null check (amount >= 0),
  transition_key text,
  raw_data jsonb,
  created_at timestamptz not null default now()
);

create table public.reservation_customer_risk_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete set null,
  customer_phone text not null,
  customer_name text,
  event_type text not null,
  severity text not null default 'watch',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint reservation_customer_risk_events_event_type_check check (
    event_type in ('no_show','deposit_forfeited','refund_due','refund_completed','deposit_cancelled')
  ),
  constraint reservation_customer_risk_events_severity_check check (severity in ('watch','risk','blocked')),
  constraint reservation_customer_risk_events_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

alter table public.table_bills
  add constraint table_bills_reservation_id_fkey
  foreign key (reservation_id) references public.reservations(id) on delete set null;

create or replace function public.enforce_restaurant_scoped_table_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.tables t
    where t.id = new.table_id
      and t.restaurant_id = new.restaurant_id
  ) then
    raise foreign_key_violation
      using message = 'table assignment must belong to the same restaurant',
            constraint = 'restaurant_scoped_table_assignment';
  end if;

  if new.reservation_id is not null
    and not exists (
      select 1
      from public.reservations r
      where r.id = new.reservation_id
        and r.restaurant_id = new.restaurant_id
    )
  then
    raise foreign_key_violation
      using message = 'reservation assignment must belong to the same restaurant',
            constraint = 'restaurant_scoped_reservation_assignment';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_restaurant_scoped_table_assignment() from public, anon, authenticated;

create trigger reservation_table_locks_enforce_restaurant_scope
before insert or update of restaurant_id, table_id, reservation_id
on public.reservation_table_locks
for each row execute function public.enforce_restaurant_scoped_table_assignment();

create trigger table_bills_enforce_restaurant_scope
before insert or update of restaurant_id, table_id, reservation_id
on public.table_bills
for each row execute function public.enforce_restaurant_scoped_table_assignment();

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

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  customer_session_id text,
  surface text not null,
  title text,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_conversations_surface_check check (surface in ('dashboard', 'customer', 'admin')),
  constraint ai_conversations_status_check check (status in ('active', 'archived', 'deleted')),
  constraint ai_conversations_actor_scope_check check (
    (surface = 'customer' and customer_session_id is not null and btrim(customer_session_id) <> '')
    or (surface in ('dashboard', 'admin') and user_id is not null)
  )
);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  role text not null,
  content text not null,
  provider text,
  model text,
  token_count integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ai_messages_role_check check (role in ('system', 'user', 'assistant', 'tool'))
);

create table public.ai_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  conversation_id uuid references public.ai_conversations(id) on delete set null,
  surface text not null,
  task_type text not null,
  provider text,
  model text,
  status text not null default 'success',
  latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ai_logs_surface_check check (surface in ('dashboard', 'customer', 'admin', 'system')),
  constraint ai_logs_status_check check (status in ('success', 'failed', 'blocked', 'fallback'))
);

create table public.ai_feedback (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  conversation_id uuid references public.ai_conversations(id) on delete set null,
  message_id uuid references public.ai_messages(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  customer_session_id text,
  rating integer,
  label text,
  comment text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ai_feedback_rating_check check (rating is null or rating between 1 and 5),
  constraint ai_feedback_label_check check (label is null or label in ('helpful', 'wrong', 'unsafe', 'too_long', 'bad_action', 'other'))
);

create table public.ai_owner_agent_approval_tokens (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  token_nonce text not null,
  token_hash text not null,
  domain text not null,
  command text not null,
  message_hash text not null,
  status text not null default 'pending',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_owner_agent_approval_tokens_status_check check (status in ('pending', 'consumed', 'expired')),
  constraint ai_owner_agent_approval_tokens_nonce_unique unique (token_nonce),
  constraint ai_owner_agent_approval_tokens_hash_unique unique (token_hash)
);

create table public.ai_security_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  customer_session_id text,
  surface text not null,
  event_type text not null,
  severity text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ai_security_events_surface_check check (surface in ('owner', 'customer', 'dashboard', 'admin', 'system')),
  constraint ai_security_events_severity_check check (severity in ('low', 'medium', 'high', 'critical')),
  constraint ai_security_events_metadata_object check (jsonb_typeof(metadata) = 'object')
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

create table public.map_provider_request_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete set null,
  restaurant_slug text,
  source text,
  operation text not null,
  provider text not null,
  outcome text not null,
  status_code integer,
  latency_ms integer not null default 0,
  estimated_cost_vnd numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  constraint map_provider_request_logs_operation_check
    check (operation in ('geocode', 'reverse', 'route')),
  constraint map_provider_request_logs_provider_check
    check (provider in ('goong', 'vietmap', 'mapbox', 'nominatim', 'osrm')),
  constraint map_provider_request_logs_outcome_check
    check (outcome in ('success', 'http_error', 'timeout', 'error', 'empty')),
  constraint map_provider_request_logs_latency_check
    check (latency_ms >= 0)
);

create table public.map_cache_event_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete set null,
  restaurant_slug text,
  source text,
  operation text not null,
  namespace text not null,
  hit boolean not null,
  created_at timestamptz not null default now(),
  constraint map_cache_event_logs_operation_check
    check (operation in ('geocode', 'reverse', 'route', 'delivery_quote'))
);

create table public.delivery_quote_metric_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete set null,
  restaurant_slug text not null,
  accepted boolean not null,
  provider text not null,
  route_provider text,
  confidence text,
  is_estimated boolean,
  distance_km numeric(8,2),
  fee integer,
  latency_ms integer not null default 0,
  created_at timestamptz not null default now(),
  constraint delivery_quote_metric_logs_provider_check
    check (provider in ('goong', 'vietmap', 'mapbox', 'nominatim', 'osrm', 'manual', 'browser-location+haversine')),
  constraint delivery_quote_metric_logs_route_provider_check
    check (route_provider is null or route_provider in ('goong', 'vietmap', 'mapbox', 'osrm', 'haversine')),
  constraint delivery_quote_metric_logs_confidence_check
    check (confidence is null or confidence in ('high', 'medium', 'low')),
  constraint delivery_quote_metric_logs_latency_check
    check (latency_ms >= 0)
);

create table public.courier_locations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  courier_id uuid references public.delivery_couriers(id) on delete set null,
  order_id uuid references public.orders(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  location_geog extensions.geography(Point, 4326)
    generated always as (extensions.ST_SetSRID(extensions.ST_MakePoint(longitude, latitude), 4326)::extensions.geography) stored,
  accuracy_meters numeric(8,2),
  heading_degrees numeric(6,2),
  speed_mps numeric(8,2),
  source text not null default 'admin_dashboard',
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint courier_locations_latitude_range check (latitude between -90 and 90),
  constraint courier_locations_longitude_range check (longitude between -180 and 180),
  constraint courier_locations_accuracy_range check (accuracy_meters is null or accuracy_meters between 0 and 5000),
  constraint courier_locations_heading_range check (heading_degrees is null or (heading_degrees >= 0 and heading_degrees < 360)),
  constraint courier_locations_speed_range check (speed_mps is null or speed_mps >= 0),
  constraint courier_locations_source_check check (source in ('admin_dashboard', 'driver_app', 'manual', 'system')),
  constraint courier_locations_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create table public.delivery_tracking_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  courier_id uuid references public.delivery_couriers(id) on delete set null,
  event_type text not null,
  delivery_status text,
  latitude double precision,
  longitude double precision,
  location_geog extensions.geography(Point, 4326)
    generated always as (
      case
        when latitude is not null and longitude is not null then
          extensions.ST_SetSRID(extensions.ST_MakePoint(longitude, latitude), 4326)::extensions.geography
        else null
      end
    ) stored,
  accuracy_meters numeric(8,2),
  heading_degrees numeric(6,2),
  speed_mps numeric(8,2),
  source text not null default 'admin_dashboard',
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint delivery_tracking_events_type_check check (event_type in ('status_changed', 'location_ping', 'assigned', 'unassigned', 'eta_adjusted', 'handoff_note')),
  constraint delivery_tracking_events_status_check check (delivery_status is null or delivery_status in ('requested', 'accepted', 'out_for_delivery', 'delivered', 'rejected')),
  constraint delivery_tracking_events_latitude_range check (latitude is null or latitude between -90 and 90),
  constraint delivery_tracking_events_longitude_range check (longitude is null or longitude between -180 and 180),
  constraint delivery_tracking_events_coordinate_pair_check check ((latitude is null and longitude is null) or (latitude is not null and longitude is not null)),
  constraint delivery_tracking_events_accuracy_range check (accuracy_meters is null or accuracy_meters between 0 and 5000),
  constraint delivery_tracking_events_heading_range check (heading_degrees is null or (heading_degrees >= 0 and heading_degrees < 360)),
  constraint delivery_tracking_events_speed_range check (speed_mps is null or speed_mps >= 0),
  constraint delivery_tracking_events_source_check check (source in ('admin_dashboard', 'driver_app', 'manual', 'system')),
  constraint delivery_tracking_events_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create index restaurants_slug_idx on public.restaurants (slug);
create index restaurants_delivery_coords_idx on public.restaurants (store_lat, store_lng);
create index restaurants_store_geog_gist_idx
  on public.restaurants
  using gist (store_geog)
  where store_geog is not null;
create index restaurants_map_provider_idx on public.restaurants (map_provider, map_geocoding_provider, map_routing_provider);
create index users_restaurant_id_idx on public.users (restaurant_id);
create index users_permission_profile_idx on public.users (restaurant_id, permission_profile);
create index users_lower_email_idx on public.users (lower(email));
create index table_areas_restaurant_sort_idx on public.table_areas (restaurant_id, is_active, sort_order, name);
create index tables_restaurant_id_idx on public.tables (restaurant_id);
create index tables_restaurant_branch_idx
  on public.tables (restaurant_id, branch_id, name)
  where branch_id is not null;
create index tables_restaurant_qr_enforced_idx on public.tables (restaurant_id, qr_token_enforced, qr_enabled);
create index tables_restaurant_bookable_idx
  on public.tables (restaurant_id, is_bookable, is_hidden, is_under_maintenance, capacity, reservation_priority, name);
create index tables_restaurant_area_floor_idx
  on public.tables (restaurant_id, table_area_id, floor_label, seating_zone);
create index store_branches_restaurant_active_idx on public.store_branches (restaurant_id, is_active, is_primary desc);
create index store_branches_coordinates_idx on public.store_branches (latitude, longitude);
create index store_branches_location_geog_gist_idx
  on public.store_branches
  using gist (location_geog)
  where is_active = true;
create index menu_categories_restaurant_id_idx on public.menu_categories (restaurant_id);
create index menu_items_restaurant_category_idx on public.menu_items (restaurant_id, category_id);
create index menu_modifier_groups_item_idx on public.menu_modifier_groups (menu_item_id, is_active, sort_order);
create index menu_modifier_groups_restaurant_idx on public.menu_modifier_groups (restaurant_id, is_active);
create index menu_modifier_options_group_idx on public.menu_modifier_options (group_id, is_available, sort_order);
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
create index orders_restaurant_branch_created_idx
  on public.orders (restaurant_id, branch_id, created_at desc)
  where branch_id is not null;
create index orders_restaurant_branch_status_created_idx
  on public.orders (restaurant_id, branch_id, status, created_at desc)
  where branch_id is not null;
create index orders_restaurant_delivery_status_created_idx
  on public.orders (restaurant_id, delivery_status, created_at desc)
  where fulfillment_type = 'DELIVERY';
create index orders_delivery_route_provider_idx
  on public.orders (restaurant_id, delivery_route_provider)
  where delivery_route_provider is not null;
create index orders_delivery_quote_version_idx
  on public.orders (restaurant_id, delivery_quote_version)
  where delivery_quote_version is not null;
create index orders_restaurant_delivery_courier_idx
  on public.orders (restaurant_id, delivery_courier_id, delivery_status, created_at desc)
  where fulfillment_type = 'DELIVERY' and delivery_courier_id is not null;
create index orders_restaurant_unassigned_delivery_idx
  on public.orders (restaurant_id, created_at desc)
  where fulfillment_type = 'DELIVERY'
    and delivery_courier_id is null
    and delivery_status in ('requested', 'accepted', 'out_for_delivery');
create index orders_restaurant_promotion_created_idx
  on public.orders (restaurant_id, promotion_id, created_at desc)
  where promotion_id is not null;
create index orders_restaurant_promotion_customer_idx
  on public.orders (restaurant_id, promotion_id, customer_session_id, created_at desc)
  where promotion_id is not null and status <> 'cancelled';
create index orders_restaurant_remote_customer_created_idx
  on public.orders (restaurant_id, customer_phone, created_at desc)
  where fulfillment_type in ('PICKUP', 'DELIVERY') and customer_phone is not null;
create index orders_customer_session_created_idx
  on public.orders (restaurant_id, table_id, customer_session_id, created_at desc)
  where customer_session_id is not null;
create index map_provider_request_logs_restaurant_created_idx
  on public.map_provider_request_logs (restaurant_id, created_at desc);
create index map_provider_request_logs_provider_created_idx
  on public.map_provider_request_logs (provider, operation, created_at desc);
create index map_cache_event_logs_restaurant_created_idx
  on public.map_cache_event_logs (restaurant_id, created_at desc);
create index delivery_quote_metric_logs_restaurant_created_idx
  on public.delivery_quote_metric_logs (restaurant_id, created_at desc);
create index delivery_quote_metric_logs_slug_created_idx
  on public.delivery_quote_metric_logs (restaurant_slug, created_at desc);
create index delivery_couriers_restaurant_status_idx
  on public.delivery_couriers (restaurant_id, status, updated_at desc);
create unique index delivery_couriers_restaurant_phone_idx
  on public.delivery_couriers (restaurant_id, phone)
  where phone is not null;
create index courier_locations_restaurant_order_captured_idx
  on public.courier_locations (restaurant_id, order_id, captured_at desc)
  where order_id is not null;
create index courier_locations_courier_captured_idx
  on public.courier_locations (courier_id, captured_at desc)
  where courier_id is not null;
create index courier_locations_geog_gist_idx
  on public.courier_locations
  using gist (location_geog);
create index delivery_tracking_events_order_created_idx
  on public.delivery_tracking_events (order_id, created_at desc);
create index delivery_tracking_events_restaurant_created_idx
  on public.delivery_tracking_events (restaurant_id, created_at desc);
create index delivery_tracking_events_geog_gist_idx
  on public.delivery_tracking_events
  using gist (location_geog)
  where location_geog is not null;
create unique index orders_restaurant_table_idempotency_idx
  on public.orders (restaurant_id, table_id, idempotency_key)
  where idempotency_key is not null;
create unique index orders_restaurant_remote_idempotency_idx
  on public.orders (restaurant_id, idempotency_key)
  where table_id is null and idempotency_key is not null;
create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_prepared_at_idx on public.order_items (order_id, prepared_at);
create index payment_logs_order_created_idx on public.payment_logs (order_id, created_at desc);
create unique index payment_logs_transition_key_idx
  on public.payment_logs (transition_key)
  where transition_key is not null;
create index promotions_restaurant_status_idx on public.promotions (restaurant_id, is_active, starts_at desc, created_at desc);
create index ingredient_categories_restaurant_idx on public.ingredient_categories (restaurant_id, name);
create index ingredients_restaurant_active_idx on public.ingredients (restaurant_id, is_active, name);
create index ingredients_restaurant_low_stock_idx
  on public.ingredients (restaurant_id, on_hand_quantity, minimum_quantity)
  where is_active = true;
create index menu_item_recipes_restaurant_menu_idx on public.menu_item_recipes (restaurant_id, menu_item_id);
create index menu_item_recipes_restaurant_ingredient_idx on public.menu_item_recipes (restaurant_id, ingredient_id);
create index inventory_movements_restaurant_created_idx on public.inventory_movements (restaurant_id, created_at desc);
create index inventory_movements_ingredient_created_idx on public.inventory_movements (ingredient_id, created_at desc);
create unique index inventory_movements_order_deduction_unique_idx
  on public.inventory_movements (restaurant_id, source_id, ingredient_id, movement_type)
  where source_type = 'order' and movement_type = 'deduct_sale' and source_id is not null;
create unique index inventory_movements_order_rollback_unique_idx
  on public.inventory_movements (restaurant_id, source_id, ingredient_id, movement_type)
  where source_type = 'order' and movement_type = 'rollback' and source_id is not null;
create index inventory_counts_restaurant_status_idx on public.inventory_counts (restaurant_id, status, created_at desc);
create index inventory_count_lines_count_idx on public.inventory_count_lines (count_id);
create index service_requests_restaurant_status_created_idx
  on public.service_requests (restaurant_id, status, created_at desc);
create index service_requests_restaurant_table_created_idx
  on public.service_requests (restaurant_id, table_id, created_at desc);
create index reservations_restaurant_status_starts_idx
  on public.reservations (restaurant_id, status, starts_at desc);
create index reservations_restaurant_phone_created_idx
  on public.reservations (restaurant_id, customer_phone, created_at desc);
create index reservations_restaurant_checked_in_idx
  on public.reservations (restaurant_id, status, checked_in_at desc)
  where checked_in_at is not null;
create index reservations_restaurant_preference_idx
  on public.reservations (restaurant_id, preferred_table_area_id, preferred_seating_zone, preferred_table_kind, starts_at desc);
create unique index reservations_restaurant_idempotency_idx
  on public.reservations (restaurant_id, idempotency_key)
  where idempotency_key is not null;
create index reservation_locks_restaurant_table_time_idx
  on public.reservation_table_locks (restaurant_id, table_id, starts_at, ends_at)
  where status = 'active';
create index reservation_status_logs_reservation_created_idx
  on public.reservation_status_logs (reservation_id, created_at desc);
create index reservation_status_logs_restaurant_created_idx
  on public.reservation_status_logs (restaurant_id, created_at desc);
create index reservation_notification_outbox_due_idx
  on public.reservation_notification_outbox (status, scheduled_at, created_at)
  where status = 'queued';
create index reservation_notification_outbox_reservation_idx
  on public.reservation_notification_outbox (reservation_id, created_at desc);
create unique index reservation_notification_outbox_dedupe_idx
  on public.reservation_notification_outbox (restaurant_id, dedupe_key);
create index occupancy_logs_restaurant_table_time_idx
  on public.occupancy_logs (restaurant_id, table_id, occurred_at desc);
create index occupancy_logs_reservation_time_idx
  on public.occupancy_logs (reservation_id, occurred_at desc)
  where reservation_id is not null;
create index reservation_deposit_logs_reservation_created_idx
  on public.reservation_deposit_logs (reservation_id, created_at desc);
create unique index reservation_deposit_logs_transition_key_idx
  on public.reservation_deposit_logs (transition_key)
  where transition_key is not null;
create index reservation_customer_risk_events_phone_idx
  on public.reservation_customer_risk_events (restaurant_id, customer_phone, created_at desc);
create index reservation_customer_risk_events_reservation_idx
  on public.reservation_customer_risk_events (reservation_id, created_at desc);
create index registration_intents_user_pending_idx
  on public.registration_intents (user_id, created_at desc)
  where consumed_at is null;
create index registration_intents_email_pending_idx
  on public.registration_intents (email, created_at desc)
  where consumed_at is null;
create index ai_conversations_restaurant_surface_idx
  on public.ai_conversations (restaurant_id, surface, updated_at desc);
create index ai_conversations_customer_session_idx
  on public.ai_conversations (restaurant_id, customer_session_id, updated_at desc)
  where customer_session_id is not null;
create index ai_conversations_user_surface_thread_idx
  on public.ai_conversations (restaurant_id, user_id, surface, updated_at desc)
  where user_id is not null;
create index ai_conversations_customer_surface_thread_idx
  on public.ai_conversations (restaurant_id, customer_session_id, surface, updated_at desc)
  where customer_session_id is not null;
create index ai_messages_conversation_idx
  on public.ai_messages (conversation_id, created_at asc);
create index ai_messages_restaurant_created_idx
  on public.ai_messages (restaurant_id, created_at desc);
create index ai_logs_restaurant_task_idx
  on public.ai_logs (restaurant_id, task_type, created_at desc);
create index ai_feedback_restaurant_created_idx
  on public.ai_feedback (restaurant_id, created_at desc);
create index ai_owner_agent_approval_tokens_scope_idx
  on public.ai_owner_agent_approval_tokens (restaurant_id, user_id, domain, command, status, expires_at desc);
create index ai_security_events_restaurant_created_idx
  on public.ai_security_events (restaurant_id, created_at desc);
create index ai_security_events_type_severity_idx
  on public.ai_security_events (event_type, severity, created_at desc);
create index report_schedules_due_idx
  on public.report_schedules (enabled, next_run_at)
  where enabled = true;
create index report_schedules_restaurant_idx on public.report_schedules (restaurant_id);
create index report_send_logs_restaurant_created_idx
  on public.report_send_logs (restaurant_id, created_at desc);
create index report_send_logs_schedule_created_idx
  on public.report_send_logs (schedule_id, created_at desc);

create or replace function public.find_nearest_delivery_stores(
  p_restaurant_slug text,
  p_lat double precision,
  p_lng double precision,
  p_limit integer default 4,
  p_max_radius_km double precision default 50
)
returns table (
  id uuid,
  restaurant_id uuid,
  name text,
  address text,
  latitude double precision,
  longitude double precision,
  is_primary boolean,
  source text,
  delivery_radius_km numeric,
  free_delivery_radius_km numeric,
  delivery_base_fee integer,
  delivery_fee_per_km integer,
  pickup_eta_minutes integer,
  delivery_eta_minutes integer,
  metadata jsonb,
  approx_distance_km double precision
)
language sql
stable
set search_path = ''
as $$
  with input as (
    select
      extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography as destination,
      least(greatest(coalesce(p_limit, 4), 1), 20) as row_limit,
      greatest(coalesce(p_max_radius_km, 50), 0) * 1000 as max_radius_m
    where p_restaurant_slug is not null
      and p_restaurant_slug <> ''
      and p_lat between -90 and 90
      and p_lng between -180 and 180
  ),
  target_restaurant as (
    select r.*
    from public.restaurants r
    where r.slug = p_restaurant_slug
    limit 1
  ),
  candidates as (
    select
      r.id,
      r.id as restaurant_id,
      r.name,
      r.address,
      r.store_lat as latitude,
      r.store_lng as longitude,
      true as is_primary,
      'primary'::text as source,
      r.delivery_radius_km,
      r.free_delivery_radius_km,
      r.delivery_base_fee,
      r.delivery_fee_per_km,
      r.pickup_eta_minutes,
      r.delivery_eta_minutes,
      '{}'::jsonb as metadata,
      r.store_geog as geog
    from target_restaurant r
    where r.store_geog is not null

    union all

    select
      b.id,
      b.restaurant_id,
      b.name,
      b.address,
      b.latitude,
      b.longitude,
      b.is_primary,
      'branch'::text as source,
      b.delivery_radius_km,
      b.free_delivery_radius_km,
      b.delivery_base_fee,
      b.delivery_fee_per_km,
      b.pickup_eta_minutes,
      b.delivery_eta_minutes,
      b.metadata,
      b.location_geog as geog
    from public.store_branches b
    join target_restaurant r on r.id = b.restaurant_id
    where b.is_active = true
      and b.location_geog is not null
  )
  select
    c.id,
    c.restaurant_id,
    c.name,
    c.address,
    c.latitude,
    c.longitude,
    c.is_primary,
    c.source,
    c.delivery_radius_km,
    c.free_delivery_radius_km,
    c.delivery_base_fee,
    c.delivery_fee_per_km,
    c.pickup_eta_minutes,
    c.delivery_eta_minutes,
    c.metadata,
    round((extensions.ST_Distance(c.geog, input.destination) / 1000)::numeric, 3)::double precision as approx_distance_km
  from candidates c
  cross join input
  where input.max_radius_m = 0
    or extensions.ST_DWithin(c.geog, input.destination, input.max_radius_m)
  order by c.geog operator(extensions.<->) input.destination, c.is_primary desc
  limit (select row_limit from input);
$$;

comment on function public.find_nearest_delivery_stores(text, double precision, double precision, integer, double precision)
  is 'Server-side PostGIS prefilter for delivery quote branch routing. Backend routes only the nearest candidates through Goong/Mapbox.';

revoke all on function public.find_nearest_delivery_stores(text, double precision, double precision, integer, double precision) from public;
revoke all on function public.find_nearest_delivery_stores(text, double precision, double precision, integer, double precision) from anon;
revoke all on function public.find_nearest_delivery_stores(text, double precision, double precision, integer, double precision) from authenticated;
grant execute on function public.find_nearest_delivery_stores(text, double precision, double precision, integer, double precision) to service_role;

alter table public.restaurants enable row level security;
alter table public.users enable row level security;
alter table public.table_areas enable row level security;
alter table public.tables enable row level security;
alter table public.store_branches enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.menu_modifier_groups enable row level security;
alter table public.menu_modifier_options enable row level security;
alter table public.table_bills enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payment_logs enable row level security;
alter table public.promotions enable row level security;
alter table public.ingredient_categories enable row level security;
alter table public.ingredients enable row level security;
alter table public.menu_item_recipes enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_counts enable row level security;
alter table public.inventory_count_lines enable row level security;
alter table public.service_requests enable row level security;
alter table public.reservations enable row level security;
alter table public.reservation_table_locks enable row level security;
alter table public.reservation_status_logs enable row level security;
alter table public.reservation_notification_outbox enable row level security;
alter table public.occupancy_logs enable row level security;
alter table public.reservation_deposit_logs enable row level security;
alter table public.reservation_customer_risk_events enable row level security;
alter table public.registration_intents enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_logs enable row level security;
alter table public.ai_feedback enable row level security;
alter table public.ai_owner_agent_approval_tokens enable row level security;
alter table public.ai_security_events enable row level security;
alter table public.report_schedules enable row level security;
alter table public.report_send_logs enable row level security;
alter table public.map_provider_request_logs enable row level security;
alter table public.map_cache_event_logs enable row level security;
alter table public.delivery_quote_metric_logs enable row level security;
alter table public.delivery_couriers enable row level security;
alter table public.courier_locations enable row level security;
alter table public.delivery_tracking_events enable row level security;

revoke all on public.ai_conversations from anon;
revoke all on public.ai_messages from anon;
revoke all on public.ai_logs from anon;
revoke all on public.ai_feedback from anon;
revoke all on public.ai_owner_agent_approval_tokens from anon;
revoke all on public.ai_owner_agent_approval_tokens from authenticated;
revoke all on public.ai_security_events from anon;
revoke all on public.ai_security_events from authenticated;

grant select, insert, update on public.ai_conversations to authenticated;
grant select, insert on public.ai_messages to authenticated;
grant select, insert on public.ai_logs to authenticated;
grant select, insert on public.ai_feedback to authenticated;
grant select, insert, update, delete on public.ai_owner_agent_approval_tokens to service_role;
grant select, insert, update, delete on public.ai_security_events to service_role;

create or replace function app_private.current_restaurant_id()
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

create or replace function app_private.current_user_role()
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

revoke all on function app_private.current_restaurant_id() from public, anon;
revoke all on function app_private.current_user_role() from public, anon;
grant execute on function app_private.current_restaurant_id() to authenticated, service_role;
grant execute on function app_private.current_user_role() to authenticated, service_role;

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
        or app_private.current_restaurant_id() = r.id
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

create trigger table_areas_set_updated_at
before update on public.table_areas
for each row execute function public.set_updated_at();

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

create trigger ingredient_categories_set_updated_at
before update on public.ingredient_categories
for each row execute function public.set_updated_at();

create trigger ingredients_set_updated_at
before update on public.ingredients
for each row execute function public.set_updated_at();

create trigger menu_item_recipes_set_updated_at
before update on public.menu_item_recipes
for each row execute function public.set_updated_at();

create trigger inventory_counts_set_updated_at
before update on public.inventory_counts
for each row execute function public.set_updated_at();

create trigger inventory_count_lines_set_updated_at
before update on public.inventory_count_lines
for each row execute function public.set_updated_at();

create trigger ai_conversations_set_updated_at
before update on public.ai_conversations
for each row execute function public.set_updated_at();

create trigger ai_owner_agent_approval_tokens_set_updated_at
before update on public.ai_owner_agent_approval_tokens
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
  if target_restaurant_id <> app_private.current_restaurant_id() then
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

create or replace function public.enforce_promotion_usage_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_limit integer;
  v_customer_limit integer;
  v_total_used integer;
  v_customer_used integer;
begin
  if new.promotion_id is null or new.status = 'cancelled' then
    return new;
  end if;

  select total_usage_limit, per_customer_usage_limit
  into v_total_limit, v_customer_limit
  from public.promotions
  where id = new.promotion_id
    and restaurant_id = new.restaurant_id
  for update;

  if not found then
    return new;
  end if;

  if v_total_limit is not null then
    select count(*)::integer
    into v_total_used
    from public.orders
    where restaurant_id = new.restaurant_id
      and promotion_id = new.promotion_id
      and status <> 'cancelled'
      and id <> new.id;

    if v_total_used >= v_total_limit then
      raise exception 'Mã khuyến mãi đã hết lượt sử dụng.' using errcode = 'P0001';
    end if;
  end if;

  if v_customer_limit is not null and new.customer_session_id is not null then
    select count(*)::integer
    into v_customer_used
    from public.orders
    where restaurant_id = new.restaurant_id
      and promotion_id = new.promotion_id
      and customer_session_id = new.customer_session_id
      and status <> 'cancelled'
      and id <> new.id;

    if v_customer_used >= v_customer_limit then
      raise exception 'Khách này đã dùng hết lượt cho mã khuyến mãi.' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

create trigger orders_promotion_usage_limits
before insert or update of promotion_id, customer_session_id, status on public.orders
for each row execute function public.enforce_promotion_usage_limits();

create or replace function public.touch_delivery_courier_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger delivery_couriers_touch_updated_at
before update on public.delivery_couriers
for each row execute function public.touch_delivery_courier_updated_at();

create policy "authenticated can read own restaurant"
on public.restaurants for select
to authenticated
using (id = app_private.current_restaurant_id());

create policy "staff can update own restaurant"
on public.restaurants for update
to authenticated
using (id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

create policy "users can read own restaurant users"
on public.users for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "admins can manage own restaurant users"
on public.users for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

create policy "users can read own table areas"
on public.table_areas for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "admins can manage own table areas"
on public.table_areas for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

create policy "users can read own tables"
on public.tables for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "admins can mutate own tables"
on public.tables for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

create policy "users can read own store branches"
on public.store_branches for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "admins can mutate own store branches"
on public.store_branches for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

create policy "users can read own delivery couriers"
on public.delivery_couriers for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "admins can mutate own delivery couriers"
on public.delivery_couriers for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

create policy "users can read own courier locations"
on public.courier_locations for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "users can insert own courier locations"
on public.courier_locations for insert
to authenticated
with check (restaurant_id = app_private.current_restaurant_id());

create policy "users can read own delivery tracking events"
on public.delivery_tracking_events for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "users can insert own delivery tracking events"
on public.delivery_tracking_events for insert
to authenticated
with check (restaurant_id = app_private.current_restaurant_id());

create policy "users can read own menu categories"
on public.menu_categories for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "admins can mutate own menu categories"
on public.menu_categories for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

create policy "users can read own menu items"
on public.menu_items for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "admins can mutate own menu items"
on public.menu_items for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

create policy "users can read own menu modifier groups"
on public.menu_modifier_groups for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "admins can manage own menu modifier groups"
on public.menu_modifier_groups for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

create policy "users can read own menu modifier options"
on public.menu_modifier_options for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "admins can manage own menu modifier options"
on public.menu_modifier_options for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

create policy "staff can read own table bills"
on public.table_bills for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "staff can update own table bills"
on public.table_bills for update
to authenticated
using (restaurant_id = app_private.current_restaurant_id())
with check (restaurant_id = app_private.current_restaurant_id());

create policy "staff can read own restaurant orders"
on public.orders for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "staff can update own restaurant orders"
on public.orders for update
to authenticated
using (restaurant_id = app_private.current_restaurant_id())
with check (restaurant_id = app_private.current_restaurant_id());

create policy "staff can read own order items"
on public.order_items for select
to authenticated
using (
  exists (
    select 1 from public.orders
    where orders.id = order_items.order_id
      and orders.restaurant_id = app_private.current_restaurant_id()
  )
);

create policy "staff can read own payment logs"
on public.payment_logs for select
to authenticated
using (
  exists (
    select 1 from public.orders
    where orders.id = payment_logs.order_id
      and orders.restaurant_id = app_private.current_restaurant_id()
  )
);

create policy "staff can insert own payment logs"
on public.payment_logs for insert
to authenticated
with check (
  exists (
    select 1 from public.orders
    where orders.id = payment_logs.order_id
      and orders.restaurant_id = app_private.current_restaurant_id()
  )
);

create policy "users can read own restaurant promotions"
on public.promotions for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "admins can manage own restaurant promotions"
on public.promotions for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

create policy "staff can read own ingredient categories"
on public.ingredient_categories for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "admins can manage own ingredient categories"
on public.ingredient_categories for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

create policy "staff can read own ingredients"
on public.ingredients for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "admins can manage own ingredients"
on public.ingredients for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

create policy "staff can read own menu recipes"
on public.menu_item_recipes for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "admins can manage own menu recipes"
on public.menu_item_recipes for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

create policy "staff can read own inventory movements"
on public.inventory_movements for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "admins can create own inventory movements"
on public.inventory_movements for insert
to authenticated
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

create policy "staff can read own inventory counts"
on public.inventory_counts for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "admins can manage own inventory counts"
on public.inventory_counts for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

create policy "staff can read own inventory count lines"
on public.inventory_count_lines for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "admins can manage own inventory count lines"
on public.inventory_count_lines for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

create policy "staff can read own service requests"
on public.service_requests for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "staff can update own service requests"
on public.service_requests for update
to authenticated
using (restaurant_id = app_private.current_restaurant_id())
with check (restaurant_id = app_private.current_restaurant_id());

create policy "staff can read own reservations"
on public.reservations for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "staff can update own reservations"
on public.reservations for update
to authenticated
using (restaurant_id = app_private.current_restaurant_id())
with check (restaurant_id = app_private.current_restaurant_id());

create policy "staff can read own reservation locks"
on public.reservation_table_locks for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "staff can read own reservation status logs"
on public.reservation_status_logs for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "staff can read own reservation notification outbox"
on public.reservation_notification_outbox for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "staff can read own occupancy logs"
on public.occupancy_logs for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "staff can read own reservation deposits"
on public.reservation_deposit_logs for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "staff can read own reservation customer risk events"
on public.reservation_customer_risk_events for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "restaurant users read own ai conversations"
on public.ai_conversations for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "restaurant users insert own ai conversations"
on public.ai_conversations for insert
to authenticated
with check (restaurant_id = app_private.current_restaurant_id());

create policy "restaurant users update own ai conversations"
on public.ai_conversations for update
to authenticated
using (restaurant_id = app_private.current_restaurant_id())
with check (restaurant_id = app_private.current_restaurant_id());

create policy "restaurant users read own ai messages"
on public.ai_messages for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "restaurant users insert own ai messages"
on public.ai_messages for insert
to authenticated
with check (
  restaurant_id = app_private.current_restaurant_id()
  and exists (
    select 1
    from public.ai_conversations
    where ai_conversations.id = ai_messages.conversation_id
      and ai_conversations.restaurant_id = ai_messages.restaurant_id
  )
);

create policy "restaurant users read own ai logs"
on public.ai_logs for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "restaurant users insert own ai logs"
on public.ai_logs for insert
to authenticated
with check (restaurant_id = app_private.current_restaurant_id());

create policy "restaurant users read own ai feedback"
on public.ai_feedback for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "restaurant users insert own ai feedback"
on public.ai_feedback for insert
to authenticated
with check (restaurant_id = app_private.current_restaurant_id());

create policy "admins can manage own report schedules"
on public.report_schedules for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

create policy "staff can read own report logs"
on public.report_send_logs for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

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
  and (storage.foldername(name))[1] = app_private.current_restaurant_id()::text
);

create policy "staff can update own restaurant menu images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'menu-images'
  and (storage.foldername(name))[1] = app_private.current_restaurant_id()::text
)
with check (
  bucket_id = 'menu-images'
  and (storage.foldername(name))[1] = app_private.current_restaurant_id()::text
);

create policy "staff can delete own restaurant menu images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'menu-images'
  and (storage.foldername(name))[1] = app_private.current_restaurant_id()::text
);

alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_items;
alter publication supabase_realtime add table public.payment_logs;
alter publication supabase_realtime add table public.reservations;
alter publication supabase_realtime add table public.reservation_table_locks;
alter publication supabase_realtime add table public.tables;
alter publication supabase_realtime add table public.table_bills;
alter publication supabase_realtime add table public.table_areas;
alter publication supabase_realtime add table public.courier_locations;
alter publication supabase_realtime add table public.delivery_tracking_events;

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
      'service_fee', new.service_fee,
      'delivery_route_duration_minutes', new.delivery_route_duration_minutes,
      'delivery_route_provider', new.delivery_route_provider,
      'delivery_route_confidence', new.delivery_route_confidence,
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
after insert or update of status, total, payment_method, payment_status, paid_at, delivery_status, delivery_distance_km, delivery_fee, service_fee, delivery_route_duration_minutes, delivery_route_provider, delivery_route_confidence, delivery_tracking_updated_at, updated_at on public.orders
for each row execute function public.broadcast_customer_order_status();

create or replace function public.broadcast_delivery_tracking_event()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'order_id', new.order_id,
      'event_type', new.event_type,
      'delivery_status', new.delivery_status,
      'courier_id', new.courier_id,
      'latitude', new.latitude,
      'longitude', new.longitude,
      'accuracy_meters', new.accuracy_meters,
      'heading_degrees', new.heading_degrees,
      'speed_mps', new.speed_mps,
      'source', new.source,
      'note', new.note,
      'created_at', new.created_at
    ),
    'delivery_tracking',
    'customer-order:' || new.order_id::text,
    false
  );

  return null;
end;
$$;

create trigger delivery_tracking_event_broadcast
after insert on public.delivery_tracking_events
for each row execute function public.broadcast_delivery_tracking_event();

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
