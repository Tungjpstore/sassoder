-- Backup & Disaster Recovery foundation for LogiVN.
-- The VPS backup executor writes here with service-role/PostgREST so the
-- platform control center can show RPO, backup history and restore-test status.

create table if not exists public.backup_jobs (
  id uuid primary key default gen_random_uuid(),
  environment text not null default 'prod',
  backup_type text not null default 'full',
  retention_class text not null default 'daily',
  status text not null default 'queued',
  trigger_source text not null default 'cron',
  triggered_by text not null default 'system',
  worker_id text,
  storage_provider text not null default 'cloudflare-r2',
  storage_bucket text,
  storage_prefix text,
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  file_size bigint not null default 0,
  artifact_count integer not null default 0,
  encrypted boolean not null default true,
  checksum text,
  checksum_status text not null default 'pending',
  verify_status text not null default 'pending',
  retention_applied boolean not null default false,
  retry_count integer not null default 0,
  error_step text,
  error_message text,
  summary jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint backup_jobs_environment_length check (length(trim(environment)) between 2 and 40),
  constraint backup_jobs_backup_type_check check (backup_type in ('full', 'postgres', 'redis', 'storage', 'vps_configs', 'metadata', 'restore_test')),
  constraint backup_jobs_retention_class_check check (retention_class in ('daily', 'weekly', 'monthly', 'manual')),
  constraint backup_jobs_status_check check (status in ('queued', 'running', 'success', 'warn', 'failed', 'cancelled')),
  constraint backup_jobs_trigger_source_check check (trigger_source in ('cron', 'manual', 'deploy', 'restore_test', 'system')),
  constraint backup_jobs_checksum_status_check check (checksum_status in ('pending', 'ok', 'mismatch', 'skipped')),
  constraint backup_jobs_verify_status_check check (verify_status in ('pending', 'ok', 'failed', 'skipped')),
  constraint backup_jobs_duration_check check (duration_ms is null or duration_ms >= 0),
  constraint backup_jobs_file_size_check check (file_size >= 0),
  constraint backup_jobs_artifact_count_check check (artifact_count >= 0),
  constraint backup_jobs_retry_count_check check (retry_count >= 0),
  constraint backup_jobs_summary_object check (jsonb_typeof(summary) = 'object'),
  constraint backup_jobs_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists backup_jobs_environment_started_idx
  on public.backup_jobs (environment, started_at desc nulls last, created_at desc);

create index if not exists backup_jobs_status_created_idx
  on public.backup_jobs (status, created_at desc);

create index if not exists backup_jobs_success_idx
  on public.backup_jobs (environment, finished_at desc)
  where status in ('success', 'warn');

create table if not exists public.backup_artifacts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.backup_jobs(id) on delete cascade,
  environment text not null default 'prod',
  artifact_type text not null,
  status text not null default 'created',
  storage_provider text not null default 'cloudflare-r2',
  storage_bucket text,
  storage_path text,
  storage_region text,
  file_name text,
  file_size bigint not null default 0,
  checksum text,
  checksum_sha256 text,
  metadata_signature text,
  encrypted boolean not null default true,
  encryption_algorithm text not null default 'AES-256-CBC-PBKDF2',
  compression text,
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint backup_artifacts_type_check check (artifact_type in ('postgres', 'redis', 'vps_configs', 'storage_manifest', 'storage_payload', 'application_metadata', 'restore_report', 'metadata')),
  constraint backup_artifacts_status_check check (status in ('created', 'encrypted', 'uploaded', 'verified', 'skipped', 'failed')),
  constraint backup_artifacts_file_size_check check (file_size >= 0),
  constraint backup_artifacts_duration_check check (duration_ms is null or duration_ms >= 0),
  constraint backup_artifacts_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists backup_artifacts_job_idx
  on public.backup_artifacts (job_id, created_at desc);

create index if not exists backup_artifacts_type_created_idx
  on public.backup_artifacts (artifact_type, created_at desc);

create table if not exists public.backup_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.backup_jobs(id) on delete cascade,
  event_type text not null,
  severity text not null default 'info',
  step text,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint backup_events_type_length check (length(trim(event_type)) between 3 and 120),
  constraint backup_events_severity_check check (severity in ('info', 'warning', 'critical')),
  constraint backup_events_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists backup_events_job_created_idx
  on public.backup_events (job_id, created_at desc);

create index if not exists backup_events_severity_created_idx
  on public.backup_events (severity, created_at desc);

create table if not exists public.backup_restore_tests (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.backup_jobs(id) on delete set null,
  environment text not null default 'staging',
  status text not null default 'queued',
  triggered_by text not null default 'system',
  source_storage_path text,
  target_database text,
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  schema_verified boolean not null default false,
  row_count_verified boolean not null default false,
  critical_tables_verified boolean not null default false,
  verification_summary jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  constraint backup_restore_tests_status_check check (status in ('queued', 'running', 'success', 'warn', 'failed', 'skipped')),
  constraint backup_restore_tests_duration_check check (duration_ms is null or duration_ms >= 0),
  constraint backup_restore_tests_summary_object check (jsonb_typeof(verification_summary) = 'object')
);

create index if not exists backup_restore_tests_job_created_idx
  on public.backup_restore_tests (job_id, created_at desc);

create index if not exists backup_restore_tests_status_created_idx
  on public.backup_restore_tests (status, created_at desc);

create table if not exists public.backup_alerts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.backup_jobs(id) on delete set null,
  alert_type text not null,
  severity text not null default 'warning',
  status text not null default 'open',
  title text not null,
  message text not null,
  rpo_risk text not null default 'low',
  metadata jsonb not null default '{}'::jsonb,
  acknowledged_at timestamptz,
  acknowledged_by text,
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz not null default now(),
  constraint backup_alerts_type_length check (length(trim(alert_type)) between 3 and 120),
  constraint backup_alerts_severity_check check (severity in ('info', 'warning', 'critical')),
  constraint backup_alerts_status_check check (status in ('open', 'acknowledged', 'resolved')),
  constraint backup_alerts_rpo_check check (rpo_risk in ('low', 'medium', 'high')),
  constraint backup_alerts_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists backup_alerts_status_created_idx
  on public.backup_alerts (status, created_at desc);

create index if not exists backup_alerts_job_idx
  on public.backup_alerts (job_id, created_at desc);

create table if not exists public.backup_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by text not null default 'system',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint backup_settings_key_length check (length(trim(key)) between 3 and 120),
  constraint backup_settings_value_object check (jsonb_typeof(value) = 'object')
);

