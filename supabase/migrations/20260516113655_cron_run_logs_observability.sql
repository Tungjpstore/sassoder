-- Platform cron run observability.
-- Cron routes write here through service-role so /admin/ops can show last run,
-- duration, outcome and failure details without exposing tenant data.

create table if not exists public.cron_run_logs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null,
  job_path text not null,
  status text not null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  duration_ms integer not null,
  deployment_id text,
  region text,
  result_summary jsonb not null default '{}'::jsonb,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint cron_run_logs_job_key_length check (length(trim(job_key)) between 1 and 120),
  constraint cron_run_logs_job_path_length check (length(trim(job_path)) between 1 and 240),
  constraint cron_run_logs_status_check check (status in ('success', 'warn', 'error')),
  constraint cron_run_logs_duration_check check (duration_ms >= 0),
  constraint cron_run_logs_result_summary_object check (jsonb_typeof(result_summary) = 'object'),
  constraint cron_run_logs_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint cron_run_logs_error_message_length check (error_message is null or length(trim(error_message)) between 1 and 1000)
);

create index if not exists cron_run_logs_job_started_idx
  on public.cron_run_logs (job_key, started_at desc);

create index if not exists cron_run_logs_status_started_idx
  on public.cron_run_logs (status, started_at desc);

alter table public.cron_run_logs enable row level security;

revoke all on public.cron_run_logs from anon;
revoke all on public.cron_run_logs from authenticated;
grant select, insert, update, delete on public.cron_run_logs to service_role;
