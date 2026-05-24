-- Reservation deposit disposition and customer risk foundation.

alter type public.payment_log_status add value if not exists 'refunded';

create table if not exists public.reservation_customer_risk_events (
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

create index if not exists reservation_customer_risk_events_phone_idx
  on public.reservation_customer_risk_events (restaurant_id, customer_phone, created_at desc);

create index if not exists reservation_customer_risk_events_reservation_idx
  on public.reservation_customer_risk_events (reservation_id, created_at desc);

alter table public.reservation_customer_risk_events enable row level security;
revoke all on public.reservation_customer_risk_events from anon;
grant select on public.reservation_customer_risk_events to authenticated;
grant all on public.reservation_customer_risk_events to service_role;

drop policy if exists "staff can read own reservation customer risk events" on public.reservation_customer_risk_events;
create policy "staff can read own reservation customer risk events"
on public.reservation_customer_risk_events for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());
