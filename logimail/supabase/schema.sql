-- LogiMail schema MVP.
-- Uu tien chay trong Supabase project rieng. Neu dung chung LogiVN project, chi dung schema logimail.*.

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

create table if not exists logimail.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'viewer')),
  account_status text not null default 'pending' check (account_status in ('pending', 'approved', 'rejected', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists logimail.account_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null check (email = lower(email)),
  full_name text,
  company_name text,
  purpose text,
  requested_workspace_name text,
  requested_slug text check (requested_slug is null or requested_slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists logimail.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  owner_id uuid not null references auth.users(id) on delete cascade,
  plan text not null default 'internal' check (plan in ('internal', 'partner', 'pilot')),
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists logimail.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  unique(workspace_id, user_id)
);

create table if not exists logimail.domains (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  domain text not null check (domain = lower(domain)),
  mail_hostname text check (mail_hostname is null or mail_hostname = lower(mail_hostname)),
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  registration_enabled boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'active', 'warning', 'failed', 'disabled')),
  spf_status text not null default 'unknown' check (spf_status in ('unknown', 'pass', 'fail', 'warning')),
  dkim_status text not null default 'unknown' check (dkim_status in ('unknown', 'pass', 'fail', 'warning')),
  dmarc_status text not null default 'unknown' check (dmarc_status in ('unknown', 'pass', 'fail', 'warning')),
  mx_status text not null default 'unknown' check (mx_status in ('unknown', 'pass', 'fail', 'warning')),
  ptr_status text not null default 'unknown' check (ptr_status in ('unknown', 'pass', 'fail', 'warning')),
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, domain)
);

create table if not exists logimail.domain_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  domain text not null check (domain = lower(domain)),
  mail_hostname text not null check (mail_hostname = lower(mail_hostname)),
  cloudflare_zone_id text,
  purpose text,
  dns_plan jsonb not null default '{}'::jsonb,
  risk_flags text[] not null default '{}'::text[],
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  provisioned_domain_id uuid references logimail.domains(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists logimail.mailboxes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  domain_id uuid not null references logimail.domains(id) on delete cascade,
  email_address text not null unique check (email_address = lower(email_address)),
  display_name text,
  quota_mb integer not null default 1024 check (quota_mb between 128 and 102400),
  status text not null default 'active' check (status in ('active', 'disabled', 'locked', 'pending')),
  provider text not null default 'billionmail' check (provider in ('billionmail')),
  provider_mailbox_id text,
  encrypted_imap_username text,
  encrypted_imap_password text,
  encrypted_smtp_username text,
  encrypted_smtp_password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists logimail.mailbox_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  domain_id uuid not null references logimail.domains(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  local_part text not null check (local_part = lower(local_part)),
  email_address text not null check (email_address = lower(email_address)),
  display_name text,
  quota_mb integer not null default 1024 check (quota_mb between 128 and 102400),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  provisioned_mailbox_id uuid references logimail.mailboxes(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists logimail.mailbox_permissions (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null references logimail.mailboxes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null default 'read' check (permission in ('read', 'send', 'admin')),
  created_at timestamptz not null default now(),
  unique(mailbox_id, user_id)
);

create table if not exists logimail.email_send_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  mailbox_id uuid references logimail.mailboxes(id) on delete set null,
  from_email text not null,
  to_email text not null,
  subject text,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'bounced', 'deferred')),
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists logimail.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references logimail.workspaces(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

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
  permission_state text not null default 'granted' check (permission_state in ('granted', 'denied', 'default')),
  enabled boolean not null default true,
  failure_count integer not null default 0 check (failure_count >= 0),
  last_seen_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_notification_at timestamptz,
  disabled_at timestamptz,
  disabled_reason text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_length check (length(endpoint) between 20 and 2048),
  constraint push_subscriptions_p256dh_length check (length(p256dh) between 20 and 4096),
  constraint push_subscriptions_auth_length check (length(auth) between 8 and 1024)
);

create table if not exists logimail.mail_push_checkpoints (
  mailbox_id uuid primary key references logimail.mailboxes(id) on delete cascade,
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  last_seen_uid integer not null default 0 check (last_seen_uid >= 0),
  last_notified_uid integer not null default 0 check (last_notified_uid >= 0),
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists logimail.mailbox_aliases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  mailbox_id uuid not null references logimail.mailboxes(id) on delete cascade,
  domain_id uuid not null references logimail.domains(id) on delete cascade,
  local_part text not null check (local_part = lower(local_part) and local_part ~ '^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$'),
  alias_email text not null unique check (alias_email = lower(alias_email)),
  display_name text,
  status text not null default 'pending' check (status in ('pending', 'active', 'disabled', 'failed')),
  provider_alias_id text,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(domain_id, local_part)
);

create table if not exists logimail.mail_labels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  mailbox_id uuid not null references logimail.mailboxes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 48),
  color text not null default '#0F4D3A' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(mailbox_id, user_id, name)
);

