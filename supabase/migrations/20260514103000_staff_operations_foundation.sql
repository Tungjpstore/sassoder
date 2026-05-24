create table if not exists public.staff_permissions (
  permission_key text primary key,
  group_key text not null,
  label text not null,
  description text,
  is_dangerous boolean not null default false,
  created_at timestamptz not null default now(),
  constraint staff_permissions_key_format check (permission_key ~ '^[a-z0-9_.:-]{3,80}$'),
  constraint staff_permissions_group_format check (group_key ~ '^[a-z0-9_-]{3,40}$')
);

create table if not exists public.staff_roles (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  legacy_permission_profile text not null default 'service',
  role_scope public.user_role not null default 'STAFF',
  is_system boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  preview_actions text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_roles_code_format check (code ~ '^[a-z0-9_-]{2,40}$'),
  constraint staff_roles_name_length check (length(trim(name)) between 2 and 120),
  constraint staff_roles_legacy_profile_check check (
    legacy_permission_profile in ('manager', 'cashier', 'kitchen', 'service', 'delivery', 'viewer')
  ),
  unique (restaurant_id, code)
);

create table if not exists public.staff_role_permissions (
  role_id uuid not null references public.staff_roles(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  permission_key text not null references public.staff_permissions(permission_key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_key)
);

create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null unique references public.users(id) on delete cascade,
  role_id uuid references public.staff_roles(id) on delete set null,
  role_code text not null default 'waiter',
  full_name text not null,
  phone text,
  username text,
  avatar_url text,
  pin_hash text,
  pin_attempts smallint not null default 0,
  pin_locked_until timestamptz,
  employment_status text not null default 'active',
  emergency_contact_name text,
  emergency_contact_phone text,
  notes text,
  gps_radius_meters integer not null default 80,
  last_seen_at timestamptz,
  suspended_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_members_role_code_format check (role_code ~ '^[a-z0-9_-]{2,40}$'),
  constraint staff_members_full_name_length check (length(trim(full_name)) between 2 and 120),
  constraint staff_members_phone_format check (phone is null or phone ~ '^[0-9+() .-]{6,24}$'),
  constraint staff_members_username_format check (username is null or username ~ '^[a-z0-9._-]{3,40}$'),
  constraint staff_members_emergency_phone_format check (
    emergency_contact_phone is null or emergency_contact_phone ~ '^[0-9+() .-]{6,24}$'
  ),
  constraint staff_members_employment_status_check check (employment_status in ('active', 'suspended', 'resigned')),
  constraint staff_members_pin_attempts_range check (pin_attempts between 0 and 20),
  constraint staff_members_gps_radius_range check (gps_radius_meters between 50 and 150)
);

create table if not exists public.staff_branch_assignments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_member_id uuid not null references public.staff_members(id) on delete cascade,
  branch_id uuid not null references public.store_branches(id) on delete cascade,
  is_primary boolean not null default false,
  assignment_status text not null default 'active',
  starts_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_branch_assignments_status_check check (assignment_status in ('active', 'paused', 'ended')),
  constraint staff_branch_assignments_range check (ended_at is null or ended_at >= starts_at)
);

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid references public.store_branches(id) on delete set null,
  code text not null,
  name text not null,
  start_time time not null,
  end_time time not null,
  allowed_late_minutes integer not null default 10,
  overtime_threshold_minutes integer not null default 30,
  attendance_radius_meters integer not null default 80,
  recurring_weekdays smallint[] not null default '{}'::smallint[],
  is_template boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shifts_code_format check (code ~ '^[a-z0-9_-]{2,40}$'),
  constraint shifts_name_length check (length(trim(name)) between 2 and 120),
  constraint shifts_late_range check (allowed_late_minutes between 0 and 180),
  constraint shifts_overtime_range check (overtime_threshold_minutes between 0 and 720),
  constraint shifts_attendance_radius_range check (attendance_radius_meters between 50 and 150),
  constraint shifts_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint shifts_weekday_count_range check (cardinality(recurring_weekdays) between 0 and 7),
  unique (restaurant_id, code)
);

