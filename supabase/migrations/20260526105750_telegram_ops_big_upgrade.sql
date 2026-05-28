-- Big upgrade foundations for Telegram Ops.
-- Policies keep owner configuration tenant-scoped. Incidents and briefings give
-- the bot a durable operations memory without coupling to Telegram chat state.

create table if not exists public.telegram_notification_policies (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid references public.store_branches(id) on delete cascade,
  event_type text not null,
  label text not null,
  enabled boolean not null default true,
  recipient_scope text not null default 'permission',
  required_permission text,
  priority smallint not null default 5,
  quiet_hours jsonb not null default '{}'::jsonb,
  escalation_after_seconds integer,
  escalate_to_admin boolean not null default true,
  digest_enabled boolean not null default false,
  created_by uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint telegram_notification_policies_event_type_check check (event_type ~ '^[a-z0-9_.*:-]{1,120}$'),
  constraint telegram_notification_policies_scope_check check (recipient_scope in ('permission', 'admins', 'branch', 'silent')),
  constraint telegram_notification_policies_permission_check check (required_permission is null or required_permission ~ '^[a-z0-9_.:-]{3,120}$'),
  constraint telegram_notification_policies_priority_range check (priority between 1 and 10),
  constraint telegram_notification_policies_escalation_positive check (escalation_after_seconds is null or escalation_after_seconds between 60 and 86400),
  constraint telegram_notification_policies_quiet_hours_object check (jsonb_typeof(quiet_hours) = 'object'),
  constraint telegram_notification_policies_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists telegram_notification_policies_scope_unique_idx
  on public.telegram_notification_policies (restaurant_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), event_type);

create index if not exists telegram_notification_policies_restaurant_idx
  on public.telegram_notification_policies (restaurant_id, enabled, priority, updated_at desc);

create table if not exists public.telegram_ops_incidents (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid references public.store_branches(id) on delete set null,
  incident_key text not null,
  severity text not null default 'warning',
  area text not null,
  status text not null default 'open',
  title text not null,
  summary text,
  source_event_id text,
  acknowledged_by uuid references public.users(id) on delete set null,
  acknowledged_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint telegram_ops_incidents_key_check check (incident_key ~ '^[a-z0-9_.:-]{3,200}$'),
  constraint telegram_ops_incidents_severity_check check (severity in ('critical', 'warning', 'info')),
  constraint telegram_ops_incidents_area_check check (area in ('orders', 'payments', 'reservations', 'delivery', 'staff', 'inventory', 'menu', 'telegram', 'ai', 'system')),
  constraint telegram_ops_incidents_status_check check (status in ('open', 'acknowledged', 'resolved')),
  constraint telegram_ops_incidents_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists telegram_ops_incidents_restaurant_key_idx
  on public.telegram_ops_incidents (restaurant_id, incident_key);

create index if not exists telegram_ops_incidents_open_idx
  on public.telegram_ops_incidents (restaurant_id, status, severity, last_seen_at desc)
  where status in ('open', 'acknowledged');

create table if not exists public.telegram_owner_briefings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid references public.store_branches(id) on delete set null,
  briefing_key text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  status text not null default 'generated',
  title text not null,
  summary text not null,
  metrics jsonb not null default '{}'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  provider text,
  model text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint telegram_owner_briefings_key_check check (briefing_key ~ '^[a-z0-9_.:-]{3,200}$'),
  constraint telegram_owner_briefings_status_check check (status in ('generated', 'queued', 'sent', 'failed')),
  constraint telegram_owner_briefings_period_check check (period_end > period_start),
  constraint telegram_owner_briefings_metrics_object check (jsonb_typeof(metrics) = 'object'),
  constraint telegram_owner_briefings_actions_array check (jsonb_typeof(actions) = 'array')
);

create unique index if not exists telegram_owner_briefings_restaurant_key_idx
  on public.telegram_owner_briefings (restaurant_id, briefing_key);

create index if not exists telegram_owner_briefings_recent_idx
  on public.telegram_owner_briefings (restaurant_id, created_at desc);

alter table public.telegram_notification_policies enable row level security;
alter table public.telegram_ops_incidents enable row level security;
alter table public.telegram_owner_briefings enable row level security;

revoke all on table public.telegram_notification_policies from anon, authenticated;
revoke all on table public.telegram_ops_incidents from anon, authenticated;
revoke all on table public.telegram_owner_briefings from anon, authenticated;

grant select on table public.telegram_notification_policies to authenticated;
grant select on table public.telegram_ops_incidents to authenticated;
grant select on table public.telegram_owner_briefings to authenticated;

grant all on table public.telegram_notification_policies to service_role;
grant all on table public.telegram_ops_incidents to service_role;
grant all on table public.telegram_owner_briefings to service_role;

drop policy if exists "restaurant users can read telegram notification policies" on public.telegram_notification_policies;
create policy "restaurant users can read telegram notification policies"
on public.telegram_notification_policies for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "restaurant admins can read telegram ops incidents" on public.telegram_ops_incidents;
create policy "restaurant admins can read telegram ops incidents"
on public.telegram_ops_incidents for select
to authenticated
using (
  restaurant_id = app_private.current_restaurant_id()
  and app_private.current_user_role() = 'ADMIN'
);

drop policy if exists "restaurant users can read telegram owner briefings" on public.telegram_owner_briefings;
create policy "restaurant users can read telegram owner briefings"
on public.telegram_owner_briefings for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop trigger if exists telegram_notification_policies_set_updated_at on public.telegram_notification_policies;
create trigger telegram_notification_policies_set_updated_at
before update on public.telegram_notification_policies
for each row execute function public.set_updated_at();

drop trigger if exists telegram_ops_incidents_set_updated_at on public.telegram_ops_incidents;
create trigger telegram_ops_incidents_set_updated_at
before update on public.telegram_ops_incidents
for each row execute function public.set_updated_at();

drop trigger if exists telegram_owner_briefings_set_updated_at on public.telegram_owner_briefings;
create trigger telegram_owner_briefings_set_updated_at
before update on public.telegram_owner_briefings
for each row execute function public.set_updated_at();
