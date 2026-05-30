-- Staff Operations runtime hardening:
-- - Backfill the HR foundation outside dashboard read paths.
-- - Publish staff tables for Supabase Realtime.
-- - Keep QR attendance tokens behind trusted server APIs.

with role_templates(code, name, description, legacy_permission_profile, role_scope, sort_order, preview_actions) as (
  values
    ('owner', 'Chu quan', 'Full workforce, billing and governance control.', 'manager', 'ADMIN'::public.user_role, 0, array['Full control']),
    ('manager', 'Quan ly', 'Run shifts, staff approvals and realtime operations.', 'manager', 'ADMIN'::public.user_role, 1, array['Run operations']),
    ('cashier', 'Thu ngan', 'Confirm payments, close tables and reconcile shift cash.', 'cashier', 'STAFF'::public.user_role, 2, array['Payments']),
    ('waiter', 'Phuc vu', 'Handle table service, orders and attendance.', 'service', 'STAFF'::public.user_role, 3, array['Table service']),
    ('kitchen', 'Bep', 'Update kitchen queue and prep progress.', 'kitchen', 'STAFF'::public.user_role, 4, array['Kitchen queue']),
    ('marketing', 'Marketing', 'Track customers, promotions and online channels.', 'viewer', 'STAFF'::public.user_role, 5, array['Growth']),
    ('accountant', 'Ke toan', 'Reconcile payments, reports and attendance exports.', 'viewer', 'STAFF'::public.user_role, 6, array['Reconcile']),
    ('delivery', 'Giao hang', 'Handle remote orders and delivery handoff.', 'delivery', 'STAFF'::public.user_role, 7, array['Delivery'])
)
insert into public.staff_roles (
  restaurant_id,
  code,
  name,
  description,
  legacy_permission_profile,
  role_scope,
  is_system,
  sort_order,
  preview_actions
)
select
  restaurants.id,
  role_templates.code,
  role_templates.name,
  role_templates.description,
  role_templates.legacy_permission_profile,
  role_templates.role_scope,
  true,
  role_templates.sort_order,
  role_templates.preview_actions
from public.restaurants
cross join role_templates
on conflict (restaurant_id, code) do update
set
  name = excluded.name,
  description = excluded.description,
  legacy_permission_profile = excluded.legacy_permission_profile,
  role_scope = excluded.role_scope,
  is_system = true,
  sort_order = excluded.sort_order,
  preview_actions = excluded.preview_actions,
  updated_at = now();

with owner_permissions as (
  select 'owner'::text as code, permission_key from public.staff_permissions
),
manager_permissions as (
  select 'manager'::text as code, permission_key from public.staff_permissions where permission_key <> 'settings.billing.manage'
),
role_permission_templates(code, permission_key) as (
  select * from owner_permissions
  union all select * from manager_permissions
  union all
  select * from (values
    ('cashier', 'dashboard.view'), ('cashier', 'orders.view'), ('cashier', 'orders.update'), ('cashier', 'payments.view'),
    ('cashier', 'payments.confirm'), ('cashier', 'tables.manage'), ('cashier', 'attendance.clock'), ('cashier', 'attendance.view'),
    ('cashier', 'presence.view'), ('cashier', 'reports.view'), ('cashier', 'payments.manage'),
    ('waiter', 'dashboard.view'), ('waiter', 'orders.view'), ('waiter', 'orders.update'), ('waiter', 'tables.manage'),
    ('waiter', 'attendance.clock'), ('waiter', 'attendance.view'), ('waiter', 'presence.view'), ('waiter', 'customers.view'),
    ('waiter', 'reservations.manage'), ('waiter', 'orders.manage'),
    ('kitchen', 'dashboard.view'), ('kitchen', 'orders.view'), ('kitchen', 'orders.update'), ('kitchen', 'inventory.view'),
    ('kitchen', 'presence.view'), ('kitchen', 'attendance.clock'), ('kitchen', 'kitchen.view'),
    ('marketing', 'dashboard.view'), ('marketing', 'customers.view'), ('marketing', 'promotions.manage'), ('marketing', 'online.manage'),
    ('marketing', 'reports.view'), ('marketing', 'menu.view'), ('marketing', 'attendance.clock'), ('marketing', 'attendance.view'),
    ('accountant', 'dashboard.view'), ('accountant', 'payments.view'), ('accountant', 'reports.view'), ('accountant', 'activity_logs.view'),
    ('accountant', 'activity_logs.export'), ('accountant', 'attendance.clock'), ('accountant', 'attendance.view'), ('accountant', 'payments.manage'),
    ('delivery', 'dashboard.view'), ('delivery', 'orders.view'), ('delivery', 'orders.update'), ('delivery', 'online.manage'),
    ('delivery', 'presence.view'), ('delivery', 'attendance.clock')
  ) as template_values(code, permission_key)
)
insert into public.staff_role_permissions (role_id, restaurant_id, permission_key)
select roles.id, roles.restaurant_id, templates.permission_key
from public.staff_roles roles
join role_permission_templates templates on templates.code = roles.code
join public.staff_permissions permissions on permissions.permission_key = templates.permission_key
on conflict (role_id, permission_key) do nothing;

