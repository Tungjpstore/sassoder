-- Platform Telegram DevOps bot isolation.
-- These tables are intentionally separate from tenant Telegram tables so LogiVN
-- dev/support accounts never share staff/owner connection state or callbacks.

create table if not exists public.platform_telegram_connections (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null unique,
  telegram_chat_id bigint not null,
  telegram_username text,
  telegram_first_name text,
  telegram_last_name text,
  display_name text,
  role text not null default 'DEV',
  scopes text[] not null default array['infra.read', 'queues.read', 'incidents.read']::text[],
  status text not null default 'active',
  connected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_telegram_connections_role_check check (role in ('DEV', 'SUPPORT', 'SRE', 'ADMIN')),
  constraint platform_telegram_connections_status_check check (status in ('active', 'revoked')),
  constraint platform_telegram_connections_scopes_shape check (array_length(scopes, 1) is null or array_length(scopes, 1) <= 80),
  constraint platform_telegram_connections_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists platform_telegram_connections_status_idx
  on public.platform_telegram_connections (status, last_seen_at desc);

create table if not exists public.platform_telegram_sessions (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.platform_telegram_connections(id) on delete cascade,
  session_key_hash text not null unique,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint platform_telegram_sessions_action_check check (action ~ '^[a-z0-9_.:-]{3,120}$'),
  constraint platform_telegram_sessions_payload_object check (jsonb_typeof(payload) = 'object')
);

create index if not exists platform_telegram_sessions_connection_idx
  on public.platform_telegram_sessions (connection_id, expires_at desc);

create table if not exists public.platform_telegram_audit_logs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references public.platform_telegram_connections(id) on delete set null,
  telegram_user_id bigint,
  action text not null,
  target_type text,
  target_id text,
  outcome text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint platform_telegram_audit_logs_outcome_check check (outcome in ('accepted', 'denied', 'failed', 'sent', 'skipped')),
  constraint platform_telegram_audit_logs_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists platform_telegram_audit_logs_recent_idx
  on public.platform_telegram_audit_logs (created_at desc);

create table if not exists public.platform_support_access_grants (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references public.platform_telegram_connections(id) on delete set null,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  reason text not null,
  scopes text[] not null default array['tenant.metadata.read']::text[],
  status text not null default 'active',
  expires_at timestamptz not null,
  approved_by uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_support_access_grants_status_check check (status in ('active', 'revoked', 'expired')),
  constraint platform_support_access_grants_reason_length check (char_length(reason) between 8 and 500),
  constraint platform_support_access_grants_expires_future check (expires_at > created_at),
  constraint platform_support_access_grants_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists platform_support_access_grants_active_idx
  on public.platform_support_access_grants (restaurant_id, status, expires_at desc)
  where status = 'active';

-- Platform alerts are not tenant-owned, but they still need the same durable
-- outbox/replay path as restaurant events when emitted from app code.
alter table public.operational_event_outbox
  alter column restaurant_id drop not null;

create unique index if not exists operational_event_outbox_tenant_event_uidx
  on public.operational_event_outbox (tenant_id, event_id);

alter table public.platform_telegram_connections enable row level security;
alter table public.platform_telegram_sessions enable row level security;
alter table public.platform_telegram_audit_logs enable row level security;
alter table public.platform_support_access_grants enable row level security;

revoke all on table public.platform_telegram_connections from anon, authenticated;
revoke all on table public.platform_telegram_sessions from anon, authenticated;
revoke all on table public.platform_telegram_audit_logs from anon, authenticated;
revoke all on table public.platform_support_access_grants from anon, authenticated;

grant all on table public.platform_telegram_connections to service_role;
grant all on table public.platform_telegram_sessions to service_role;
grant all on table public.platform_telegram_audit_logs to service_role;
grant all on table public.platform_support_access_grants to service_role;

drop trigger if exists platform_telegram_connections_set_updated_at on public.platform_telegram_connections;
create trigger platform_telegram_connections_set_updated_at
before update on public.platform_telegram_connections
for each row execute function public.set_updated_at();

drop trigger if exists platform_support_access_grants_set_updated_at on public.platform_support_access_grants;
create trigger platform_support_access_grants_set_updated_at
before update on public.platform_support_access_grants
for each row execute function public.set_updated_at();
