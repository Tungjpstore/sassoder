alter table public.restaurants
  add column if not exists map_provider text not null default 'maplibre',
  add column if not exists map_geocoding_provider text not null default 'nominatim',
  add column if not exists map_routing_provider text not null default 'osrm';

alter table public.restaurants
  drop constraint if exists restaurants_map_provider_check,
  add constraint restaurants_map_provider_check
    check (map_provider in ('maplibre', 'mapbox')),
  drop constraint if exists restaurants_map_geocoding_provider_check,
  add constraint restaurants_map_geocoding_provider_check
    check (map_geocoding_provider in ('nominatim', 'mapbox', 'vietmap', 'goong')),
  drop constraint if exists restaurants_map_routing_provider_check,
  add constraint restaurants_map_routing_provider_check
    check (map_routing_provider in ('osrm', 'mapbox', 'vietmap', 'goong'));

create table if not exists public.store_branches (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  address text not null,
  latitude double precision not null,
  longitude double precision not null,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  delivery_radius_km numeric(6,2) not null default 5,
  free_delivery_radius_km numeric(6,2) not null default 0,
  delivery_base_fee integer not null default 15000,
  delivery_fee_per_km integer not null default 5000,
  pickup_eta_minutes integer not null default 15,
  delivery_eta_minutes integer not null default 45,
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

create index if not exists restaurants_delivery_coords_idx
  on public.restaurants (store_lat, store_lng);

create index if not exists restaurants_map_provider_idx
  on public.restaurants (map_provider, map_geocoding_provider, map_routing_provider);

create index if not exists store_branches_restaurant_active_idx
  on public.store_branches (restaurant_id, is_active, is_primary desc);

create index if not exists store_branches_coordinates_idx
  on public.store_branches (latitude, longitude);

alter table public.store_branches enable row level security;

drop policy if exists "public can read active store branches" on public.store_branches;
create policy "public can read active store branches"
on public.store_branches for select
to anon, authenticated
using (is_active = true);

drop policy if exists "users can read own store branches" on public.store_branches;
create policy "users can read own store branches"
on public.store_branches for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

drop policy if exists "admins can mutate own store branches" on public.store_branches;
create policy "admins can mutate own store branches"
on public.store_branches for all
to authenticated
using (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN')
with check (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN');
