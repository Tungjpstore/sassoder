-- Platform admin RBAC foundation.
-- This keeps the legacy singleton password table as bootstrap/fallback while
-- adding user-scoped sessions, revocation, and role permissions.

create table if not exists public.platform_admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text,
  role text not null default 'readonly',
  status text not null default 'active',
  password_hash text not null,
  password_salt text not null,
  must_change_password boolean not null default false,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text,
  constraint platform_admin_users_email_not_blank check (length(trim(email)) >= 3),
  constraint platform_admin_users_role_check check (role in ('owner', 'ops', 'billing', 'content', 'support', 'readonly')),
  constraint platform_admin_users_status_check check (status in ('active', 'disabled'))
);

create unique index if not exists platform_admin_users_email_lower_idx
  on public.platform_admin_users (lower(email));

create index if not exists platform_admin_users_status_role_idx
  on public.platform_admin_users (status, role, created_at desc);

drop trigger if exists platform_admin_users_set_updated_at on public.platform_admin_users;
create trigger platform_admin_users_set_updated_at
before update on public.platform_admin_users
for each row execute function public.set_updated_at();

create table if not exists public.platform_admin_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.platform_admin_users(id) on delete cascade,
  role text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by text,
  revoked_reason text,
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint platform_admin_sessions_role_check check (role in ('owner', 'ops', 'billing', 'content', 'support', 'readonly')),
  constraint platform_admin_sessions_expiry_check check (expires_at > issued_at)
);

create index if not exists platform_admin_sessions_user_active_idx
  on public.platform_admin_sessions (user_id, expires_at desc)
  where revoked_at is null;

create index if not exists platform_admin_sessions_expires_idx
  on public.platform_admin_sessions (expires_at);

create table if not exists public.platform_admin_role_permissions (
  role text not null,
  permission text not null,
  created_at timestamptz not null default now(),
  primary key (role, permission),
  constraint platform_admin_role_permissions_role_check check (role in ('owner', 'ops', 'billing', 'content', 'support', 'readonly'))
);

create index if not exists platform_admin_role_permissions_permission_idx
  on public.platform_admin_role_permissions (permission, role);

create table if not exists public.platform_admin_session_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.platform_admin_sessions(id) on delete set null,
  user_id uuid references public.platform_admin_users(id) on delete set null,
  event text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint platform_admin_session_events_event_check check (
    event in ('login', 'logout', 'password_changed', 'session_revoked', 'login_failed')
  )
);

create index if not exists platform_admin_session_events_user_created_idx
  on public.platform_admin_session_events (user_id, created_at desc);

create index if not exists platform_admin_session_events_session_created_idx
  on public.platform_admin_session_events (session_id, created_at desc);

alter table public.platform_admin_users enable row level security;
alter table public.platform_admin_sessions enable row level security;
alter table public.platform_admin_role_permissions enable row level security;
alter table public.platform_admin_session_events enable row level security;

revoke all on table public.platform_admin_users from anon;
revoke all on table public.platform_admin_users from authenticated;
revoke all on table public.platform_admin_sessions from anon;
revoke all on table public.platform_admin_sessions from authenticated;
revoke all on table public.platform_admin_role_permissions from anon;
revoke all on table public.platform_admin_role_permissions from authenticated;
revoke all on table public.platform_admin_session_events from anon;
revoke all on table public.platform_admin_session_events from authenticated;

insert into public.platform_admin_role_permissions (role, permission)
values
  ('owner', 'platform.read'),
  ('owner', 'platform.refresh'),
  ('owner', 'content.write'),
  ('owner', 'billing.write'),
  ('owner', 'tenants.write'),
  ('owner', 'users.write'),
  ('owner', 'security.read'),
  ('owner', 'release.read'),
  ('owner', 'governance.read'),
  ('owner', 'sessions.revoke'),
  ('owner', 'admins.manage'),

  ('ops', 'platform.read'),
  ('ops', 'platform.refresh'),
  ('ops', 'security.read'),
  ('ops', 'release.read'),
  ('ops', 'governance.read'),
  ('ops', 'sessions.revoke'),

  ('billing', 'platform.read'),
  ('billing', 'platform.refresh'),
  ('billing', 'billing.write'),
  ('billing', 'governance.read'),

  ('content', 'platform.read'),
  ('content', 'platform.refresh'),
  ('content', 'content.write'),
  ('content', 'governance.read'),

  ('support', 'platform.read'),
  ('support', 'platform.refresh'),
  ('support', 'tenants.write'),
  ('support', 'users.write'),
  ('support', 'governance.read'),

  ('readonly', 'platform.read'),
  ('readonly', 'governance.read')
on conflict (role, permission) do nothing;

insert into public.platform_audit_logs (actor, action, target_type, metadata)
values (
  'migration',
  'platform_admin_rbac_foundation_created',
  'platform_admin_rbac',
  jsonb_build_object(
    'roles', jsonb_build_array('owner', 'ops', 'billing', 'content', 'support', 'readonly'),
    'bootstrapFallback', 'platform_admin_credentials'
  )
);
