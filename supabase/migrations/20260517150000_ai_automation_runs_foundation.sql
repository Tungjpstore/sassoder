-- AI automation workflow run foundation.
-- Persists suggested AI workflows and approval state without executing risky actions automatically.

create table if not exists public.ai_automation_rules (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid references public.store_branches(id) on delete set null,
  rule_key text not null,
  domain text not null,
  title text not null,
  description text,
  enabled boolean not null default true,
  execution_mode text not null default 'confirm_first',
  trigger_config jsonb not null default '{}'::jsonb,
  action_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_automation_rules_domain_check check (domain in ('inventory', 'marketing', 'staffing')),
  constraint ai_automation_rules_execution_mode_check check (execution_mode in ('confirm_first', 'manual_only')),
  constraint ai_automation_rules_unique unique (restaurant_id, rule_key),
  constraint ai_automation_rules_trigger_object check (jsonb_typeof(trigger_config) = 'object'),
  constraint ai_automation_rules_action_object check (jsonb_typeof(action_config) = 'object')
);

create table if not exists public.ai_automation_runs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid references public.store_branches(id) on delete set null,
  rule_id uuid references public.ai_automation_rules(id) on delete set null,
  scope_key text not null default 'restaurant',
  source text not null default 'ai_ops',
  workflow_key text not null,
  fingerprint text not null,
  domain text not null,
  title text not null,
  trigger text not null,
  outcome text not null,
  priority text not null,
  confidence text not null,
  execution_mode text not null,
  status text not null default 'pending_confirmation',
  estimated_minutes integer not null default 0,
  evidence jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references public.users(id) on delete set null,
  dismissed_at timestamptz,
  dismissed_by uuid references public.users(id) on delete set null,
  completed_at timestamptz,
  completed_by uuid references public.users(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_automation_runs_scope_key_length check (length(trim(scope_key)) between 1 and 120),
  constraint ai_automation_runs_source_check check (source in ('ai_ops', 'chatbot', 'cron', 'manual')),
  constraint ai_automation_runs_key_length check (length(trim(workflow_key)) between 1 and 160),
  constraint ai_automation_runs_fingerprint_length check (length(trim(fingerprint)) between 12 and 96),
  constraint ai_automation_runs_domain_check check (domain in ('inventory', 'marketing', 'staffing')),
  constraint ai_automation_runs_priority_check check (priority in ('critical', 'high', 'medium')),
  constraint ai_automation_runs_confidence_check check (confidence in ('high', 'medium')),
  constraint ai_automation_runs_execution_mode_check check (execution_mode in ('confirm_first', 'manual_only')),
  constraint ai_automation_runs_status_check check (status in ('pending_confirmation', 'approved', 'dismissed', 'completed', 'expired', 'manual')),
  constraint ai_automation_runs_evidence_array check (jsonb_typeof(evidence) = 'array'),
  constraint ai_automation_runs_actions_array check (jsonb_typeof(actions) = 'array'),
  constraint ai_automation_runs_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint ai_automation_runs_unique unique (restaurant_id, scope_key, source, workflow_key)
);

create table if not exists public.ai_automation_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ai_automation_runs(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  step_key text not null,
  position integer not null default 0,
  label text not null,
  description text not null,
  status text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_automation_steps_status_check check (status in ('queued', 'ready', 'needs_confirmation', 'manual', 'done', 'blocked')),
  constraint ai_automation_steps_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint ai_automation_steps_unique unique (run_id, step_key)
);

create table if not exists public.ai_automation_approvals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ai_automation_runs(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  approval_key text not null,
  status text not null default 'pending',
  requested_reason text not null,
  approved_at timestamptz,
  approved_by uuid references public.users(id) on delete set null,
  rejected_at timestamptz,
  rejected_by uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_automation_approvals_status_check check (status in ('pending', 'approved', 'rejected', 'expired')),
  constraint ai_automation_approvals_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint ai_automation_approvals_unique unique (run_id, approval_key)
);

create index if not exists ai_automation_runs_restaurant_status_idx
  on public.ai_automation_runs (restaurant_id, status, priority, last_seen_at desc);

create index if not exists ai_automation_steps_run_idx
  on public.ai_automation_steps (run_id, position asc);

create index if not exists ai_automation_approvals_run_idx
  on public.ai_automation_approvals (run_id, status);

alter table public.ai_automation_rules enable row level security;
alter table public.ai_automation_runs enable row level security;
alter table public.ai_automation_steps enable row level security;
alter table public.ai_automation_approvals enable row level security;

revoke all on public.ai_automation_rules from anon;
revoke all on public.ai_automation_runs from anon;
revoke all on public.ai_automation_steps from anon;
revoke all on public.ai_automation_approvals from anon;

grant select, insert, update on public.ai_automation_rules to authenticated;
grant select, insert, update on public.ai_automation_runs to authenticated;
grant select, insert, update on public.ai_automation_steps to authenticated;
grant select, insert, update on public.ai_automation_approvals to authenticated;

grant select, insert, update, delete on public.ai_automation_rules to service_role;
grant select, insert, update, delete on public.ai_automation_runs to service_role;
grant select, insert, update, delete on public.ai_automation_steps to service_role;
grant select, insert, update, delete on public.ai_automation_approvals to service_role;

drop policy if exists "restaurant users read own ai automation rules" on public.ai_automation_rules;
create policy "restaurant users read own ai automation rules"
on public.ai_automation_rules for select to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "admins manage own ai automation rules" on public.ai_automation_rules;
create policy "admins manage own ai automation rules"
on public.ai_automation_rules for all to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

drop policy if exists "restaurant users read own ai automation runs" on public.ai_automation_runs;
create policy "restaurant users read own ai automation runs"
on public.ai_automation_runs for select to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "admins manage own ai automation runs" on public.ai_automation_runs;
create policy "admins manage own ai automation runs"
on public.ai_automation_runs for all to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

drop policy if exists "restaurant users read own ai automation steps" on public.ai_automation_steps;
create policy "restaurant users read own ai automation steps"
on public.ai_automation_steps for select to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "admins manage own ai automation steps" on public.ai_automation_steps;
create policy "admins manage own ai automation steps"
on public.ai_automation_steps for all to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

drop policy if exists "restaurant users read own ai automation approvals" on public.ai_automation_approvals;
create policy "restaurant users read own ai automation approvals"
on public.ai_automation_approvals for select to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "admins manage own ai automation approvals" on public.ai_automation_approvals;
create policy "admins manage own ai automation approvals"
on public.ai_automation_approvals for all to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

drop trigger if exists ai_automation_rules_set_updated_at on public.ai_automation_rules;
create trigger ai_automation_rules_set_updated_at
before update on public.ai_automation_rules
for each row execute function public.set_updated_at();

drop trigger if exists ai_automation_runs_set_updated_at on public.ai_automation_runs;
create trigger ai_automation_runs_set_updated_at
before update on public.ai_automation_runs
for each row execute function public.set_updated_at();

drop trigger if exists ai_automation_steps_set_updated_at on public.ai_automation_steps;
create trigger ai_automation_steps_set_updated_at
before update on public.ai_automation_steps
for each row execute function public.set_updated_at();

drop trigger if exists ai_automation_approvals_set_updated_at on public.ai_automation_approvals;
create trigger ai_automation_approvals_set_updated_at
before update on public.ai_automation_approvals
for each row execute function public.set_updated_at();
