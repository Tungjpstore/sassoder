-- Reservation deposits: table booking, time locks, VietQR deposit flow and expiry.

create extension if not exists btree_gist;

alter table public.restaurants
  add column if not exists reservations_enabled boolean not null default false,
  add column if not exists reservation_deposit_enabled boolean not null default false,
  add column if not exists reservation_deposit_type text not null default 'FIXED',
  add column if not exists reservation_deposit_value integer not null default 0,
  add column if not exists reservation_hold_minutes integer not null default 10,
  add column if not exists reservation_duration_minutes integer not null default 90,
  add column if not exists reservation_buffer_minutes integer not null default 15,
  add column if not exists reservation_min_notice_minutes integer not null default 30,
  add column if not exists reservation_max_days_ahead integer not null default 30,
  add column if not exists reservation_arrival_grace_minutes integer not null default 15;

alter table public.restaurants
  drop constraint if exists restaurants_reservation_deposit_type_check,
  add constraint restaurants_reservation_deposit_type_check
    check (reservation_deposit_type in ('FIXED', 'PER_PERSON')),
  drop constraint if exists restaurants_reservation_settings_range,
  add constraint restaurants_reservation_settings_range
    check (
      reservation_deposit_value >= 0
      and reservation_hold_minutes between 1 and 1440
      and reservation_duration_minutes between 15 and 480
      and reservation_buffer_minutes between 0 and 240
      and reservation_min_notice_minutes between 0 and 10080
      and reservation_max_days_ahead between 1 and 365
      and reservation_arrival_grace_minutes between 0 and 240
    );

create table if not exists public.reservations (
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
  constraint reservations_status_check check (
    status in ('draft','holding','waiting_deposit_confirm','confirmed','seated','completed','cancelled','expired','no_show')
  ),
  constraint reservations_deposit_status_check check (
    deposit_status in ('none','required','waiting_payment','waiting_confirm','paid','refundable','forfeited','refunded')
  ),
  constraint reservations_deposit_amount_range check (
    deposit_required_amount >= 0 and deposit_paid_amount >= 0 and deposit_paid_amount <= deposit_required_amount
  ),
  constraint reservations_customer_phone_format check (customer_phone ~ '^[0-9+() .-]{6,24}$'),
  constraint reservations_customer_email_format check (customer_email is null or customer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

create table if not exists public.reservation_table_locks (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id uuid not null references public.tables(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint reservation_table_locks_time_range check (starts_at < ends_at),
  constraint reservation_table_locks_status_check check (status in ('active','released'))
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reservation_no_overlap_per_table'
  ) then
    alter table public.reservation_table_locks
      add constraint reservation_no_overlap_per_table
      exclude using gist (
        restaurant_id with =,
        table_id with =,
        tstzrange(starts_at, ends_at, '[)') with &&
      )
      where (status = 'active');
  end if;
end $$;

create table if not exists public.reservation_deposit_logs (
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
  add column if not exists reservation_id uuid references public.reservations(id) on delete set null,
  add column if not exists deposit_applied_amount integer not null default 0;

create index if not exists reservations_restaurant_status_starts_idx
  on public.reservations (restaurant_id, status, starts_at desc);

create index if not exists reservations_restaurant_phone_created_idx
  on public.reservations (restaurant_id, customer_phone, created_at desc);

create unique index if not exists reservations_restaurant_idempotency_idx
  on public.reservations (restaurant_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists reservation_locks_restaurant_table_time_idx
  on public.reservation_table_locks (restaurant_id, table_id, starts_at, ends_at)
  where status = 'active';

create index if not exists reservation_deposit_logs_reservation_created_idx
  on public.reservation_deposit_logs (reservation_id, created_at desc);

alter table public.reservations enable row level security;
alter table public.reservation_table_locks enable row level security;
alter table public.reservation_deposit_logs enable row level security;

drop policy if exists "staff can read own reservations" on public.reservations;
create policy "staff can read own reservations"
on public.reservations for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

drop policy if exists "staff can update own reservations" on public.reservations;
create policy "staff can update own reservations"
on public.reservations for update
to authenticated
using (restaurant_id = public.current_restaurant_id())
with check (restaurant_id = public.current_restaurant_id());

drop policy if exists "staff can read own reservation locks" on public.reservation_table_locks;
create policy "staff can read own reservation locks"
on public.reservation_table_locks for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

drop policy if exists "staff can read own reservation deposits" on public.reservation_deposit_logs;
create policy "staff can read own reservation deposits"
on public.reservation_deposit_logs for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

drop trigger if exists reservations_set_updated_at on public.reservations;
create trigger reservations_set_updated_at
before update on public.reservations
for each row execute function public.set_updated_at();

alter publication supabase_realtime add table public.reservations;
