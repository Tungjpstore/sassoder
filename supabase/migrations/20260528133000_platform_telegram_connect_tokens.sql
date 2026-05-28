-- One-time connect links for LogiVN internal DevOps Telegram accounts.
-- These tokens are generated from admin.logivn.com and claimed by the separate
-- platform Telegram bot. Plain token values are never stored in Postgres.

create table if not exists public.platform_telegram_connection_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  platform_admin_user_id uuid references public.platform_admin_users(id) on delete set null,
  platform_admin_session_id uuid references public.platform_admin_sessions(id) on delete set null,
  actor text not null,
  admin_role text not null,
  telegram_role text not null default 'DEV',
  scopes text[] not null default array['infra.read', 'queues.read', 'incidents.read']::text[],
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_telegram_user_id bigint,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint platform_telegram_connection_tokens_actor_length check (char_length(trim(actor)) between 3 and 180),
  constraint platform_telegram_connection_tokens_admin_role_check check (admin_role in ('owner', 'ops', 'billing', 'content', 'support', 'readonly')),
  constraint platform_telegram_connection_tokens_telegram_role_check check (telegram_role in ('DEV', 'SUPPORT', 'SRE', 'ADMIN')),
  constraint platform_telegram_connection_tokens_scopes_shape check (array_length(scopes, 1) is not null and array_length(scopes, 1) between 1 and 80),
  constraint platform_telegram_connection_tokens_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint platform_telegram_connection_tokens_consumed_pair check (
    (consumed_at is null and consumed_by_telegram_user_id is null)
    or (consumed_at is not null and consumed_by_telegram_user_id is not null)
  )
);

create index if not exists platform_telegram_connection_tokens_active_user_idx
  on public.platform_telegram_connection_tokens (platform_admin_user_id, expires_at desc)
  where consumed_at is null and revoked_at is null;

create index if not exists platform_telegram_connection_tokens_active_actor_idx
  on public.platform_telegram_connection_tokens (actor, expires_at desc)
  where consumed_at is null and revoked_at is null;

create index if not exists platform_telegram_connection_tokens_consumed_idx
  on public.platform_telegram_connection_tokens (consumed_by_telegram_user_id, consumed_at desc)
  where consumed_at is not null;

alter table public.platform_telegram_connection_tokens enable row level security;

revoke all on table public.platform_telegram_connection_tokens from anon, authenticated;
grant all on table public.platform_telegram_connection_tokens to service_role;

insert into public.platform_audit_logs (actor, action, target_type, metadata)
values (
  'migration',
  'platform_telegram_connection_tokens_created',
  'platform_telegram_connection_token',
  jsonb_build_object('source', 'admin.logivn.com', 'ttlSeconds', 600)
);