create table if not exists logimail.mail_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  mailbox_id uuid not null references logimail.mailboxes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  from_contains text,
  subject_contains text,
  action text not null default 'label' check (action in ('label', 'archive', 'mark_read', 'move_spam', 'assign_team')),
  label_id uuid references logimail.mail_labels(id) on delete set null,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists logimail.mail_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  mailbox_id uuid not null references logimail.mailboxes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  to_email text,
  cc text,
  bcc text,
  subject text,
  body_preview text,
  body_sha256 text check (body_sha256 is null or body_sha256 ~ '^[0-9a-f]{64}$'),
  attachment_count integer not null default 0 check (attachment_count >= 0),
  in_reply_to text,
  references_header text,
  status text not null default 'draft' check (status in ('draft', 'sent', 'discarded')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists logimail.team_mailbox_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  mailbox_id uuid not null references logimail.mailboxes(id) on delete cascade,
  message_uid integer check (message_uid is null or message_uid >= 0),
  subject text,
  customer_email text,
  status text not null default 'new' check (status in ('new', 'in_progress', 'waiting', 'done', 'archived')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  due_at timestamptz,
  internal_note text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists logimail.deliverability_checks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  domain_id uuid not null references logimail.domains(id) on delete cascade,
  score integer not null default 0 check (score between 0 and 100),
  mx_status text not null default 'unknown',
  spf_status text not null default 'unknown',
  dkim_status text not null default 'unknown',
  dmarc_status text not null default 'unknown',
  ptr_status text not null default 'unknown',
  bimi_status text not null default 'unknown',
  mta_sts_status text not null default 'unknown',
  spam_rate numeric(6,4),
  notes text,
  checked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists logimail.dmarc_reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  domain_id uuid not null references logimail.domains(id) on delete cascade,
  report_domain text not null,
  source_ip inet,
  disposition text,
  dkim_result text,
  spf_result text,
  message_count integer not null default 0 check (message_count >= 0),
  pass_count integer not null default 0 check (pass_count >= 0),
  fail_count integer not null default 0 check (fail_count >= 0),
  report_start date,
  report_end date,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists logimail.bounce_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  mailbox_id uuid references logimail.mailboxes(id) on delete set null,
  domain_id uuid references logimail.domains(id) on delete set null,
  recipient_email text not null check (recipient_email = lower(recipient_email)),
  sender_email text check (sender_email is null or sender_email = lower(sender_email)),
  subject text,
  bounce_type text not null default 'unknown' check (bounce_type in ('hard', 'soft', 'complaint', 'blocked', 'unknown')),
  smtp_code text,
  reason text,
  provider_message_id text,
  created_at timestamptz not null default now()
);

create table if not exists logimail.backup_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  scope text not null default 'workspace' check (scope in ('workspace', 'domain', 'mailbox')),
  domain_id uuid references logimail.domains(id) on delete set null,
  mailbox_id uuid references logimail.mailboxes(id) on delete set null,
  status text not null default 'requested' check (status in ('requested', 'running', 'completed', 'failed', 'restore_dry_run')),
  requested_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  artifact_uri text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists logimail.quotas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  daily_send_limit integer not null default 500 check (daily_send_limit >= 0),
  monthly_send_limit integer not null default 5000 check (monthly_send_limit >= 0),
  used_today integer not null default 0 check (used_today >= 0),
  used_this_month integer not null default 0 check (used_this_month >= 0),
  updated_at timestamptz not null default now(),
  unique(workspace_id)
);

