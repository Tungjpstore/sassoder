create schema if not exists app_private;
revoke all on schema app_private from anon, authenticated;

create table if not exists public.staff_operation_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  operation_key text not null,
  operation_type text not null,
  actor_user_id uuid references public.users(id) on delete set null,
  target_staff_member_id uuid references public.staff_members(id) on delete set null,
  target_user_id uuid references public.users(id) on delete set null,
  status text not null default 'started',
  request_hash text,
  result_payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint staff_operation_requests_key_length check (length(operation_key) between 16 and 160),
  constraint staff_operation_requests_type_format check (operation_type ~ '^[a-z0-9_.:-]{3,80}$'),
  constraint staff_operation_requests_status_check check (status in ('started', 'completed', 'failed')),
  constraint staff_operation_requests_payload_object check (jsonb_typeof(result_payload) = 'object'),
  constraint staff_operation_requests_hash_format check (request_hash is null or request_hash ~ '^[a-f0-9]{64}$')
);

create unique index if not exists staff_operation_requests_restaurant_operation_key_uidx
  on public.staff_operation_requests (restaurant_id, operation_type, operation_key);

create index if not exists staff_operation_requests_restaurant_status_idx
  on public.staff_operation_requests (restaurant_id, status, created_at desc);

create index if not exists staff_operation_requests_target_staff_idx
  on public.staff_operation_requests (restaurant_id, target_staff_member_id, created_at desc)
  where target_staff_member_id is not null;

create or replace function app_private.set_staff_operation_request_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  if new.status = 'completed' and old.status <> 'completed' and new.completed_at is null then
    new.completed_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists staff_operation_requests_set_updated_at on public.staff_operation_requests;
create trigger staff_operation_requests_set_updated_at
before update on public.staff_operation_requests
for each row execute function app_private.set_staff_operation_request_updated_at();

create or replace function app_private.prevent_staff_activity_log_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception using
      errcode = '45000',
      message = 'staff_activity_logs are immutable and cannot be updated';
  end if;

  if tg_op = 'DELETE' and pg_trigger_depth() <= 1 then
    raise exception using
      errcode = '45000',
      message = 'staff_activity_logs are immutable and cannot be deleted directly';
  end if;

  return old;
end;
$$;

drop trigger if exists staff_activity_logs_prevent_mutation on public.staff_activity_logs;
create trigger staff_activity_logs_prevent_mutation
before update or delete on public.staff_activity_logs
for each row execute function app_private.prevent_staff_activity_log_mutation();

alter table public.staff_operation_requests enable row level security;

revoke all on public.staff_operation_requests from anon, authenticated;
grant select, insert, update on public.staff_operation_requests to service_role;

drop policy if exists "service role manages staff operation requests" on public.staff_operation_requests;
create policy "service role manages staff operation requests"
on public.staff_operation_requests
as permissive
for all
to service_role
using (true)
with check (true);
