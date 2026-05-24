-- AI Ops insight lifecycle.
-- Deterministic insight generation writes here so dashboard cards, automation,
-- audit and future branch comparison can share the same operational state.

create table if not exists public.ai_operation_insights (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid references public.store_branches(id) on delete set null,
  scope_key text not null default 'restaurant',
  source text not null default 'ai_ops',
  insight_key text not null,
  fingerprint text not null,
  kind text not null,
  severity text not null,
  status text not null default 'active',
  title text not null,
  detail text not null,
  action text not null,
  action_intent text,
  action_href text,
  confidence text not null default 'medium',
  metric_label text,
  metric_value text,
  evidence jsonb not null default '[]'::jsonb,
  deck_generated_at timestamptz not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  seen_at timestamptz,
  dismissed_at timestamptz,
  dismissed_by uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_operation_insights_scope_key_length check (length(trim(scope_key)) between 1 and 120),
  constraint ai_operation_insights_source_check check (source in ('ai_ops', 'automation', 'report', 'manual')),
  constraint ai_operation_insights_key_length check (length(trim(insight_key)) between 1 and 160),
  constraint ai_operation_insights_fingerprint_length check (length(trim(fingerprint)) between 12 and 96),
  constraint ai_operation_insights_kind_check check (kind in ('revenue', 'payment', 'service', 'staffing', 'menu', 'inventory', 'tables', 'promotion')),
  constraint ai_operation_insights_severity_check check (severity in ('critical', 'warning', 'opportunity', 'info')),
  constraint ai_operation_insights_status_check check (status in ('active', 'seen', 'dismissed', 'resolved', 'expired')),
  constraint ai_operation_insights_confidence_check check (confidence in ('high', 'medium', 'low')),
  constraint ai_operation_insights_title_length check (length(trim(title)) between 1 and 180),
  constraint ai_operation_insights_detail_length check (length(trim(detail)) between 1 and 700),
  constraint ai_operation_insights_action_length check (length(trim(action)) between 1 and 700),
  constraint ai_operation_insights_evidence_array check (jsonb_typeof(evidence) = 'array'),
  constraint ai_operation_insights_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint ai_operation_insights_unique unique (restaurant_id, scope_key, source, insight_key)
);

create index if not exists ai_operation_insights_restaurant_status_idx
  on public.ai_operation_insights (restaurant_id, status, severity, last_seen_at desc);

create index if not exists ai_operation_insights_restaurant_branch_idx
  on public.ai_operation_insights (restaurant_id, branch_id, status, last_seen_at desc)
  where branch_id is not null;

create index if not exists ai_operation_insights_restaurant_source_idx
  on public.ai_operation_insights (restaurant_id, source, deck_generated_at desc);

alter table public.ai_operation_insights enable row level security;

revoke all on public.ai_operation_insights from anon;
grant select, insert, update on public.ai_operation_insights to authenticated;
grant select, insert, update, delete on public.ai_operation_insights to service_role;

drop policy if exists "restaurant users read own ai operation insights" on public.ai_operation_insights;
create policy "restaurant users read own ai operation insights"
on public.ai_operation_insights for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "admins create own ai operation insights" on public.ai_operation_insights;
create policy "admins create own ai operation insights"
on public.ai_operation_insights for insert
to authenticated
with check (
  restaurant_id = app_private.current_restaurant_id()
  and app_private.current_user_role() = 'ADMIN'
);

drop policy if exists "admins update own ai operation insights" on public.ai_operation_insights;
create policy "admins update own ai operation insights"
on public.ai_operation_insights for update
to authenticated
using (
  restaurant_id = app_private.current_restaurant_id()
  and app_private.current_user_role() = 'ADMIN'
)
with check (
  restaurant_id = app_private.current_restaurant_id()
  and app_private.current_user_role() = 'ADMIN'
);

drop trigger if exists ai_operation_insights_set_updated_at on public.ai_operation_insights;
create trigger ai_operation_insights_set_updated_at
before update on public.ai_operation_insights
for each row execute function public.set_updated_at();