insert into public.backup_settings (key, value, updated_by)
values (
  'retention_policy',
  jsonb_build_object(
    'daily', 7,
    'weekly', 8,
    'monthly', 12,
    'timezone', 'Asia/Ho_Chi_Minh',
    'storageProvider', 'cloudflare-r2',
    'restoreTestCadence', 'monthly'
  ),
  'migration:20260604102000'
)
on conflict (key) do nothing;

create or replace function public.set_backup_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists backup_jobs_set_updated_at on public.backup_jobs;
create trigger backup_jobs_set_updated_at
before update on public.backup_jobs
for each row execute function public.set_backup_updated_at();

create or replace function public.claim_next_backup_job(p_worker_id text default 'backup-worker')
returns setof public.backup_jobs
language plpgsql
set search_path = public
as $$
begin
  return query
  with candidate as (
    select id
    from public.backup_jobs
    where status = 'queued'
      and trigger_source = 'manual'
    order by created_at asc
    limit 1
    for update skip locked
  )
  update public.backup_jobs jobs
  set
    status = 'running',
    worker_id = coalesce(nullif(trim(p_worker_id), ''), 'backup-worker'),
    started_at = coalesce(jobs.started_at, now()),
    metadata = jobs.metadata || jsonb_build_object('claimedAt', now(), 'claimedBy', coalesce(nullif(trim(p_worker_id), ''), 'backup-worker'))
  from candidate
  where jobs.id = candidate.id
  returning jobs.*;
end;
$$;

create or replace function public.record_backup_event(
  p_job_id uuid,
  p_event_type text,
  p_severity text,
  p_step text,
  p_message text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  inserted_id uuid;
begin
  insert into public.backup_events (job_id, event_type, severity, step, message, metadata)
  values (
    p_job_id,
    p_event_type,
    case when p_severity in ('info', 'warning', 'critical') then p_severity else 'info' end,
    p_step,
    left(coalesce(p_message, 'backup event'), 1000),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

alter table public.backup_jobs enable row level security;
alter table public.backup_artifacts enable row level security;
alter table public.backup_events enable row level security;
alter table public.backup_restore_tests enable row level security;
alter table public.backup_alerts enable row level security;
alter table public.backup_settings enable row level security;

revoke all on table public.backup_jobs from anon, authenticated;
revoke all on table public.backup_artifacts from anon, authenticated;
revoke all on table public.backup_events from anon, authenticated;
revoke all on table public.backup_restore_tests from anon, authenticated;
revoke all on table public.backup_alerts from anon, authenticated;
revoke all on table public.backup_settings from anon, authenticated;

grant select, insert, update, delete on table public.backup_jobs to service_role;
grant select, insert, update, delete on table public.backup_artifacts to service_role;
grant select, insert, update, delete on table public.backup_events to service_role;
grant select, insert, update, delete on table public.backup_restore_tests to service_role;
grant select, insert, update, delete on table public.backup_alerts to service_role;
grant select, insert, update, delete on table public.backup_settings to service_role;

revoke all on function public.claim_next_backup_job(text) from public, anon, authenticated;
grant execute on function public.claim_next_backup_job(text) to service_role;

revoke all on function public.record_backup_event(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_backup_event(uuid, text, text, text, text, jsonb) to service_role;

insert into public.platform_audit_logs (actor, action, target_type, metadata)
values (
  'migration:20260604102000',
  'backup_dr_foundation_created',
  'backup_dr',
  jsonb_build_object(
    'tables', jsonb_build_array('backup_jobs', 'backup_artifacts', 'backup_events', 'backup_restore_tests', 'backup_alerts', 'backup_settings'),
    'storageProvider', 'cloudflare-r2',
    'retention', jsonb_build_object('daily', 7, 'weekly', 8, 'monthly', 12)
  )
)
on conflict do nothing;