create table if not exists public.shift_assignments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  shift_id uuid not null references public.shifts(id) on delete cascade,
  branch_id uuid references public.store_branches(id) on delete set null,
  staff_member_id uuid not null references public.staff_members(id) on delete cascade,
  scheduled_date date not null,
  status text not null default 'scheduled',
  source text not null default 'manual',
  note text,
  created_by uuid references public.users(id) on delete set null,
  swapped_with_assignment_id uuid references public.shift_assignments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_assignments_status_check check (status in ('scheduled', 'confirmed', 'swapped', 'cancelled', 'completed')),
  constraint shift_assignments_source_check check (source in ('manual', 'template', 'copy_week', 'swap', 'system'))
);

create table if not exists public.attendance_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_member_id uuid not null references public.staff_members(id) on delete cascade,
  staff_user_id uuid not null references public.users(id) on delete cascade,
  branch_id uuid references public.store_branches(id) on delete set null,
  shift_id uuid references public.shifts(id) on delete set null,
  shift_assignment_id uuid references public.shift_assignments(id) on delete set null,
  clock_in_at timestamptz not null default now(),
  clock_in_source text not null default 'gps',
  clock_in_lat double precision,
  clock_in_lng double precision,
  clock_in_accuracy_meters numeric(8,2),
  clock_in_distance_meters numeric(8,2),
  clock_in_device jsonb not null default '{}'::jsonb,
  clock_out_at timestamptz,
  clock_out_source text,
  clock_out_lat double precision,
  clock_out_lng double precision,
  clock_out_accuracy_meters numeric(8,2),
  clock_out_distance_meters numeric(8,2),
  clock_out_device jsonb not null default '{}'::jsonb,
  attendance_state text not null default 'on_time',
  approval_state text not null default 'auto_approved',
  late_minutes integer not null default 0,
  early_leave_minutes integer not null default 0,
  overtime_minutes integer not null default 0,
  work_minutes integer,
  anomaly_score integer not null default 0,
  anomaly_flags text[] not null default '{}'::text[],
  offline_queue_key text,
  raw_payload jsonb not null default '{}'::jsonb,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_logs_clock_in_source_check check (clock_in_source in ('gps', 'qr', 'manual', 'offline_sync')),
  constraint attendance_logs_clock_out_source_check check (
    clock_out_source is null or clock_out_source in ('gps', 'qr', 'manual', 'offline_sync')
  ),
  constraint attendance_logs_state_check check (
    attendance_state in ('on_time', 'late', 'early_leave', 'overtime', 'absent')
  ),
  constraint attendance_logs_approval_state_check check (
    approval_state in ('auto_approved', 'pending', 'approved', 'rejected')
  ),
  constraint attendance_logs_latitude_range check (
    clock_in_lat is null or (clock_in_lat >= -90 and clock_in_lat <= 90)
  ),
  constraint attendance_logs_longitude_range check (
    clock_in_lng is null or (clock_in_lng >= -180 and clock_in_lng <= 180)
  ),
  constraint attendance_logs_clock_out_latitude_range check (
    clock_out_lat is null or (clock_out_lat >= -90 and clock_out_lat <= 90)
  ),
  constraint attendance_logs_clock_out_longitude_range check (
    clock_out_lng is null or (clock_out_lng >= -180 and clock_out_lng <= 180)
  ),
  constraint attendance_logs_accuracy_range check (
    clock_in_accuracy_meters is null or clock_in_accuracy_meters between 0 and 5000
  ),
  constraint attendance_logs_clock_out_accuracy_range check (
    clock_out_accuracy_meters is null or clock_out_accuracy_meters between 0 and 5000
  ),
  constraint attendance_logs_distance_range check (
    clock_in_distance_meters is null or clock_in_distance_meters between 0 and 100000
  ),
  constraint attendance_logs_clock_out_distance_range check (
    clock_out_distance_meters is null or clock_out_distance_meters between 0 and 100000
  ),
  constraint attendance_logs_non_negative_minutes check (
    late_minutes >= 0 and early_leave_minutes >= 0 and overtime_minutes >= 0 and (work_minutes is null or work_minutes >= 0)
  ),
  constraint attendance_logs_device_objects check (
    jsonb_typeof(clock_in_device) = 'object'
    and jsonb_typeof(clock_out_device) = 'object'
    and jsonb_typeof(raw_payload) = 'object'
  )
);

