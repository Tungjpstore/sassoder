-- Durable operational outbox for realtime channels.
-- Business requests can record events here before attempting Redis/BullMQ delivery,
-- then VPS workers can replay safely if the gateway is unavailable.

create table if not exists public.operational_event_outbox (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  event_type text not null,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid references public.store_branches(id) on delete set null,
  tenant_id text not null,
  source text,
  priority smallint not null default 5,
  status text not null default 'pending',
  attempts integer not null default 0,
  payload jsonb not null,
  delivery_metadata jsonb not null default '{}'::jsonb,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_event_outbox_event_type_check check (event_type ~ '^[a-z0-9_.:-]{3,140}$'),
  constraint operational_event_outbox_status_check check (status in ('pending', 'processing', 'published', 'failed', 'dead_letter')),
  constraint operational_event_outbox_priority_check check (priority between 1 and 10),
  constraint operational_event_outbox_attempts_check check (attempts >= 0),
  constraint operational_event_outbox_payload_object_check check (jsonb_typeof(payload) = 'object'),
  constraint operational_event_outbox_delivery_metadata_object_check check (jsonb_typeof(delivery_metadata) = 'object'),
  unique (restaurant_id, event_id)
);

create index if not exists operational_event_outbox_due_idx
  on public.operational_event_outbox (status, next_attempt_at, priority, created_at)
  where status in ('pending', 'processing', 'failed');

create index if not exists operational_event_outbox_restaurant_created_idx
  on public.operational_event_outbox (restaurant_id, created_at desc);

create index if not exists operational_event_outbox_type_status_idx
  on public.operational_event_outbox (event_type, status, created_at desc);

alter table public.operational_event_outbox enable row level security;

revoke all on table public.operational_event_outbox from anon, authenticated;
grant all on table public.operational_event_outbox to service_role;

drop policy if exists "restaurant admins can read operational outbox" on public.operational_event_outbox;
create policy "restaurant admins can read operational outbox"
on public.operational_event_outbox for select
to authenticated
using (
  restaurant_id = app_private.current_restaurant_id()
  and app_private.current_user_role() = 'ADMIN'
);

create or replace function public.claim_operational_event_outbox(
  p_limit integer default 25,
  p_worker text default 'worker',
  p_lock_seconds integer default 120
)
returns setof public.operational_event_outbox
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select id
    from public.operational_event_outbox
    where status in ('pending', 'processing', 'failed')
      and next_attempt_at <= now()
      and (
        status <> 'processing'
        or locked_at is null
        or locked_at < now() - make_interval(secs => greatest(p_lock_seconds, 30))
      )
    order by priority asc, next_attempt_at asc, created_at asc
    limit least(greatest(p_limit, 1), 100)
    for update skip locked
  )
  update public.operational_event_outbox outbox
  set
    status = 'processing',
    attempts = outbox.attempts + 1,
    locked_at = now(),
    locked_by = left(coalesce(p_worker, 'worker'), 120),
    updated_at = now()
  from candidates
  where outbox.id = candidates.id
  returning outbox.*;
$$;

revoke all on function public.claim_operational_event_outbox(integer, text, integer) from public, anon, authenticated;
grant execute on function public.claim_operational_event_outbox(integer, text, integer) to service_role;
