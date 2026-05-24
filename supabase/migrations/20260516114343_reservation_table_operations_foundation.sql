-- Reservation table operations foundation:
-- table areas, bookable table metadata, status audit trail and occupancy events.

create table if not exists public.table_areas (
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

alter table public.tables
  add column if not exists table_area_id uuid references public.table_areas(id) on delete set null,
  add column if not exists floor_label text not null default 'Tầng trệt',
  add column if not exists seating_zone text not null default 'indoor',
  add column if not exists table_kind text not null default 'standard',
  add column if not exists reservation_priority integer not null default 100,
  add column if not exists is_bookable boolean not null default true,
  add column if not exists is_hidden boolean not null default false,
  add column if not exists is_under_maintenance boolean not null default false,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.tables
  drop constraint if exists tables_reservation_metadata_check,
  add constraint tables_reservation_metadata_check
    check (
      seating_zone in ('indoor', 'outdoor', 'mixed')
      and table_kind in ('standard', 'vip', 'bar', 'community')
      and reservation_priority between 1 and 999
      and jsonb_typeof(metadata) = 'object'
    );

insert into public.table_areas (restaurant_id, name, floor_label, seating_zone)
select distinct
  t.restaurant_id,
  coalesce(nullif(trim(t.area), ''), 'Khu chính') as name,
  coalesce(nullif(trim(t.floor_label), ''), 'Tầng trệt') as floor_label,
  case when t.seating_zone in ('indoor', 'outdoor', 'mixed') then t.seating_zone else 'indoor' end as seating_zone
from public.tables t
on conflict (restaurant_id, name) do nothing;

update public.tables t
set table_area_id = a.id,
    area = coalesce(nullif(trim(t.area), ''), 'Khu chính')
from public.table_areas a
where t.table_area_id is null
  and a.restaurant_id = t.restaurant_id
  and a.name = coalesce(nullif(trim(t.area), ''), 'Khu chính');

alter table public.reservations
  add column if not exists checked_in_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists rejected_at timestamptz;

alter table public.reservations
  drop constraint if exists reservations_status_check,
  add constraint reservations_status_check check (
    status in (
      'draft',
      'pending',
      'holding',
      'waiting_deposit_confirm',
      'confirmed',
      'checked_in',
      'seated',
      'completed',
      'cancelled',
      'rejected',
      'expired',
      'no_show'
    )
  );

create table if not exists public.reservation_status_logs (
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
    (from_status is null or from_status in (
      'draft',
      'pending',
      'holding',
      'waiting_deposit_confirm',
      'confirmed',
      'checked_in',
      'seated',
      'completed',
      'cancelled',
      'rejected',
      'expired',
      'no_show'
    ))
    and to_status in (
      'draft',
      'pending',
      'holding',
      'waiting_deposit_confirm',
      'confirmed',
      'checked_in',
      'seated',
      'completed',
      'cancelled',
      'rejected',
      'expired',
      'no_show'
    )
  ),
  constraint reservation_status_logs_actor_type_check check (actor_type in ('customer', 'merchant', 'staff', 'system')),
  constraint reservation_status_logs_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.occupancy_logs (
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

create index if not exists table_areas_restaurant_sort_idx
  on public.table_areas (restaurant_id, is_active, sort_order, name);

create index if not exists tables_restaurant_bookable_idx
  on public.tables (restaurant_id, is_bookable, is_hidden, is_under_maintenance, capacity, reservation_priority, name);

create index if not exists tables_restaurant_area_floor_idx
  on public.tables (restaurant_id, table_area_id, floor_label, seating_zone);

create index if not exists reservations_restaurant_checked_in_idx
  on public.reservations (restaurant_id, status, checked_in_at desc)
  where checked_in_at is not null;

create index if not exists reservation_status_logs_reservation_created_idx
  on public.reservation_status_logs (reservation_id, created_at desc);

create index if not exists reservation_status_logs_restaurant_created_idx
  on public.reservation_status_logs (restaurant_id, created_at desc);

create index if not exists occupancy_logs_restaurant_table_time_idx
  on public.occupancy_logs (restaurant_id, table_id, occurred_at desc);

create index if not exists occupancy_logs_reservation_time_idx
  on public.occupancy_logs (reservation_id, occurred_at desc)
  where reservation_id is not null;

alter table public.table_areas enable row level security;
alter table public.reservation_status_logs enable row level security;
alter table public.occupancy_logs enable row level security;

revoke all on public.table_areas from anon;
revoke all on public.reservation_status_logs from anon;
revoke all on public.occupancy_logs from anon;

grant select, insert, update, delete on public.table_areas to authenticated;
grant select on public.reservation_status_logs to authenticated;
grant select on public.occupancy_logs to authenticated;
grant all on public.table_areas to service_role;
grant all on public.reservation_status_logs to service_role;
grant all on public.occupancy_logs to service_role;

drop policy if exists "users can read own table areas" on public.table_areas;
create policy "users can read own table areas"
on public.table_areas for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "admins can insert own table areas" on public.table_areas;
create policy "admins can insert own table areas"
on public.table_areas for insert
to authenticated
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

drop policy if exists "admins can update own table areas" on public.table_areas;
create policy "admins can update own table areas"
on public.table_areas for update
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

drop policy if exists "admins can delete own table areas" on public.table_areas;
create policy "admins can delete own table areas"
on public.table_areas for delete
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

drop policy if exists "staff can read own reservation status logs" on public.reservation_status_logs;
create policy "staff can read own reservation status logs"
on public.reservation_status_logs for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "staff can read own occupancy logs" on public.occupancy_logs;
create policy "staff can read own occupancy logs"
on public.occupancy_logs for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'table_areas_set_updated_at'
  ) then
    create trigger table_areas_set_updated_at
    before update on public.table_areas
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'table_areas'
  ) then
    alter publication supabase_realtime add table public.table_areas;
  end if;
end $$;