create table if not exists public.attendance_approval_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  attendance_log_id uuid references public.attendance_logs(id) on delete cascade,
  staff_member_id uuid not null references public.staff_members(id) on delete cascade,
  branch_id uuid references public.store_branches(id) on delete set null,
  request_type text not null,
  status text not null default 'pending',
  reason text,
  requested_payload jsonb not null default '{}'::jsonb,
  requested_by uuid references public.users(id) on delete set null,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_approval_requests_type_check check (
    request_type in ('outside_location', 'attendance_edit', 'overtime', 'shift_override', 'manual_clock_in')
  ),
  constraint attendance_approval_requests_status_check check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  constraint attendance_approval_requests_payload_object check (jsonb_typeof(requested_payload) = 'object')
);

create table if not exists public.staff_activity_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  actor_staff_member_id uuid references public.staff_members(id) on delete set null,
  branch_id uuid references public.store_branches(id) on delete set null,
  entity_type text not null,
  entity_id text,
  action text not null,
  severity text not null default 'info',
  reason text,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  device_info jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint staff_activity_logs_severity_check check (severity in ('info', 'warning', 'critical')),
  constraint staff_activity_logs_metadata_object check (
    jsonb_typeof(metadata) = 'object' and jsonb_typeof(device_info) = 'object'
  )
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  status text not null default 'unread',
  action_url text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint notifications_status_check check (status in ('unread', 'read', 'archived')),
  constraint notifications_payload_object check (jsonb_typeof(payload) = 'object')
);

create table if not exists public.staff_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_member_id uuid not null references public.staff_members(id) on delete cascade,
  staff_user_id uuid not null references public.users(id) on delete cascade,
  branch_id uuid references public.store_branches(id) on delete set null,
  session_type text not null default 'dashboard',
  login_method text not null default 'password',
  device_fingerprint text,
  device_name text,
  ip_address text,
  user_agent text,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  recovered_at timestamptz,
  forced_logout_at timestamptz,
  permission_version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  constraint staff_sessions_type_check check (session_type in ('dashboard', 'mobile', 'kiosk', 'pwa')),
  constraint staff_sessions_login_method_check check (login_method in ('password', 'pin', 'recovery')),
  constraint staff_sessions_permission_version_positive check (permission_version >= 1),
  constraint staff_sessions_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists staff_role_permissions_unique_idx
  on public.staff_role_permissions (restaurant_id, role_id, permission_key);

create index if not exists staff_roles_restaurant_active_idx
  on public.staff_roles (restaurant_id, is_active, sort_order, created_at desc);

create index if not exists staff_members_restaurant_role_idx
  on public.staff_members (restaurant_id, role_code, employment_status, archived_at);

create unique index if not exists staff_members_restaurant_username_idx
  on public.staff_members (restaurant_id, username)
  where username is not null;

create index if not exists staff_branch_assignments_member_idx
  on public.staff_branch_assignments (staff_member_id, assignment_status, is_primary desc);

create unique index if not exists staff_branch_assignments_primary_idx
  on public.staff_branch_assignments (staff_member_id)
  where is_primary = true and assignment_status = 'active' and ended_at is null;

create index if not exists shifts_restaurant_branch_idx
  on public.shifts (restaurant_id, branch_id, is_template, start_time);

create index if not exists shift_assignments_restaurant_date_idx
  on public.shift_assignments (restaurant_id, scheduled_date, status);

create unique index if not exists shift_assignments_unique_active_slot_idx
  on public.shift_assignments (staff_member_id, shift_id, scheduled_date)
  where status in ('scheduled', 'confirmed', 'swapped');

create index if not exists attendance_logs_restaurant_clock_in_idx
  on public.attendance_logs (restaurant_id, clock_in_at desc);

create index if not exists attendance_logs_staff_clock_in_idx
  on public.attendance_logs (staff_member_id, clock_in_at desc);

create unique index if not exists attendance_logs_open_session_idx
  on public.attendance_logs (staff_member_id)
  where clock_out_at is null;

