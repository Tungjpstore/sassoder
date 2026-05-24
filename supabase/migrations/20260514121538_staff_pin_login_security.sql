alter table public.staff_members
  add column if not exists pin_lookup_hash text,
  add column if not exists pin_updated_at timestamptz,
  add column if not exists pin_last_success_at timestamptz;

create unique index if not exists staff_members_restaurant_pin_lookup_unique_idx
  on public.staff_members (restaurant_id, pin_lookup_hash)
  where pin_lookup_hash is not null and archived_at is null;

create index if not exists staff_members_pin_lock_idx
  on public.staff_members (restaurant_id, pin_locked_until)
  where pin_locked_until is not null;

revoke select (
  pin_hash,
  pin_lookup_hash
) on public.staff_members from authenticated;

revoke update (
  pin_hash,
  pin_lookup_hash,
  pin_attempts,
  pin_locked_until,
  pin_updated_at,
  pin_last_success_at
) on public.staff_members from authenticated;
