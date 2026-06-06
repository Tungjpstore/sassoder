-- PWA Web Push subscription registry.
-- Mutations are server-owned so browser clients cannot attach a push endpoint
-- to another restaurant or user. Authenticated users may read only their own
-- device registrations for future device-management UI.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  expiration_time timestamptz,
  device_label text,
  platform text,
  app_surface text not null default 'dashboard',
  permission_state text not null default 'granted',
  enabled boolean not null default true,
  failure_count integer not null default 0,
  last_seen_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  disabled_at timestamptz,
  disabled_reason text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_length check (length(endpoint) between 20 and 2048),
  constraint push_subscriptions_p256dh_length check (length(p256dh) between 20 and 4096),
  constraint push_subscriptions_auth_length check (length(auth) between 8 and 1024),
  constraint push_subscriptions_failure_count_range check (failure_count >= 0),
  constraint push_subscriptions_app_surface_check check (app_surface in ('dashboard', 'staff', 'customer', 'platform')),
  constraint push_subscriptions_permission_state_check check (permission_state in ('granted', 'denied', 'default')),
  constraint push_subscriptions_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists push_subscriptions_endpoint_unique_idx
  on public.push_subscriptions (endpoint);

create index if not exists push_subscriptions_restaurant_enabled_idx
  on public.push_subscriptions (restaurant_id, enabled, disabled_at, last_seen_at desc);

create index if not exists push_subscriptions_user_enabled_idx
  on public.push_subscriptions (restaurant_id, user_id, enabled, disabled_at, last_seen_at desc);

drop trigger if exists push_subscriptions_set_updated_at on public.push_subscriptions;
create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;

revoke all on table public.push_subscriptions from anon, authenticated;
grant select on table public.push_subscriptions to authenticated;
grant all on table public.push_subscriptions to service_role;

drop policy if exists "users can read own push subscriptions" on public.push_subscriptions;
create policy "users can read own push subscriptions"
on public.push_subscriptions for select
to authenticated
using (
  restaurant_id = app_private.current_restaurant_id()
  and user_id = auth.uid()
);
