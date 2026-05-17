-- Marketing conversion funnel: waitlist lead capture and lightweight CTA analytics.
-- Public pages write through server routes with service_role only; anon/authenticated cannot read leads or events.

create table if not exists public.marketing_waitlist_leads (
  id uuid primary key default gen_random_uuid(),
  lead_identity_hash text not null unique,
  restaurant_name text,
  contact text not null,
  contact_email text,
  contact_phone text,
  business_type text not null default 'cafe',
  pilot_goal text not null default 'qr-ordering',
  selected_plan text not null default 'pro',
  source text not null default 'waitlist',
  variant text not null default 'direct',
  page_path text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  status text not null default 'captured',
  nurture_stage text not null default 'captured',
  submission_count integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_submitted_at timestamptz not null default now(),
  constraint marketing_waitlist_leads_hash_check check (lead_identity_hash ~ '^[a-f0-9]{64}$'),
  constraint marketing_waitlist_leads_contact_check check (length(trim(contact)) between 3 and 180),
  constraint marketing_waitlist_leads_business_type_check check (business_type in ('cafe', 'milk-tea', 'restaurant', 'small-eatery', 'chain')),
  constraint marketing_waitlist_leads_pilot_goal_check check (pilot_goal in ('qr-ordering', 'ai-operations', 'staff-inventory')),
  constraint marketing_waitlist_leads_selected_plan_check check (selected_plan in ('pro', 'premium')),
  constraint marketing_waitlist_leads_status_check check (status in ('captured', 'qualified', 'contacted', 'signed_up', 'archived')),
  constraint marketing_waitlist_leads_submission_count_check check (submission_count >= 1)
);

create index if not exists marketing_waitlist_leads_created_idx
  on public.marketing_waitlist_leads (created_at desc);

create index if not exists marketing_waitlist_leads_status_goal_idx
  on public.marketing_waitlist_leads (status, pilot_goal, created_at desc);

create index if not exists marketing_waitlist_leads_source_variant_idx
  on public.marketing_waitlist_leads (source, variant, created_at desc);

create table if not exists public.marketing_funnel_events (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  event_name text not null,
  page_path text,
  source text,
  variant text,
  target_href text,
  target_text text,
  plan_code text,
  lead_id uuid references public.marketing_waitlist_leads(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  user_agent text,
  ip_hash text,
  created_at timestamptz not null default now(),
  constraint marketing_funnel_events_session_check check (length(trim(session_id)) between 8 and 120),
  constraint marketing_funnel_events_name_check check (event_name ~ '^[a-z0-9_.:-]{2,80}$'),
  constraint marketing_funnel_events_ip_hash_check check (ip_hash is null or ip_hash ~ '^[a-f0-9]{64}$')
);

create index if not exists marketing_funnel_events_created_idx
  on public.marketing_funnel_events (created_at desc);

create index if not exists marketing_funnel_events_session_idx
  on public.marketing_funnel_events (session_id, created_at desc);

create index if not exists marketing_funnel_events_page_event_idx
  on public.marketing_funnel_events (page_path, event_name, created_at desc);

alter table public.marketing_waitlist_leads enable row level security;
alter table public.marketing_funnel_events enable row level security;

revoke all on public.marketing_waitlist_leads from anon, authenticated;
revoke all on public.marketing_funnel_events from anon, authenticated;

grant select, insert, update on public.marketing_waitlist_leads to service_role;
grant select, insert on public.marketing_funnel_events to service_role;

drop trigger if exists marketing_waitlist_leads_set_updated_at on public.marketing_waitlist_leads;
create trigger marketing_waitlist_leads_set_updated_at
before update on public.marketing_waitlist_leads
for each row execute function public.set_updated_at();
