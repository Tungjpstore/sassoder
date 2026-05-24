create table if not exists public.staff_attendance_qr_tokens (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid not null references public.store_branches(id) on delete cascade,
  token_hash text not null,
  purpose text not null default 'attendance',
  valid_from timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  last_used_at timestamptz,
  usage_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_attendance_qr_tokens_purpose_check check (purpose in ('attendance')),
  constraint staff_attendance_qr_tokens_expiry_check check (expires_at > valid_from),
  constraint staff_attendance_qr_tokens_usage_check check (usage_count >= 0),
  constraint staff_attendance_qr_tokens_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists staff_attendance_qr_tokens_hash_idx
  on public.staff_attendance_qr_tokens (restaurant_id, token_hash);

create index if not exists staff_attendance_qr_tokens_branch_active_idx
  on public.staff_attendance_qr_tokens (restaurant_id, branch_id, expires_at desc)
  where revoked_at is null;

drop trigger if exists staff_attendance_qr_tokens_set_updated_at on public.staff_attendance_qr_tokens;
create trigger staff_attendance_qr_tokens_set_updated_at
before update on public.staff_attendance_qr_tokens
for each row execute function public.set_updated_at();

alter table public.staff_attendance_qr_tokens enable row level security;

grant select, insert, update on table public.staff_attendance_qr_tokens to authenticated;

drop policy if exists "admins can read own staff attendance qr tokens" on public.staff_attendance_qr_tokens;
create policy "admins can read own staff attendance qr tokens"
on public.staff_attendance_qr_tokens for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

drop policy if exists "admins can mutate own staff attendance qr tokens" on public.staff_attendance_qr_tokens;
create policy "admins can mutate own staff attendance qr tokens"
on public.staff_attendance_qr_tokens for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

alter table public.staff_devices
  add column if not exists branch_id uuid references public.store_branches(id) on delete set null,
  add column if not exists device_fingerprint text,
  add column if not exists trusted_for_attendance boolean not null default false,
  add column if not exists trusted_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists last_staff_session_id uuid references public.staff_sessions(id) on delete set null,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.staff_devices
  drop constraint if exists staff_devices_trusted_requires_fingerprint,
  add constraint staff_devices_trusted_requires_fingerprint check (
    trusted_for_attendance = false or device_fingerprint is not null
  ),
  drop constraint if exists staff_devices_metadata_object,
  add constraint staff_devices_metadata_object check (jsonb_typeof(metadata) = 'object');

create unique index if not exists staff_devices_active_fingerprint_idx
  on public.staff_devices (restaurant_id, device_fingerprint)
  where device_fingerprint is not null and revoked_at is null;

create index if not exists staff_devices_trust_lookup_idx
  on public.staff_devices (restaurant_id, staff_member_id, trusted_for_attendance, status, last_seen_at desc)
  where device_fingerprint is not null and revoked_at is null;

alter table public.attendance_approval_requests
  drop constraint if exists attendance_approval_requests_type_check;

alter table public.attendance_approval_requests
  add constraint attendance_approval_requests_type_check check (
    request_type in (
      'outside_location',
      'attendance_edit',
      'overtime',
      'shift_override',
      'manual_clock_in',
      'leave_request',
      'shift_swap',
      'device_restriction'
    )
  );