create unique index if not exists attendance_logs_offline_queue_unique_idx
  on public.attendance_logs (restaurant_id, staff_member_id, offline_queue_key)
  where offline_queue_key is not null;

create index if not exists attendance_logs_branch_state_idx
  on public.attendance_logs (branch_id, attendance_state, approval_state, clock_in_at desc);

create index if not exists attendance_approvals_restaurant_status_idx
  on public.attendance_approval_requests (restaurant_id, status, created_at desc);

create unique index if not exists attendance_approvals_pending_unique_idx
  on public.attendance_approval_requests (attendance_log_id, request_type)
  where status = 'pending' and attendance_log_id is not null;

create index if not exists staff_activity_logs_restaurant_created_idx
  on public.staff_activity_logs (restaurant_id, created_at desc);

create index if not exists staff_activity_logs_entity_idx
  on public.staff_activity_logs (entity_type, entity_id, created_at desc);

create index if not exists notifications_restaurant_status_idx
  on public.notifications (restaurant_id, status, created_at desc);

create index if not exists notifications_user_status_idx
  on public.notifications (user_id, status, created_at desc)
  where user_id is not null;

create index if not exists staff_sessions_restaurant_seen_idx
  on public.staff_sessions (restaurant_id, last_seen_at desc);

create index if not exists staff_sessions_staff_seen_idx
  on public.staff_sessions (staff_member_id, last_seen_at desc);

create unique index if not exists staff_sessions_active_device_idx
  on public.staff_sessions (staff_user_id, device_fingerprint)
  where device_fingerprint is not null and forced_logout_at is null;

drop trigger if exists staff_roles_set_updated_at on public.staff_roles;
create trigger staff_roles_set_updated_at
before update on public.staff_roles
for each row execute function public.set_updated_at();

drop trigger if exists staff_members_set_updated_at on public.staff_members;
create trigger staff_members_set_updated_at
before update on public.staff_members
for each row execute function public.set_updated_at();

drop trigger if exists staff_branch_assignments_set_updated_at on public.staff_branch_assignments;
create trigger staff_branch_assignments_set_updated_at
before update on public.staff_branch_assignments
for each row execute function public.set_updated_at();

drop trigger if exists shifts_set_updated_at on public.shifts;
create trigger shifts_set_updated_at
before update on public.shifts
for each row execute function public.set_updated_at();

drop trigger if exists shift_assignments_set_updated_at on public.shift_assignments;
create trigger shift_assignments_set_updated_at
before update on public.shift_assignments
for each row execute function public.set_updated_at();

drop trigger if exists attendance_logs_set_updated_at on public.attendance_logs;
create trigger attendance_logs_set_updated_at
before update on public.attendance_logs
for each row execute function public.set_updated_at();

drop trigger if exists attendance_approval_requests_set_updated_at on public.attendance_approval_requests;
create trigger attendance_approval_requests_set_updated_at
before update on public.attendance_approval_requests
for each row execute function public.set_updated_at();

alter table public.staff_permissions enable row level security;
alter table public.staff_roles enable row level security;
alter table public.staff_role_permissions enable row level security;
alter table public.staff_members enable row level security;
alter table public.staff_branch_assignments enable row level security;
alter table public.shifts enable row level security;
alter table public.shift_assignments enable row level security;
alter table public.attendance_logs enable row level security;
alter table public.attendance_approval_requests enable row level security;
alter table public.staff_activity_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.staff_sessions enable row level security;

grant usage on schema public to authenticated;
grant select on table
  public.staff_permissions,
  public.staff_roles,
  public.staff_role_permissions,
  public.staff_members,
  public.staff_branch_assignments,
  public.shifts,
  public.shift_assignments,
  public.attendance_logs,
  public.attendance_approval_requests,
  public.staff_activity_logs,
  public.notifications,
  public.staff_sessions
to authenticated;

grant insert, update, delete on table
  public.staff_roles,
  public.staff_role_permissions,
  public.staff_members,
  public.staff_branch_assignments,
  public.shifts,
  public.shift_assignments
to authenticated;

grant insert, update on table
  public.attendance_logs,
  public.attendance_approval_requests,
  public.staff_sessions
to authenticated;

grant update on table public.notifications to authenticated;

