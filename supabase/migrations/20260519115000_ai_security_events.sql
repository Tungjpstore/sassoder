-- Security audit stream for AI tool isolation, approval replay, OCR guardrails and automation safety.

create table if not exists public.ai_security_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  customer_session_id text,
  surface text not null,
  event_type text not null,
  severity text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ai_security_events_surface_check check (surface in ('owner', 'customer', 'dashboard', 'admin', 'system')),
  constraint ai_security_events_severity_check check (severity in ('low', 'medium', 'high', 'critical')),
  constraint ai_security_events_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists ai_security_events_restaurant_created_idx
  on public.ai_security_events (restaurant_id, created_at desc);

create index if not exists ai_security_events_type_severity_idx
  on public.ai_security_events (event_type, severity, created_at desc);

alter table public.ai_security_events enable row level security;

revoke all on public.ai_security_events from anon;
revoke all on public.ai_security_events from authenticated;
grant select, insert, update, delete on public.ai_security_events to service_role;
