-- Scheduled operational reports with audit logs.

create table if not exists public.report_schedules (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  enabled boolean not null default false,
  frequency text not null default 'weekly',
  recipients text[] not null default '{}'::text[],
  send_hour smallint not null default 8,
  send_day_of_week smallint not null default 1,
  send_day_of_month smallint not null default 1,
  send_month smallint not null default 1,
  timezone text not null default 'Asia/Ho_Chi_Minh',
  include_csv boolean not null default true,
  include_json boolean not null default false,
  last_sent_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_schedules_frequency_check check (frequency in ('weekly', 'monthly', 'yearly')),
  constraint report_schedules_send_hour_check check (send_hour between 0 and 23),
  constraint report_schedules_day_of_week_check check (send_day_of_week between 1 and 7),
  constraint report_schedules_day_of_month_check check (send_day_of_month between 1 and 31),
  constraint report_schedules_month_check check (send_month between 1 and 12),
  constraint report_schedules_recipients_check check (cardinality(recipients) <= 10),
  constraint report_schedules_unique_restaurant unique (restaurant_id)
);

create table if not exists public.report_send_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  schedule_id uuid references public.report_schedules(id) on delete set null,
  period_type text not null,
  period_start date not null,
  period_end date not null,
  recipient_emails text[] not null default '{}'::text[],
  status text not null,
  subject text,
  provider text,
  provider_message_id text,
  error_message text,
  raw_data jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint report_send_logs_period_type_check check (period_type in ('weekly', 'monthly', 'yearly')),
  constraint report_send_logs_status_check check (status in ('queued', 'sent', 'failed', 'skipped')),
  constraint report_send_logs_period_range check (period_start <= period_end)
);

create index if not exists report_schedules_due_idx
  on public.report_schedules (enabled, next_run_at)
  where enabled = true;

create index if not exists report_schedules_restaurant_idx
  on public.report_schedules (restaurant_id);

create index if not exists report_send_logs_restaurant_created_idx
  on public.report_send_logs (restaurant_id, created_at desc);

create index if not exists report_send_logs_schedule_created_idx
  on public.report_send_logs (schedule_id, created_at desc);

alter table public.report_schedules enable row level security;
alter table public.report_send_logs enable row level security;

drop trigger if exists report_schedules_set_updated_at on public.report_schedules;
create trigger report_schedules_set_updated_at
before update on public.report_schedules
for each row execute function public.set_updated_at();

drop policy if exists "admins can manage own report schedules" on public.report_schedules;
create policy "admins can manage own report schedules"
on public.report_schedules for all
to authenticated
using (
  restaurant_id = public.current_restaurant_id()
  and public.current_user_role() = 'ADMIN'
)
with check (
  restaurant_id = public.current_restaurant_id()
  and public.current_user_role() = 'ADMIN'
);

drop policy if exists "staff can read own report logs" on public.report_send_logs;
create policy "staff can read own report logs"
on public.report_send_logs for select
to authenticated
using (restaurant_id = public.current_restaurant_id());
