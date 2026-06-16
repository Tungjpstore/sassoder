-- LogiMail deliverability + multi-domain + security foundation migration.
-- Spec: logimail-deliverability-multidomain · Task 1.
-- All objects live in the logimail schema only (Requirement 21.1).

-- ---------------------------------------------------------------------------
-- 1. Sending_Domain: extend domains for subdomain stream + auth caches + IP
-- ---------------------------------------------------------------------------
alter table logimail.domains
  add column if not exists parent_domain_id uuid references logimail.domains(id) on delete cascade,
  add column if not exists stream_type text not null default 'transactional'
    check (stream_type in ('transactional', 'marketing')),
  add column if not exists bimi_status text not null default 'unknown'
    check (bimi_status in ('unknown', 'pass', 'fail', 'warning')),
  add column if not exists mta_sts_status text not null default 'unknown'
    check (mta_sts_status in ('unknown', 'pass', 'fail', 'warning')),
  add column if not exists sending_ip inet;

-- credential key version for envelope encryption rotation (Requirement 13/14)
alter table logimail.mailboxes
  add column if not exists credential_key_version integer;

-- ---------------------------------------------------------------------------
-- 2. Encryption keys registry (Requirement 13, 14)
-- ---------------------------------------------------------------------------
create table if not exists logimail.encryption_keys (
  version integer primary key,
  status text not null default 'active' check (status in ('active', 'retiring', 'retired')),
  created_at timestamptz not null default now(),
  retired_at timestamptz
);

-- ---------------------------------------------------------------------------
-- 3. DKIM selectors (Requirement 1, 14) — holds private key, service-role only
-- ---------------------------------------------------------------------------
create table if not exists logimail.dkim_selectors (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  domain_id uuid not null references logimail.domains(id) on delete cascade,
  selector text not null
    check (selector = lower(selector) and length(selector) between 1 and 63
      and selector ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'),
  public_key text not null,
  encrypted_private_key text,
  credential_key_version integer references logimail.encryption_keys(version),
  key_source text not null check (key_source in ('billionmail', 'logimail')),
  status text not null default 'active' check (status in ('active', 'retired')),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (domain_id, selector)
);

-- ---------------------------------------------------------------------------
-- 4. Per-Sending_Domain quota (Requirement 4, 18)
-- ---------------------------------------------------------------------------
create table if not exists logimail.domain_quotas (
  domain_id uuid primary key references logimail.domains(id) on delete cascade,
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  daily_send_limit integer not null default 200 check (daily_send_limit >= 0),
  used_today integer not null default 0 check (used_today >= 0),
  usage_date date not null default current_date,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. Warm-up plans (Requirement 4)
-- ---------------------------------------------------------------------------
create table if not exists logimail.warmup_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  domain_id uuid not null references logimail.domains(id) on delete cascade,
  start_limit integer not null default 50 check (start_limit > 0),
  daily_multiplier numeric(5,2) not null default 2.0 check (daily_multiplier >= 1.0),
  target_limit integer not null check (target_limit > 0),
  current_day integer not null default 1 check (current_day >= 1),
  status text not null default 'active' check (status in ('active', 'completed', 'paused')),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 6. Suppression list (Requirement 5)
-- ---------------------------------------------------------------------------
create table if not exists logimail.suppression_list (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  recipient_email text not null check (recipient_email = lower(recipient_email)),
  reason text not null check (reason in ('hard_bounce', 'complaint', 'manual')),
  source_event_id uuid references logimail.bounce_events(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (workspace_id, recipient_email)
);

-- bounce dedupe (Requirement 5.2) — provider_message_id already exists on bounce_events
create unique index if not exists bounce_events_provider_msg_uidx
  on logimail.bounce_events (provider_message_id)
  where provider_message_id is not null;

-- dmarc summary pagination support (Requirement 6.6)
create index if not exists dmarc_reports_domain_created_idx
  on logimail.dmarc_reports (domain_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 7. Operational: alerts, runbook runs, seed placement tests (Req 7, 11, 12)
-- ---------------------------------------------------------------------------
create table if not exists logimail.alerts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references logimail.workspaces(id) on delete cascade,
  kind text not null check (kind in ('bounce_rate', 'sla_breach', 'anti_abuse', 'dns', 'deliverability')),
  severity text not null check (severity in ('info', 'warning', 'critical')),
  message text not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists logimail.runbook_runs (
  id uuid primary key default gen_random_uuid(),
  runbook_key text not null,
  actor_id uuid references auth.users(id) on delete set null,
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array'),
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists logimail.seed_placement_tests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references logimail.workspaces(id) on delete cascade,
  domain_id uuid not null references logimail.domains(id) on delete cascade,
  marker text not null,
  results jsonb not null default '[]'::jsonb check (jsonb_typeof(results) = 'array'),
  inbox_rate numeric(6,4),
  status text not null default 'pending' check (status in ('pending', 'collected', 'failed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 8. Audit immutability (Requirement 17.2)
-- ---------------------------------------------------------------------------
create or replace rule logimail_audit_logs_no_update as
  on update to logimail.audit_logs do instead nothing;
create or replace rule logimail_audit_logs_no_delete as
  on delete to logimail.audit_logs do instead nothing;

-- ---------------------------------------------------------------------------
-- 9. RLS + grants (consistent with existing logimail policies)
-- ---------------------------------------------------------------------------
alter table logimail.dkim_selectors enable row level security;
alter table logimail.domain_quotas enable row level security;
alter table logimail.warmup_plans enable row level security;
alter table logimail.suppression_list enable row level security;
alter table logimail.alerts enable row level security;
alter table logimail.runbook_runs enable row level security;
alter table logimail.seed_placement_tests enable row level security;
alter table logimail.encryption_keys enable row level security;

-- Member-readable operational tables (no secrets).
create policy domain_quotas_select_member on logimail.domain_quotas
  for select using (logimail_private.is_workspace_member(workspace_id));
create policy warmup_plans_select_member on logimail.warmup_plans
  for select using (logimail_private.is_workspace_member(workspace_id));
create policy suppression_list_select_member on logimail.suppression_list
  for select using (logimail_private.is_workspace_member(workspace_id));
create policy alerts_select_member on logimail.alerts
  for select using (workspace_id is null or logimail_private.is_workspace_member(workspace_id));
create policy seed_placement_tests_select_member on logimail.seed_placement_tests
  for select using (logimail_private.is_workspace_member(workspace_id));

-- dkim_selectors holds the encrypted private key: service-role only (no authenticated select).
-- encryption_keys and runbook_runs are platform-ops only: service-role only.

grant select on
  logimail.domain_quotas,
  logimail.warmup_plans,
  logimail.suppression_list,
  logimail.alerts,
  logimail.seed_placement_tests
  to authenticated;

grant select, insert, update, delete on
  logimail.dkim_selectors,
  logimail.domain_quotas,
  logimail.warmup_plans,
  logimail.suppression_list,
  logimail.alerts,
  logimail.runbook_runs,
  logimail.seed_placement_tests,
  logimail.encryption_keys
  to service_role;

-- Seed the first encryption key version if none exists.
insert into logimail.encryption_keys (version, status)
  values (1, 'active')
  on conflict (version) do nothing;