with user_profiles as (
  select
    users.id as user_id,
    users.restaurant_id,
    users.email,
    users.role,
    users.account_status,
    case
      when users.role = 'ADMIN' then 'owner'
      when users.permission_profile = 'manager' then 'manager'
      when users.permission_profile = 'cashier' then 'cashier'
      when users.permission_profile = 'kitchen' then 'kitchen'
      when users.permission_profile = 'delivery' then 'delivery'
      when users.permission_profile = 'viewer' then 'accountant'
      else 'waiter'
    end as role_code,
    case
      when length(regexp_replace(split_part(users.email, '@', 1), '[._-]+', ' ', 'g')) >= 2
        then initcap(regexp_replace(split_part(users.email, '@', 1), '[._-]+', ' ', 'g'))
      else 'Nhan vien'
    end as fallback_name
  from public.users
)
insert into public.staff_members (
  restaurant_id,
  user_id,
  role_id,
  role_code,
  full_name,
  employment_status
)
select
  profiles.restaurant_id,
  profiles.user_id,
  roles.id,
  profiles.role_code,
  profiles.fallback_name,
  case when profiles.account_status = 'blocked' then 'suspended' else 'active' end
from user_profiles profiles
left join public.staff_roles roles
  on roles.restaurant_id = profiles.restaurant_id
 and roles.code = profiles.role_code
on conflict (user_id) do nothing;

with primary_branches as (
  select distinct on (restaurant_id)
    restaurant_id,
    id as branch_id
  from public.store_branches
  where is_active = true
  order by restaurant_id, is_primary desc, created_at asc
),
missing_assignments as (
  select
    members.restaurant_id,
    members.id as staff_member_id,
    branches.branch_id
  from public.staff_members members
  join primary_branches branches on branches.restaurant_id = members.restaurant_id
  where not exists (
    select 1
    from public.staff_branch_assignments assignments
    where assignments.restaurant_id = members.restaurant_id
      and assignments.staff_member_id = members.id
      and assignments.is_primary = true
      and assignments.assignment_status = 'active'
      and assignments.ended_at is null
  )
)
insert into public.staff_branch_assignments (restaurant_id, staff_member_id, branch_id, is_primary, assignment_status)
select restaurant_id, staff_member_id, branch_id, true, 'active'
from missing_assignments;

with primary_branches as (
  select distinct on (restaurant_id)
    restaurant_id,
    id as branch_id
  from public.store_branches
  where is_active = true
  order by restaurant_id, is_primary desc, created_at asc
),
shift_templates(code, name, start_time, end_time, weekdays, preset) as (
  values
    ('morning', 'Ca sang', '07:00:00'::time, '11:00:00'::time, array[1,2,3,4,5,6]::smallint[], 'morning'),
    ('afternoon', 'Ca chieu', '13:00:00'::time, '17:00:00'::time, array[1,2,3,4,5,6]::smallint[], 'afternoon'),
    ('night', 'Ca toi', '18:00:00'::time, '22:30:00'::time, array[1,2,3,4,5,6,0]::smallint[], 'night')
)
insert into public.shifts (
  restaurant_id,
  branch_id,
  code,
  name,
  start_time,
  end_time,
  allowed_late_minutes,
  overtime_threshold_minutes,
  attendance_radius_meters,
  recurring_weekdays,
  is_template,
  metadata
)
select
  branches.restaurant_id,
  branches.branch_id,
  templates.code,
  templates.name,
  templates.start_time,
  templates.end_time,
  10,
  30,
  80,
  templates.weekdays,
  true,
  jsonb_build_object('preset', templates.preset, 'market', 'vietnam_restaurant', 'source', 'migration')
from primary_branches branches
cross join shift_templates templates
on conflict (restaurant_id, code) do nothing;

do $$
declare
  realtime_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach realtime_table in array array[
      'users',
      'staff_members',
      'staff_branch_assignments',
      'shift_assignments',
      'attendance_logs',
      'attendance_approval_requests',
      'staff_activity_logs',
      'staff_sessions',
      'notifications',
      'staff_attendance_qr_tokens',
      'staff_attendance_wifi_networks'
    ]
    loop
      if to_regclass(format('public.%I', realtime_table)) is not null and not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = realtime_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', realtime_table);
      end if;
    end loop;
  end if;
end $$;

do $$
begin
  if to_regclass('public.staff_attendance_qr_tokens') is not null then
    revoke insert, update, delete on table public.staff_attendance_qr_tokens from authenticated;
  end if;

  if to_regclass('public.staff_attendance_wifi_networks') is not null then
    revoke insert, update, delete on table public.staff_attendance_wifi_networks from authenticated;
  end if;
end $$;

create index if not exists staff_sessions_force_logout_lookup_idx
  on public.staff_sessions (restaurant_id, staff_user_id, device_fingerprint, started_at desc)
  where device_fingerprint is not null;

create index if not exists staff_branch_assignments_branch_member_idx
  on public.staff_branch_assignments (restaurant_id, branch_id, staff_member_id)
  where assignment_status = 'active' and ended_at is null;
