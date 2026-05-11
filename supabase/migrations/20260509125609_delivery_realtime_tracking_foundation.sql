create table if not exists public.delivery_couriers (
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

create table if not exists public.courier_locations (
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

create table if not exists public.delivery_tracking_events (
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

create index if not exists delivery_couriers_restaurant_status_idx
  on public.delivery_couriers (restaurant_id, status, updated_at desc);

create unique index if not exists delivery_couriers_restaurant_phone_idx
  on public.delivery_couriers (restaurant_id, phone)
  where phone is not null;

create index if not exists courier_locations_restaurant_order_captured_idx
  on public.courier_locations (restaurant_id, order_id, captured_at desc)
  where order_id is not null;

create index if not exists courier_locations_courier_captured_idx
  on public.courier_locations (courier_id, captured_at desc)
  where courier_id is not null;

create index if not exists courier_locations_geog_gist_idx
  on public.courier_locations
  using gist (location_geog);

create index if not exists delivery_tracking_events_order_created_idx
  on public.delivery_tracking_events (order_id, created_at desc);

create index if not exists delivery_tracking_events_restaurant_created_idx
  on public.delivery_tracking_events (restaurant_id, created_at desc);

create index if not exists delivery_tracking_events_geog_gist_idx
  on public.delivery_tracking_events
  using gist (location_geog)
  where location_geog is not null;

alter table public.delivery_couriers enable row level security;
alter table public.courier_locations enable row level security;
alter table public.delivery_tracking_events enable row level security;

create policy "users can read own delivery couriers"
on public.delivery_couriers for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

create policy "admins can mutate own delivery couriers"
on public.delivery_couriers for all
to authenticated
using (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN')
with check (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN');

create policy "users can read own courier locations"
on public.courier_locations for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

create policy "users can insert own courier locations"
on public.courier_locations for insert
to authenticated
with check (restaurant_id = public.current_restaurant_id());

create policy "users can read own delivery tracking events"
on public.delivery_tracking_events for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

create policy "users can insert own delivery tracking events"
on public.delivery_tracking_events for insert
to authenticated
with check (restaurant_id = public.current_restaurant_id());

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

drop trigger if exists delivery_couriers_touch_updated_at on public.delivery_couriers;
create trigger delivery_couriers_touch_updated_at
before update on public.delivery_couriers
for each row execute function public.touch_delivery_courier_updated_at();

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

drop trigger if exists delivery_tracking_event_broadcast on public.delivery_tracking_events;
create trigger delivery_tracking_event_broadcast
after insert on public.delivery_tracking_events
for each row execute function public.broadcast_delivery_tracking_event();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'delivery_tracking_events'
    ) then
      alter publication supabase_realtime add table public.delivery_tracking_events;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'courier_locations'
    ) then
      alter publication supabase_realtime add table public.courier_locations;
    end if;
  end if;
end;
$$;
