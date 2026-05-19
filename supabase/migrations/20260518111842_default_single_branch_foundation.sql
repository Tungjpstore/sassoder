-- Default single-branch foundation.
-- A restaurant should always have an operational branch record, even when the
-- owner never manually creates one. Coordinates are optional so profile-only
-- restaurants can still assign staff, tables, orders, inventory and AI signals
-- to the current store.

create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

drop index if exists public.store_branches_location_geog_gist_idx;

alter table public.store_branches
  alter column latitude drop not null,
  alter column longitude drop not null;

alter table public.store_branches
  drop column if exists location_geog;

alter table public.store_branches
  add column location_geog extensions.geography(Point, 4326)
  generated always as (
    case
      when latitude is not null and longitude is not null then
        extensions.ST_SetSRID(extensions.ST_MakePoint(longitude, latitude), 4326)::extensions.geography
      else null
    end
  ) stored;

create index if not exists store_branches_location_geog_gist_idx
  on public.store_branches
  using gist (location_geog)
  where is_active = true and location_geog is not null;

insert into public.store_branches (
  restaurant_id,
  name,
  address,
  latitude,
  longitude,
  is_primary,
  is_active,
  delivery_radius_km,
  free_delivery_radius_km,
  delivery_base_fee,
  delivery_fee_per_km,
  pickup_eta_minutes,
  delivery_eta_minutes,
  accepting_delivery,
  delivery_paused,
  temporarily_closed,
  delivery_opening_time,
  delivery_closing_time,
  delivery_availability_note,
  metadata
)
select
  r.id,
  'Chi nhánh chính',
  coalesce(nullif(trim(r.address), ''), nullif(trim(r.name), ''), 'Chi nhánh chính'),
  r.store_lat,
  r.store_lng,
  true,
  true,
  r.delivery_radius_km,
  r.free_delivery_radius_km,
  r.delivery_base_fee,
  r.delivery_fee_per_km,
  r.pickup_eta_minutes,
  r.delivery_eta_minutes,
  true,
  false,
  false,
  r.opening_time,
  r.closing_time,
  null,
  jsonb_build_object(
    'createdFrom', 'default_single_branch_migration',
    'source', 'restaurant_profile'
  )
from public.restaurants r
where not exists (
  select 1
  from public.store_branches b
  where b.restaurant_id = r.id
);

with branch_without_active as (
  select distinct on (b.restaurant_id)
    b.id,
    b.restaurant_id
  from public.store_branches b
  where not exists (
    select 1
    from public.store_branches active_branch
    where active_branch.restaurant_id = b.restaurant_id
      and active_branch.is_active = true
  )
  order by b.restaurant_id, b.is_primary desc, b.created_at asc
)
update public.store_branches b
set
  is_active = true,
  is_primary = true
from branch_without_active fallback
where b.id = fallback.id;

with active_primary as (
  select distinct on (restaurant_id)
    id,
    restaurant_id
  from public.store_branches
  where is_active = true
  order by restaurant_id, is_primary desc, created_at asc
)
update public.store_branches b
set is_primary = true
from active_primary p
where b.id = p.id
  and not exists (
    select 1
    from public.store_branches existing
    where existing.restaurant_id = p.restaurant_id
      and existing.is_active = true
      and existing.is_primary = true
  );

with ranked_primary as (
  select
    id,
    row_number() over (
      partition by restaurant_id
      order by created_at asc, id asc
    ) as primary_rank
  from public.store_branches
  where is_active = true
    and is_primary = true
)
update public.store_branches b
set is_primary = false
from ranked_primary ranked
where b.id = ranked.id
  and ranked.primary_rank > 1;

create unique index if not exists store_branches_one_active_primary_idx
  on public.store_branches (restaurant_id)
  where is_active = true and is_primary = true;

insert into public.inventory_locations (
  restaurant_id,
  branch_id,
  name,
  location_type,
  code,
  is_primary,
  is_active,
  sort_order,
  metadata
)
select
  b.restaurant_id,
  b.id,
  b.name || ' - Kho chính',
  'branch_storage',
  'MAIN',
  true,
  true,
  0,
  jsonb_build_object(
    'seededFrom', 'default_single_branch_migration',
    'branchId', b.id
  )
from public.store_branches b
where b.is_active = true
  and not exists (
    select 1
    from public.inventory_locations l
    where l.restaurant_id = b.restaurant_id
      and l.branch_id = b.id
      and l.is_active = true
  );

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
  branch_location_state as (
    select exists (
      select 1
      from public.store_branches b
      join target_restaurant r on r.id = b.restaurant_id
      where b.is_active = true
        and b.location_geog is not null
    ) as has_branch_locations
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
      jsonb_build_object(
        'openingTime', r.opening_time,
        'closingTime', r.closing_time
      ) as metadata,
      r.store_geog as geog
    from target_restaurant r
    cross join branch_location_state s
    where r.store_geog is not null
      and s.has_branch_locations = false

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
      coalesce(b.metadata, '{}'::jsonb) || jsonb_build_object(
        'acceptingDelivery', b.accepting_delivery,
        'deliveryPaused', b.delivery_paused,
        'temporarilyClosed', b.temporarily_closed,
        'openingTime', b.delivery_opening_time,
        'closingTime', b.delivery_closing_time,
        'availabilityNote', b.delivery_availability_note
      ) as metadata,
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
  is 'Server-side PostGIS prefilter for delivery quote branch routing. Uses real store_branches when branch coordinates exist and falls back to restaurant coordinates only for legacy/profile-only stores.';