create table if not exists logimail.security_codes (
  id uuid primary key default gen_random_uuid(),
  domain text check (domain is null or domain = lower(domain)),
  purpose text not null default 'account_access' check (purpose in ('account_access', 'account_signup', 'password_reset')),
  code_hash text not null unique,
  code_ciphertext text,
  code_hint text not null default '',
  status text not null default 'active' check (status in ('active', 'used', 'expired', 'revoked')),
  max_uses integer not null default 1 check (max_uses = 1),
  used_count integer not null default 0 check (used_count >= 0 and used_count <= max_uses),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_by text,
  consumed_by_user_id uuid references auth.users(id) on delete set null,
  consumed_email text check (consumed_email is null or consumed_email = lower(consumed_email)),
  consumed_at timestamptz,
  revoked_by text,
  revoked_at timestamptz,
  replaced_by uuid references logimail.security_codes(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function logimail_private.bootstrap_workspace_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = logimail, public
as $$
begin
  insert into logimail.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (workspace_id, user_id) do update set role = excluded.role;

  insert into logimail.quotas (workspace_id)
  values (new.id)
  on conflict (workspace_id) do nothing;

  return new;
end;
$$;

create index if not exists profiles_email_idx on logimail.profiles (lower(email));
create index if not exists profiles_account_status_idx on logimail.profiles (account_status);
create index if not exists account_requests_user_created_idx on logimail.account_requests (user_id, created_at desc);
create unique index if not exists account_requests_pending_user_uidx on logimail.account_requests (user_id) where status = 'pending';
create index if not exists workspaces_owner_id_idx on logimail.workspaces (owner_id);
create index if not exists workspace_members_user_id_idx on logimail.workspace_members (user_id);
create index if not exists domains_workspace_id_idx on logimail.domains (workspace_id);
create index if not exists domains_registration_lookup_idx on logimail.domains (workspace_id, approval_status, registration_enabled, status);
create index if not exists domain_requests_workspace_created_idx on logimail.domain_requests (workspace_id, created_at desc);
create index if not exists domain_requests_requested_by_idx on logimail.domain_requests (requested_by, created_at desc);
create unique index if not exists domain_requests_pending_workspace_domain_uidx on logimail.domain_requests (workspace_id, domain) where status = 'pending';
create index if not exists mailboxes_workspace_id_idx on logimail.mailboxes (workspace_id);
create index if not exists mailboxes_domain_id_idx on logimail.mailboxes (domain_id);
create index if not exists mailbox_requests_workspace_created_idx on logimail.mailbox_requests (workspace_id, created_at desc);
create index if not exists mailbox_requests_requested_by_idx on logimail.mailbox_requests (requested_by, created_at desc);
create unique index if not exists mailbox_requests_pending_email_uidx on logimail.mailbox_requests (email_address) where status = 'pending';
create index if not exists mailbox_permissions_user_id_idx on logimail.mailbox_permissions (user_id);
create index if not exists email_send_logs_workspace_created_idx on logimail.email_send_logs (workspace_id, created_at desc);
create index if not exists audit_logs_workspace_created_idx on logimail.audit_logs (workspace_id, created_at desc);
create unique index if not exists push_subscriptions_endpoint_uidx on logimail.push_subscriptions (endpoint);
create index if not exists push_subscriptions_mailbox_enabled_idx on logimail.push_subscriptions (mailbox_id, enabled, disabled_at, last_seen_at desc);
create index if not exists push_subscriptions_user_enabled_idx on logimail.push_subscriptions (user_id, enabled, disabled_at, last_seen_at desc);
create index if not exists push_subscriptions_workspace_enabled_idx on logimail.push_subscriptions (workspace_id, enabled, disabled_at, last_seen_at desc);
create index if not exists mail_push_checkpoints_workspace_checked_idx on logimail.mail_push_checkpoints (workspace_id, last_checked_at desc);
create index if not exists mailbox_aliases_workspace_status_idx on logimail.mailbox_aliases (workspace_id, status, created_at desc);
create index if not exists mailbox_aliases_mailbox_idx on logimail.mailbox_aliases (mailbox_id, created_at desc);
create index if not exists mailbox_aliases_domain_local_idx on logimail.mailbox_aliases (domain_id, local_part);
create index if not exists mail_labels_mailbox_user_idx on logimail.mail_labels (mailbox_id, user_id, created_at desc);
create index if not exists mail_rules_mailbox_user_enabled_idx on logimail.mail_rules (mailbox_id, user_id, enabled, created_at desc);
create index if not exists mail_drafts_user_updated_idx on logimail.mail_drafts (user_id, updated_at desc);
create index if not exists team_mailbox_tasks_mailbox_status_idx on logimail.team_mailbox_tasks (mailbox_id, status, priority, created_at desc);
create index if not exists deliverability_checks_domain_created_idx on logimail.deliverability_checks (domain_id, created_at desc);
create index if not exists dmarc_reports_domain_period_idx on logimail.dmarc_reports (domain_id, report_start desc, report_end desc);
create index if not exists bounce_events_workspace_created_idx on logimail.bounce_events (workspace_id, created_at desc);
create index if not exists backup_jobs_workspace_created_idx on logimail.backup_jobs (workspace_id, created_at desc);
create index if not exists security_codes_active_lookup_idx on logimail.security_codes (code_hash, status, expires_at);
create index if not exists security_codes_domain_status_idx on logimail.security_codes (domain, status, expires_at desc);
create index if not exists security_codes_created_idx on logimail.security_codes (created_at desc);
create index if not exists security_codes_consumed_email_idx on logimail.security_codes (consumed_email) where consumed_email is not null;

drop trigger if exists set_profiles_updated_at on logimail.profiles;
create trigger set_profiles_updated_at
before update on logimail.profiles
for each row execute function logimail_private.set_updated_at();

drop trigger if exists set_account_requests_updated_at on logimail.account_requests;
create trigger set_account_requests_updated_at
before update on logimail.account_requests
for each row execute function logimail_private.set_updated_at();

drop trigger if exists set_workspaces_updated_at on logimail.workspaces;
create trigger set_workspaces_updated_at
before update on logimail.workspaces
for each row execute function logimail_private.set_updated_at();

drop trigger if exists bootstrap_workspace_owner_membership on logimail.workspaces;
create trigger bootstrap_workspace_owner_membership
after insert on logimail.workspaces
for each row execute function logimail_private.bootstrap_workspace_owner_membership();

drop trigger if exists set_domains_updated_at on logimail.domains;
create trigger set_domains_updated_at
before update on logimail.domains
for each row execute function logimail_private.set_updated_at();

drop trigger if exists set_domain_requests_updated_at on logimail.domain_requests;
create trigger set_domain_requests_updated_at
before update on logimail.domain_requests
for each row execute function logimail_private.set_updated_at();

drop trigger if exists set_mailboxes_updated_at on logimail.mailboxes;
create trigger set_mailboxes_updated_at
before update on logimail.mailboxes
for each row execute function logimail_private.set_updated_at();

drop trigger if exists set_mailbox_requests_updated_at on logimail.mailbox_requests;
create trigger set_mailbox_requests_updated_at
before update on logimail.mailbox_requests
for each row execute function logimail_private.set_updated_at();

drop trigger if exists set_push_subscriptions_updated_at on logimail.push_subscriptions;
create trigger set_push_subscriptions_updated_at
before update on logimail.push_subscriptions
for each row execute function logimail_private.set_updated_at();

drop trigger if exists set_mail_push_checkpoints_updated_at on logimail.mail_push_checkpoints;
create trigger set_mail_push_checkpoints_updated_at
before update on logimail.mail_push_checkpoints
for each row execute function logimail_private.set_updated_at();

drop trigger if exists set_mailbox_aliases_updated_at on logimail.mailbox_aliases;
create trigger set_mailbox_aliases_updated_at
before update on logimail.mailbox_aliases
for each row execute function logimail_private.set_updated_at();

drop trigger if exists set_mail_labels_updated_at on logimail.mail_labels;
create trigger set_mail_labels_updated_at
before update on logimail.mail_labels
for each row execute function logimail_private.set_updated_at();

drop trigger if exists set_mail_rules_updated_at on logimail.mail_rules;
create trigger set_mail_rules_updated_at
before update on logimail.mail_rules
for each row execute function logimail_private.set_updated_at();

drop trigger if exists set_mail_drafts_updated_at on logimail.mail_drafts;
create trigger set_mail_drafts_updated_at
before update on logimail.mail_drafts
for each row execute function logimail_private.set_updated_at();

drop trigger if exists set_team_mailbox_tasks_updated_at on logimail.team_mailbox_tasks;
create trigger set_team_mailbox_tasks_updated_at
before update on logimail.team_mailbox_tasks
for each row execute function logimail_private.set_updated_at();

drop trigger if exists set_backup_jobs_updated_at on logimail.backup_jobs;
create trigger set_backup_jobs_updated_at
before update on logimail.backup_jobs
for each row execute function logimail_private.set_updated_at();

drop trigger if exists set_security_codes_updated_at on logimail.security_codes;
create trigger set_security_codes_updated_at
before update on logimail.security_codes
for each row execute function logimail_private.set_updated_at();

drop function if exists logimail.bootstrap_workspace_owner_membership();
drop function if exists logimail.set_updated_at();