drop policy if exists "authenticated can read staff permissions" on public.staff_permissions;
create policy "authenticated can read staff permissions"
on public.staff_permissions for select
to authenticated
using (true);

drop policy if exists "restaurant users can read own staff roles" on public.staff_roles;
create policy "restaurant users can read own staff roles"
on public.staff_roles for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "admins can mutate own staff roles" on public.staff_roles;
create policy "admins can mutate own staff roles"
on public.staff_roles for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

drop policy if exists "restaurant users can read own staff role permissions" on public.staff_role_permissions;
create policy "restaurant users can read own staff role permissions"
on public.staff_role_permissions for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "admins can mutate own staff role permissions" on public.staff_role_permissions;
create policy "admins can mutate own staff role permissions"
on public.staff_role_permissions for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

drop policy if exists "restaurant users can read own staff members" on public.staff_members;
create policy "restaurant users can read own staff members"
on public.staff_members for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "admins can mutate own staff members" on public.staff_members;
create policy "admins can mutate own staff members"
on public.staff_members for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

drop policy if exists "restaurant users can read own staff branch assignments" on public.staff_branch_assignments;
create policy "restaurant users can read own staff branch assignments"
on public.staff_branch_assignments for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "admins can mutate own staff branch assignments" on public.staff_branch_assignments;
create policy "admins can mutate own staff branch assignments"
on public.staff_branch_assignments for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

drop policy if exists "restaurant users can read own shifts" on public.shifts;
create policy "restaurant users can read own shifts"
on public.shifts for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "admins can mutate own shifts" on public.shifts;
create policy "admins can mutate own shifts"
on public.shifts for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

drop policy if exists "restaurant users can read own shift assignments" on public.shift_assignments;
create policy "restaurant users can read own shift assignments"
on public.shift_assignments for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "admins can mutate own shift assignments" on public.shift_assignments;
create policy "admins can mutate own shift assignments"
on public.shift_assignments for all
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

drop policy if exists "restaurant users can read own attendance logs" on public.attendance_logs;
create policy "restaurant users can read own attendance logs"
on public.attendance_logs for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "staff can write own attendance logs" on public.attendance_logs;
create policy "staff can write own attendance logs"
on public.attendance_logs for insert
to authenticated
with check (
  restaurant_id = app_private.current_restaurant_id()
  and (staff_user_id = auth.uid() or app_private.current_user_role() = 'ADMIN')
);

drop policy if exists "staff can update own open attendance logs" on public.attendance_logs;
create policy "staff can update own open attendance logs"
on public.attendance_logs for update
to authenticated
using (
  restaurant_id = app_private.current_restaurant_id()
  and (staff_user_id = auth.uid() or app_private.current_user_role() = 'ADMIN')
)
with check (
  restaurant_id = app_private.current_restaurant_id()
  and (staff_user_id = auth.uid() or app_private.current_user_role() = 'ADMIN')
);

drop policy if exists "restaurant users can read own attendance approvals" on public.attendance_approval_requests;
create policy "restaurant users can read own attendance approvals"
on public.attendance_approval_requests for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "staff can create own attendance approvals" on public.attendance_approval_requests;
create policy "staff can create own attendance approvals"
on public.attendance_approval_requests for insert
to authenticated
with check (
  restaurant_id = app_private.current_restaurant_id()
  and (requested_by = auth.uid() or app_private.current_user_role() = 'ADMIN')
);

drop policy if exists "admins can review attendance approvals" on public.attendance_approval_requests;
create policy "admins can review attendance approvals"
on public.attendance_approval_requests for update
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

drop policy if exists "restaurant users can read own staff activity logs" on public.staff_activity_logs;
create policy "restaurant users can read own staff activity logs"
on public.staff_activity_logs for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

drop policy if exists "restaurant users can read own notifications" on public.notifications;
create policy "restaurant users can read own notifications"
on public.notifications for select
to authenticated
using (
  restaurant_id = app_private.current_restaurant_id()
  and (user_id is null or user_id = auth.uid() or app_private.current_user_role() = 'ADMIN')
);

