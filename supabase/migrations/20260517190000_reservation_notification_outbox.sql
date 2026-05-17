-- Reservation notification outbox for in-app/customer/merchant delivery workers.

create table if not exists public.reservation_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  audience text not null default 'customer',
  channel text not null default 'in_app',
  status text not null default 'queued',
  title text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  constraint reservation_notification_outbox_audience_check check (audience in ('customer','merchant','staff')),
  constraint reservation_notification_outbox_channel_check check (channel in ('in_app','sms','zalo','email','webhook')),
  constraint reservation_notification_outbox_status_check check (status in ('queued','sent','failed','skipped')),
  constraint reservation_notification_outbox_payload_object_check check (jsonb_typeof(payload) = 'object')
);

create index if not exists reservation_notification_outbox_due_idx
  on public.reservation_notification_outbox (status, scheduled_at, created_at)
  where status = 'queued';

create index if not exists reservation_notification_outbox_reservation_idx
  on public.reservation_notification_outbox (reservation_id, created_at desc);

alter table public.reservation_notification_outbox enable row level security;
revoke all on public.reservation_notification_outbox from anon;
grant select on public.reservation_notification_outbox to authenticated;
grant all on public.reservation_notification_outbox to service_role;

drop policy if exists "staff can read own reservation notification outbox" on public.reservation_notification_outbox;
create policy "staff can read own reservation notification outbox"
on public.reservation_notification_outbox for select
to authenticated
using (restaurant_id = public.current_restaurant_id());
