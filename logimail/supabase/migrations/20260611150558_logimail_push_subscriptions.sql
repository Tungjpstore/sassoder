-- LogiMail PWA Web Push subscription registry.
-- Browser clients register through server-owned API routes; the table is not
-- directly writable from anon/authenticated roles.

create schema if not exists logimail;
create schema if not exists logimail_private;

create extension if not exists pgcrypto;

create or replace function logimail_private.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists logimail.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  mailbox_id uuid not null references logimail.mailboxes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  expiration_time timestamptz,
  device_label text,
  platform text,
  permission_state text not null default 'granted',
  enabled boolean not null default true,
  failure_count integer not null default 0,
  last_seen_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_notification_at timestamptz,
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
  constraint push_subscriptions_permission_state_check check (permission_state in ('granted', 'denied', 'default')),
  constraint push_subscriptions_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists push_subscriptions_endpoint_uidx
  on logimail.push_subscriptions (endpoint);

create index if not exists push_subscriptions_mailbox_enabled_idx
  on logimail.push_subscriptions (mailbox_id, enabled, disabled_at, last_seen_at desc);

create index if not exists push_subscriptions_user_enabled_idx
  on logimail.push_subscriptions (user_id, enabled, disabled_at, last_seen_at desc);

create index if not exists push_subscriptions_workspace_enabled_idx
  on logimail.push_subscriptions (workspace_id, enabled, disabled_at, last_seen_at desc);

drop trigger if exists set_push_subscriptions_updated_at on logimail.push_subscriptions;
create trigger set_push_subscriptions_updated_at
before update on logimail.push_subscriptions
for each row execute function logimail_private.set_updated_at();

alter table logimail.push_subscriptions enable row level security;

revoke all on logimail.push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on logimail.push_subscriptions to service_role;

alter default privileges in schema logimail revoke all on tables from public, anon;
