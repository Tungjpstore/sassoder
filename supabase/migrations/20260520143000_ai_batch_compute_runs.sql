-- AI batch compute runs for DSX Air / NVIDIA-backed background jobs.

create table if not exists public.ai_batch_compute_runs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  job_kind text not null,
  status text not null,
  provider text not null,
  model text,
  title text not null,
  output_text text,
  raw_output jsonb not null default '{}'::jsonb,
  input_tokens integer,
  output_tokens integer,
  estimated_cost_vnd integer,
  latency_ms integer,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_batch_compute_runs_job_kind_check check (
    job_kind in ('operations_report', 'inventory_analysis', 'marketing_seo', 'memory_brief')
  ),
  constraint ai_batch_compute_runs_status_check check (status in ('success', 'failed')),
  constraint ai_batch_compute_runs_provider_length check (length(trim(provider)) between 1 and 80),
  constraint ai_batch_compute_runs_title_length check (length(trim(title)) between 1 and 180),
  constraint ai_batch_compute_runs_raw_output_object check (jsonb_typeof(raw_output) = 'object'),
  constraint ai_batch_compute_runs_token_nonnegative check (
    (input_tokens is null or input_tokens >= 0) and
    (output_tokens is null or output_tokens >= 0) and
    (estimated_cost_vnd is null or estimated_cost_vnd >= 0) and
    (latency_ms is null or latency_ms >= 0)
  ),
  constraint ai_batch_compute_runs_error_length check (error_message is null or length(trim(error_message)) between 1 and 1000)
);

create index if not exists ai_batch_compute_runs_restaurant_job_idx
  on public.ai_batch_compute_runs (restaurant_id, job_kind, created_at desc);

create index if not exists ai_batch_compute_runs_status_provider_idx
  on public.ai_batch_compute_runs (status, provider, created_at desc);

alter table public.ai_batch_compute_runs enable row level security;

revoke all on public.ai_batch_compute_runs from anon;
grant select on public.ai_batch_compute_runs to authenticated;
grant select, insert, update, delete on public.ai_batch_compute_runs to service_role;

drop policy if exists "restaurant users read own ai batch compute runs" on public.ai_batch_compute_runs;
create policy "restaurant users read own ai batch compute runs"
on public.ai_batch_compute_runs for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop trigger if exists ai_batch_compute_runs_set_updated_at on public.ai_batch_compute_runs;
create trigger ai_batch_compute_runs_set_updated_at
before update on public.ai_batch_compute_runs
for each row execute function public.set_updated_at();