drop policy if exists "restaurant users can update own notifications" on public.notifications;
create policy "restaurant users can update own notifications"
on public.notifications for update
to authenticated
using (
  restaurant_id = app_private.current_restaurant_id()
  and (user_id is null or user_id = auth.uid() or app_private.current_user_role() = 'ADMIN')
)
with check (
  restaurant_id = app_private.current_restaurant_id()
  and (user_id is null or user_id = auth.uid() or app_private.current_user_role() = 'ADMIN')
);

drop policy if exists "restaurant users can read own staff sessions" on public.staff_sessions;
create policy "restaurant users can read own staff sessions"
on public.staff_sessions for select
to authenticated
using (
  restaurant_id = app_private.current_restaurant_id()
  and (staff_user_id = auth.uid() or app_private.current_user_role() = 'ADMIN')
);

drop policy if exists "staff can write own sessions" on public.staff_sessions;
create policy "staff can write own sessions"
on public.staff_sessions for insert
to authenticated
with check (
  restaurant_id = app_private.current_restaurant_id()
  and (staff_user_id = auth.uid() or app_private.current_user_role() = 'ADMIN')
);

drop policy if exists "staff can update own sessions" on public.staff_sessions;
create policy "staff can update own sessions"
on public.staff_sessions for update
to authenticated
using (
  restaurant_id = app_private.current_restaurant_id()
  and (staff_user_id = auth.uid() or app_private.current_user_role() = 'ADMIN')
)
with check (
  restaurant_id = app_private.current_restaurant_id()
  and (staff_user_id = auth.uid() or app_private.current_user_role() = 'ADMIN')
);

