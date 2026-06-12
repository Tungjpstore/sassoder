-- LogiMail product upgrade batch: mailbox UX, team inbox, deliverability, and backup metadata.

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

drop trigger if exists set_mailbox_aliases_updated_at on logimail.mailbox_aliases;
create trigger set_mailbox_aliases_updated_at before update on logimail.mailbox_aliases for each row execute function logimail_private.set_updated_at();
drop trigger if exists set_mail_labels_updated_at on logimail.mail_labels;
create trigger set_mail_labels_updated_at before update on logimail.mail_labels for each row execute function logimail_private.set_updated_at();
drop trigger if exists set_mail_rules_updated_at on logimail.mail_rules;
create trigger set_mail_rules_updated_at before update on logimail.mail_rules for each row execute function logimail_private.set_updated_at();
drop trigger if exists set_mail_drafts_updated_at on logimail.mail_drafts;
create trigger set_mail_drafts_updated_at before update on logimail.mail_drafts for each row execute function logimail_private.set_updated_at();
drop trigger if exists set_team_mailbox_tasks_updated_at on logimail.team_mailbox_tasks;
create trigger set_team_mailbox_tasks_updated_at before update on logimail.team_mailbox_tasks for each row execute function logimail_private.set_updated_at();
drop trigger if exists set_backup_jobs_updated_at on logimail.backup_jobs;
create trigger set_backup_jobs_updated_at before update on logimail.backup_jobs for each row execute function logimail_private.set_updated_at();

alter table logimail.mailbox_aliases enable row level security;
alter table logimail.mail_labels enable row level security;
alter table logimail.mail_rules enable row level security;
alter table logimail.mail_drafts enable row level security;
alter table logimail.team_mailbox_tasks enable row level security;
alter table logimail.deliverability_checks enable row level security;
alter table logimail.dmarc_reports enable row level security;
alter table logimail.bounce_events enable row level security;
alter table logimail.backup_jobs enable row level security;

drop policy if exists mailbox_aliases_select_member on logimail.mailbox_aliases;
create policy mailbox_aliases_select_member on logimail.mailbox_aliases for select using (logimail_private.is_workspace_member(workspace_id));
drop policy if exists mail_labels_select_owner on logimail.mail_labels;
create policy mail_labels_select_owner on logimail.mail_labels for select using (user_id = (select auth.uid()) or logimail_private.can_access_mailbox(mailbox_id));
drop policy if exists mail_rules_select_owner on logimail.mail_rules;
create policy mail_rules_select_owner on logimail.mail_rules for select using (user_id = (select auth.uid()) or logimail_private.can_access_mailbox(mailbox_id));
drop policy if exists mail_drafts_select_owner on logimail.mail_drafts;
create policy mail_drafts_select_owner on logimail.mail_drafts for select using (user_id = (select auth.uid()));
drop policy if exists team_mailbox_tasks_select_member on logimail.team_mailbox_tasks;
create policy team_mailbox_tasks_select_member on logimail.team_mailbox_tasks for select using (logimail_private.is_workspace_member(workspace_id) or logimail_private.can_access_mailbox(mailbox_id));
drop policy if exists deliverability_checks_select_member on logimail.deliverability_checks;
create policy deliverability_checks_select_member on logimail.deliverability_checks for select using (logimail_private.is_workspace_member(workspace_id));
drop policy if exists dmarc_reports_select_member on logimail.dmarc_reports;
create policy dmarc_reports_select_member on logimail.dmarc_reports for select using (logimail_private.is_workspace_member(workspace_id));
drop policy if exists bounce_events_select_member on logimail.bounce_events;
create policy bounce_events_select_member on logimail.bounce_events for select using (logimail_private.is_workspace_member(workspace_id));
drop policy if exists backup_jobs_select_member on logimail.backup_jobs;
create policy backup_jobs_select_member on logimail.backup_jobs for select using (logimail_private.is_workspace_member(workspace_id));

revoke all on logimail.mailbox_aliases, logimail.mail_labels, logimail.mail_rules, logimail.mail_drafts, logimail.team_mailbox_tasks, logimail.deliverability_checks, logimail.dmarc_reports, logimail.bounce_events, logimail.backup_jobs from public, anon;
grant select on logimail.mailbox_aliases, logimail.mail_labels, logimail.mail_rules, logimail.mail_drafts, logimail.team_mailbox_tasks, logimail.deliverability_checks, logimail.dmarc_reports, logimail.bounce_events, logimail.backup_jobs to authenticated;
grant select, insert, update, delete on logimail.mailbox_aliases, logimail.mail_labels, logimail.mail_rules, logimail.mail_drafts, logimail.team_mailbox_tasks, logimail.deliverability_checks, logimail.dmarc_reports, logimail.bounce_events, logimail.backup_jobs to service_role;
