-- Telegram operations layer for LogiVN.
-- This keeps Telegram identities, delivery state, callback actions, and audit
-- trails tenant-scoped instead of trusting Telegram IDs directly.

create table if not exists public.telegram_connection_tokens (
  token_hash text primary key,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid references public.store_branches(id) on delete set null,
  user_id uuid not null references public.users(id) on delete cascade,
  role public.user_role not null default 'STAFF',
  permissions text[] not null default '{}'::text[],
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_telegram_user_id bigint,
  revoked_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint telegram_connection_tokens_permissions_count check (cardinality(permissions) <= 120),
  constraint telegram_connection_tokens_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.telegram_connections (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid references public.store_branches(id) on delete set null,
  user_id uuid not null references public.users(id) on delete cascade,
  staff_member_id uuid references public.staff_members(id) on delete set null,
  telegram_user_id bigint not null,
  telegram_chat_id bigint not null,
  telegram_username text,
  telegram_first_name text,
  telegram_last_name text,
  role public.user_role not null default 'STAFF',
  permissions text[] not null default '{}'::text[],
  status text not null default 'active',
  connected_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint telegram_connections_status_check check (status in ('active', 'revoked', 'blocked')),
  constraint telegram_connections_username_check check (telegram_username is null or telegram_username ~ '^[A-Za-z0-9_]{3,64}$'),
  constraint telegram_connections_permissions_count check (cardinality(permissions) <= 120),
  constraint telegram_connections_metadata_object check (jsonb_typeof(metadata) = 'object'),
  unique (restaurant_id, user_id),
  unique (restaurant_id, telegram_user_id)
);

create table if not exists public.telegram_devices (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.telegram_connections(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  telegram_user_id bigint not null,
  device_label text,
  trust_level text not null default 'standard',
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint telegram_devices_trust_level_check check (trust_level in ('standard', 'trusted', 'blocked')),
  constraint telegram_devices_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.telegram_sessions (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.telegram_connections(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid references public.store_branches(id) on delete set null,
  session_key_hash text not null,
  state text not null default 'idle',
  payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint telegram_sessions_state_check check (state in ('idle', 'awaiting_input', 'ai_ops', 'staff_flow')),
  constraint telegram_sessions_payload_object check (jsonb_typeof(payload) = 'object'),
  unique (session_key_hash)
);

create table if not exists public.telegram_notifications (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  event_type text not null,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid references public.store_branches(id) on delete set null,
  connection_id uuid references public.telegram_connections(id) on delete set null,
  channel text not null default 'telegram',
  chat_id bigint not null,
  status text not null default 'queued',
  priority smallint not null default 5,
  title text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  telegram_message_id bigint,
  attempts integer not null default 0,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  failed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint telegram_notifications_event_type_check check (event_type ~ '^[a-z0-9_.:-]{3,120}$'),
  constraint telegram_notifications_channel_check check (channel = 'telegram'),
  constraint telegram_notifications_status_check check (status in ('queued', 'sent', 'failed', 'skipped', 'rate_limited')),
  constraint telegram_notifications_priority_range check (priority between 1 and 10),
  constraint telegram_notifications_payload_object check (jsonb_typeof(payload) = 'object'),
  unique (event_id, connection_id)
);

create table if not exists public.telegram_callback_actions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  action_type text not null,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid references public.store_branches(id) on delete set null,
  connection_id uuid references public.telegram_connections(id) on delete set null,
  notification_id uuid references public.telegram_notifications(id) on delete set null,
  resource_type text not null,
  resource_id uuid not null,
  required_permission text not null,
  status text not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_telegram_user_id bigint,
  created_at timestamptz not null default now(),
  constraint telegram_callback_actions_action_check check (action_type ~ '^[a-z0-9_.:-]{3,120}$'),
  constraint telegram_callback_actions_resource_check check (resource_type ~ '^[a-z0-9_-]{3,80}$'),
  constraint telegram_callback_actions_permission_check check (required_permission ~ '^[a-z0-9_.:-]{3,120}$'),
  constraint telegram_callback_actions_status_check check (status in ('pending', 'used', 'expired', 'revoked')),
  constraint telegram_callback_actions_payload_object check (jsonb_typeof(payload) = 'object')
);

create table if not exists public.telegram_audit_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  branch_id uuid references public.store_branches(id) on delete set null,
  connection_id uuid references public.telegram_connections(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  telegram_user_id bigint,
  action text not null,
  entity_type text,
  entity_id uuid,
  outcome text not null,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now(),
  constraint telegram_audit_logs_action_check check (action ~ '^[a-z0-9_.:-]{3,160}$'),
  constraint telegram_audit_logs_outcome_check check (outcome in ('accepted', 'denied', 'failed', 'sent', 'skipped')),
  constraint telegram_audit_logs_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.telegram_rate_limits (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  scope_key text not null,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  window_start timestamptz not null,
  window_seconds integer not null,
  limit_count integer not null,
  used_count integer not null default 0,
  blocked_until timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint telegram_rate_limits_scope_check check (scope in ('global', 'restaurant', 'chat', 'callback')),
  constraint telegram_rate_limits_window_positive check (window_seconds > 0 and limit_count > 0 and used_count >= 0),
  constraint telegram_rate_limits_metadata_object check (jsonb_typeof(metadata) = 'object'),
  unique (scope, scope_key, window_start)
);

create index if not exists telegram_connection_tokens_due_idx
  on public.telegram_connection_tokens (restaurant_id, user_id, expires_at)
  where consumed_at is null and revoked_at is null;

create index if not exists telegram_connections_restaurant_status_idx
  on public.telegram_connections (restaurant_id, status, branch_id, updated_at desc);

create index if not exists telegram_connections_telegram_user_idx
  on public.telegram_connections (telegram_user_id, status);

create index if not exists telegram_notifications_due_idx
  on public.telegram_notifications (status, scheduled_at, priority, created_at)
  where status in ('queued', 'failed', 'rate_limited');

create index if not exists telegram_notifications_restaurant_event_idx
  on public.telegram_notifications (restaurant_id, event_type, created_at desc);

create index if not exists telegram_callback_actions_pending_idx
  on public.telegram_callback_actions (restaurant_id, action_type, expires_at)
  where status = 'pending' and used_at is null;

create index if not exists telegram_audit_logs_restaurant_created_idx
  on public.telegram_audit_logs (restaurant_id, created_at desc);

create index if not exists telegram_rate_limits_blocked_idx
  on public.telegram_rate_limits (scope, blocked_until)
  where blocked_until is not null;

alter table public.telegram_connection_tokens enable row level security;
alter table public.telegram_connections enable row level security;
alter table public.telegram_devices enable row level security;
alter table public.telegram_sessions enable row level security;
alter table public.telegram_notifications enable row level security;
alter table public.telegram_callback_actions enable row level security;
alter table public.telegram_audit_logs enable row level security;
alter table public.telegram_rate_limits enable row level security;

revoke all on table public.telegram_connection_tokens from anon, authenticated;
revoke all on table public.telegram_connections from anon, authenticated;
revoke all on table public.telegram_devices from anon, authenticated;
revoke all on table public.telegram_sessions from anon, authenticated;
revoke all on table public.telegram_notifications from anon, authenticated;
revoke all on table public.telegram_callback_actions from anon, authenticated;
revoke all on table public.telegram_audit_logs from anon, authenticated;
revoke all on table public.telegram_rate_limits from anon, authenticated;

grant select on table public.telegram_connections to authenticated;
grant select on table public.telegram_notifications to authenticated;
grant select on table public.telegram_audit_logs to authenticated;

grant all on table public.telegram_connection_tokens to service_role;
grant all on table public.telegram_connections to service_role;
grant all on table public.telegram_devices to service_role;
grant all on table public.telegram_sessions to service_role;
grant all on table public.telegram_notifications to service_role;
grant all on table public.telegram_callback_actions to service_role;
grant all on table public.telegram_audit_logs to service_role;
grant all on table public.telegram_rate_limits to service_role;

drop policy if exists "restaurant users can read telegram connections" on public.telegram_connections;
create policy "restaurant users can read telegram connections"
on public.telegram_connections for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "restaurant users can read telegram notifications" on public.telegram_notifications;
create policy "restaurant users can read telegram notifications"
on public.telegram_notifications for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "restaurant admins can read telegram audit logs" on public.telegram_audit_logs;
create policy "restaurant admins can read telegram audit logs"
on public.telegram_audit_logs for select
to authenticated
using (
  restaurant_id = app_private.current_restaurant_id()
  and app_private.current_user_role() = 'ADMIN'
);