insert into public.staff_permissions (permission_key, group_key, label, description, is_dangerous)
values
  ('dashboard.view', 'dashboard', 'Xem dashboard', 'Xem tổng quan vận hành nhân sự và ca làm.', false),
  ('orders.view', 'orders', 'Xem đơn hàng', 'Xem luồng đơn theo thời gian thực.', false),
  ('orders.update', 'orders', 'Cập nhật đơn', 'Nhận đơn, cập nhật trạng thái và điều phối xử lý.', false),
  ('orders.cancel', 'orders', 'Huỷ đơn', 'Huỷ đơn đã tạo và ghi nhận lý do.', true),
  ('orders.reopen', 'orders', 'Mở lại đơn', 'Khôi phục đơn hoặc bàn đã đóng.', true),
  ('payments.view', 'payments', 'Xem thanh toán', 'Theo dõi giao dịch và trạng thái xác nhận.', false),
  ('payments.confirm', 'payments', 'Xác nhận thanh toán', 'Xác nhận giao dịch tiền mặt hoặc VietQR.', true),
  ('payments.refund', 'payments', 'Hoàn tiền', 'Thực hiện hoặc ghi nhận hoàn tiền.', true),
  ('tables.manage', 'tables', 'Quản lý bàn', 'Điều phối bàn, QR và trạng thái phục vụ.', false),
  ('tables.reopen', 'tables', 'Mở lại bàn', 'Mở lại bàn đã đóng hoặc đã thanh toán.', true),
  ('menu.view', 'menu', 'Xem menu', 'Xem menu nội bộ để phục vụ vận hành.', false),
  ('menu.edit', 'menu', 'Sửa menu', 'Tạo, sửa, ẩn món và cập nhật giá.', true),
  ('customers.view', 'customers', 'Xem khách hàng', 'Xem hồ sơ khách và lịch sử phục vụ.', false),
  ('promotions.manage', 'promotions', 'Quản lý khuyến mãi', 'Bật, tắt và cấu hình ưu đãi.', true),
  ('staff.view', 'staff', 'Xem nhân sự', 'Xem hồ sơ và trạng thái vận hành của nhân viên.', false),
  ('staff.create', 'staff', 'Tạo nhân sự', 'Tạo tài khoản và hồ sơ vận hành mới.', true),
  ('staff.edit', 'staff', 'Sửa nhân sự', 'Cập nhật hồ sơ, role, chi nhánh và trạng thái.', true),
  ('staff.suspend', 'staff', 'Tạm khoá nhân sự', 'Khoá truy cập hoặc dừng ca của nhân sự.', true),
  ('staff.archive', 'staff', 'Lưu trữ nhân sự', 'Lưu trữ nhân sự đã nghỉ việc hoặc ngừng sử dụng.', true),
  ('staff.roles', 'staff', 'Quản lý vai trò', 'Tạo role, clone role và đổi ma trận quyền.', true),
  ('attendance.view', 'attendance', 'Xem chấm công', 'Xem dòng chấm công, ca muộn và ngoại lệ.', false),
  ('attendance.clock', 'attendance', 'Chấm công', 'Cho phép clock-in hoặc clock-out bằng GPS, QR hoặc offline sync.', false),
  ('attendance.edit', 'attendance', 'Sửa chấm công', 'Sửa dữ liệu chấm công hoặc clock-in thủ công.', true),
  ('attendance.approve', 'attendance', 'Duyệt chấm công', 'Phê duyệt GPS lệch, overtime và chỉnh sửa công.', true),
  ('shifts.view', 'shifts', 'Xem ca làm', 'Xem lịch tuần và phân công nhân sự.', false),
  ('shifts.manage', 'shifts', 'Quản lý ca làm', 'Tạo mẫu ca, chỉnh giờ và cấu hình ca.', true),
  ('shifts.assign', 'shifts', 'Phân ca', 'Kéo thả, copy tuần và gán ca hàng loạt.', true),
  ('shifts.override', 'shifts', 'Override ca', 'Cho phép đổi ca, ghi đè và bỏ qua xung đột.', true),
  ('approvals.review', 'approvals', 'Xử lý phê duyệt', 'Xử lý toàn bộ queue phê duyệt vận hành.', true),
  ('presence.view', 'presence', 'Xem hiện diện', 'Xem ai đang online, đang ở quán và trạng thái thiết bị.', false),
  ('activity_logs.view', 'activity_logs', 'Xem nhật ký hoạt động', 'Xem audit log và hành động nhạy cảm.', false),
  ('activity_logs.export', 'activity_logs', 'Xuất nhật ký hoạt động', 'Xuất log cho đối soát hoặc điều tra.', true),
  ('inventory.view', 'inventory', 'Xem kho', 'Theo dõi nguyên liệu, thiếu hụt và định mức.', false),
  ('inventory.manage', 'inventory', 'Quản lý kho', 'Nhập kho, chỉnh kho và kiểm kê.', true),
  ('reports.view', 'reports', 'Xem báo cáo', 'Xem dashboard, tổng hợp công và phân tích.', false),
  ('settings.view', 'settings', 'Xem cài đặt', 'Xem cấu hình vận hành của quán.', false),
  ('settings.billing.manage', 'settings', 'Quản lý billing', 'Thay đổi gói, giới hạn và thanh toán LogiVN.', true),
  ('online.manage', 'online', 'Quản lý kênh online', 'Theo dõi đơn online, giao hàng và kênh từ xa.', false),
  ('reservations.manage', 'reservations', 'Quản lý đặt bàn', 'Xử lý lịch đặt bàn, cọc và xác nhận.', false),
  ('notifications.manage', 'notifications', 'Quản lý thông báo', 'Tạo rule thông báo và điều phối cảnh báo.', true),
  ('orders.manage', 'legacy', 'Điều phối đơn', 'Khoá tương thích cho luồng phân quyền cũ của LogiVN.', false),
  ('kitchen.view', 'legacy', 'Màn hình bếp', 'Khoá tương thích cho luồng bếp cũ của LogiVN.', false),
  ('menu.manage', 'legacy', 'Quản lý menu', 'Khoá tương thích cho luồng menu cũ của LogiVN.', true),
  ('payments.manage', 'legacy', 'Điều phối thanh toán', 'Khoá tương thích cho luồng thanh toán cũ của LogiVN.', true),
  ('staff.manage', 'legacy', 'Quản lý nhân sự', 'Khoá tương thích cho luồng staff cũ của LogiVN.', true),
  ('settings.manage', 'legacy', 'Quản lý cài đặt', 'Khoá tương thích cho luồng settings cũ của LogiVN.', true)
on conflict (permission_key) do update set
  group_key = excluded.group_key,
  label = excluded.label,
  description = excluded.description,
  is_dangerous = excluded.is_dangerous;
