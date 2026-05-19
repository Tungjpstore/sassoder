alter table public.store_branches
  add column if not exists accepting_delivery boolean not null default true,
  add column if not exists delivery_paused boolean not null default false,
  add column if not exists temporarily_closed boolean not null default false,
  add column if not exists delivery_opening_time time,
  add column if not exists delivery_closing_time time,
  add column if not exists delivery_availability_note text;

create index if not exists store_branches_delivery_availability_idx
  on public.store_branches (restaurant_id, accepting_delivery, delivery_paused, temporarily_closed)
  where is_active = true;

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
      jsonb_build_object(
        'openingTime', r.opening_time,
        'closingTime', r.closing_time
      ) as metadata,
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
