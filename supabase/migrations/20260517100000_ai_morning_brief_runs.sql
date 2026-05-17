-- AI Ops Morning Brief delivery ledger.
-- One row per restaurant/scope/day captures deterministic AI Ops summary,
-- delivery status and compact action items for dashboard/admin observability.

create table if not exists public.ai_morning_brief_runs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid references public.store_branches(id) on delete set null,
  scope_key text not null default 'restaurant',
  brief_date date not null,
  source text not null default 'ai_ops_cron',
  channel text not null default 'dashboard',
  status text not null default 'generated',
  restaurant_name text not null,
  recipient_emails text[] not null default '{}'::text[],
  health_score integer not null,
  summary text not null,
  primary_insight_key text,
  insight_count integer not null default 0,
  critical_count integer not null default 0,
  warning_count integer not null default 0,
  opportunity_count integer not null default 0,
  action_items jsonb not null default '[]'::jsonb,
  deck jsonb not null default '{}'::jsonb,
  provider text,
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_morning_brief_runs_scope_key_length check (length(trim(scope_key)) between 1 and 120),
  constraint ai_morning_brief_runs_source_check check (source in ('ai_ops_cron', 'dashboard', 'manual')),
  constraint ai_morning_brief_runs_channel_check check (channel in ('dashboard', 'email')),
  constraint ai_morning_brief_runs_status_check check (status in ('generated', 'sent', 'skipped', 'failed')),
  constraint ai_morning_brief_runs_health_score_check check (health_score between 0 and 100),
  constraint ai_morning_brief_runs_restaurant_name_length check (length(trim(restaurant_name)) between 1 and 180),
  constraint ai_morning_brief_runs_summary_length check (length(trim(summary)) between 1 and 700),
  constraint ai_morning_brief_runs_recipient_count_check check (cardinality(recipient_emails) <= 10),
  constraint ai_morning_brief_runs_counts_check check (
    insight_count >= 0
    and critical_count >= 0
    and warning_count >= 0
    and opportunity_count >= 0
  ),
  constraint ai_morning_brief_runs_action_items_array check (jsonb_typeof(action_items) = 'array'),
  constraint ai_morning_brief_runs_deck_object check (jsonb_typeof(deck) = 'object'),
  constraint ai_morning_brief_runs_error_message_length check (error_message is null or length(trim(error_message)) between 1 and 1000),
  constraint ai_morning_brief_runs_unique unique (restaurant_id, scope_key, source, channel, brief_date)
);

create index if not exists ai_morning_brief_runs_restaurant_date_idx
  on public.ai_morning_brief_runs (restaurant_id, brief_date desc, created_at desc);

create index if not exists ai_morning_brief_runs_status_date_idx
  on public.ai_morning_brief_runs (status, brief_date desc);

alter table public.ai_morning_brief_runs enable row level security;

revoke all on public.ai_morning_brief_runs from anon;
grant select on public.ai_morning_brief_runs to authenticated;
grant select, insert, update, delete on public.ai_morning_brief_runs to service_role;

drop policy if exists "restaurant users read own ai morning brief runs" on public.ai_morning_brief_runs;
create policy "restaurant users read own ai morning brief runs"
on public.ai_morning_brief_runs for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop trigger if exists ai_morning_brief_runs_set_updated_at on public.ai_morning_brief_runs;
create trigger ai_morning_brief_runs_set_updated_at
before update on public.ai_morning_brief_runs
for each row execute function public.set_updated_at();

-- Per-restaurant Morning Brief preferences.
-- Owner settings are separated from delivery runs so retry/cron behavior can be
-- changed without mutating historical brief rows.

create table if not exists public.ai_morning_brief_preferences (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  email_enabled boolean not null default false,
  recipient_emails text[] not null default '{}'::text[],
  send_hour smallint not null default 7,
  timezone text not null default 'Asia/Ho_Chi_Minh',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_morning_brief_preferences_recipient_count_check check (cardinality(recipient_emails) <= 10),
  constraint ai_morning_brief_preferences_send_hour_check check (send_hour between 0 and 23),
  constraint ai_morning_brief_preferences_timezone_length check (length(trim(timezone)) between 1 and 64)
);

create index if not exists ai_morning_brief_preferences_updated_at_idx
  on public.ai_morning_brief_preferences (updated_at desc);

alter table public.ai_morning_brief_preferences enable row level security;

revoke all on public.ai_morning_brief_preferences from anon;
grant select, insert, update on public.ai_morning_brief_preferences to authenticated;
grant select, insert, update, delete on public.ai_morning_brief_preferences to service_role;

drop policy if exists "restaurant users read own ai morning brief preferences" on public.ai_morning_brief_preferences;
create policy "restaurant users read own ai morning brief preferences"
on public.ai_morning_brief_preferences for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "restaurant admins insert own ai morning brief preferences" on public.ai_morning_brief_preferences;
create policy "restaurant admins insert own ai morning brief preferences"
on public.ai_morning_brief_preferences for insert
to authenticated
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

drop policy if exists "restaurant admins update own ai morning brief preferences" on public.ai_morning_brief_preferences;
create policy "restaurant admins update own ai morning brief preferences"
on public.ai_morning_brief_preferences for update
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

drop trigger if exists ai_morning_brief_preferences_set_updated_at on public.ai_morning_brief_preferences;
create trigger ai_morning_brief_preferences_set_updated_at
before update on public.ai_morning_brief_preferences
for each row execute function public.set_updated_at();
