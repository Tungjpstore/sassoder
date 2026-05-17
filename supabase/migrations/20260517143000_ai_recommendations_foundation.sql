-- AI recommendation foundation.
-- Stores actionable operating recommendations separately from raw insights so
-- dashboard, automation approval and future personalization can share lifecycle state.

create table if not exists public.ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid references public.store_branches(id) on delete set null,
  scope_key text not null default 'restaurant',
  source text not null default 'ai_ops',
  source_ref_id text,
  recommendation_key text not null,
  fingerprint text not null,
  type text not null,
  priority text not null default 'medium',
  status text not null default 'active',
  title text not null,
  detail text not null,
  action text not null,
  action_href text,
  action_intent text,
  confidence text not null default 'medium',
  estimated_impact_label text,
  estimated_impact_value numeric,
  evidence jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references public.users(id) on delete set null,
  dismissed_at timestamptz,
  dismissed_by uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_recommendations_scope_key_length check (length(trim(scope_key)) between 1 and 120),
  constraint ai_recommendations_source_check check (source in ('ai_ops', 'automation', 'chatbot', 'report', 'manual')),
  constraint ai_recommendations_key_length check (length(trim(recommendation_key)) between 1 and 160),
  constraint ai_recommendations_fingerprint_length check (length(trim(fingerprint)) between 12 and 96),
  constraint ai_recommendations_type_check check (type in ('combo', 'upsell', 'promotion', 'staffing', 'inventory', 'menu', 'payment', 'customer_retention', 'pricing')),
  constraint ai_recommendations_priority_check check (priority in ('critical', 'high', 'medium', 'low')),
  constraint ai_recommendations_status_check check (status in ('active', 'accepted', 'dismissed', 'resolved', 'expired')),
  constraint ai_recommendations_confidence_check check (confidence in ('high', 'medium', 'low')),
  constraint ai_recommendations_title_length check (length(trim(title)) between 1 and 180),
  constraint ai_recommendations_detail_length check (length(trim(detail)) between 1 and 800),
  constraint ai_recommendations_action_length check (length(trim(action)) between 1 and 800),
  constraint ai_recommendations_evidence_array check (jsonb_typeof(evidence) = 'array'),
  constraint ai_recommendations_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint ai_recommendations_unique unique (restaurant_id, scope_key, source, recommendation_key)
);

create index if not exists ai_recommendations_restaurant_status_idx
  on public.ai_recommendations (restaurant_id, status, priority, last_seen_at desc);

create index if not exists ai_recommendations_restaurant_branch_idx
  on public.ai_recommendations (restaurant_id, branch_id, status, last_seen_at desc)
  where branch_id is not null;

create index if not exists ai_recommendations_restaurant_type_idx
  on public.ai_recommendations (restaurant_id, type, status, generated_at desc);

alter table public.ai_recommendations enable row level security;

revoke all on public.ai_recommendations from anon;
grant select, insert, update on public.ai_recommendations to authenticated;
grant select, insert, update, delete on public.ai_recommendations to service_role;

drop policy if exists "restaurant users read own ai recommendations" on public.ai_recommendations;
create policy "restaurant users read own ai recommendations"
on public.ai_recommendations for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "admins create own ai recommendations" on public.ai_recommendations;
create policy "admins create own ai recommendations"
on public.ai_recommendations for insert
to authenticated
with check (
  restaurant_id = app_private.current_restaurant_id()
  and app_private.current_user_role() = 'ADMIN'
);

drop policy if exists "admins update own ai recommendations" on public.ai_recommendations;
create policy "admins update own ai recommendations"
on public.ai_recommendations for update
to authenticated
using (
  restaurant_id = app_private.current_restaurant_id()
  and app_private.current_user_role() = 'ADMIN'
)
with check (
  restaurant_id = app_private.current_restaurant_id()
  and app_private.current_user_role() = 'ADMIN'
);

drop trigger if exists ai_recommendations_set_updated_at on public.ai_recommendations;
create trigger ai_recommendations_set_updated_at
before update on public.ai_recommendations
for each row execute function public.set_updated_at();
