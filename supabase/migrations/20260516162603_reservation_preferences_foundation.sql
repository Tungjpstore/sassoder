-- Reservation preference layer:
-- customer-facing area/space/table-kind preferences that still feed the same table lock flow.

alter table public.reservations
  add column if not exists preferred_table_area_id uuid references public.table_areas(id) on delete set null,
  add column if not exists preferred_seating_zone text,
  add column if not exists preferred_table_kind text;

alter table public.reservations
  drop constraint if exists reservations_preferred_seating_zone_check,
  add constraint reservations_preferred_seating_zone_check
    check (preferred_seating_zone is null or preferred_seating_zone in ('indoor', 'outdoor', 'mixed')),
  drop constraint if exists reservations_preferred_table_kind_check,
  add constraint reservations_preferred_table_kind_check
    check (preferred_table_kind is null or preferred_table_kind in ('standard', 'vip', 'bar', 'community'));

create index if not exists reservations_restaurant_preference_idx
  on public.reservations (restaurant_id, preferred_table_area_id, preferred_seating_zone, preferred_table_kind, starts_at desc);
