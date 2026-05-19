-- Verify SQUAD 8 Staff Operations hardening after applying:
-- supabase/migrations/20260519103000_staff_operations_security_hardening.sql

select 'qr_one_time_columns' as check_name, count(*) = 2 as passed
from information_schema.columns
where table_schema = 'public'
  and table_name = 'staff_attendance_qr_tokens'
  and column_name in ('consumed_at', 'consumed_by_staff_member_id');

select 'shift_overlap_trigger' as check_name, count(*) = 1 as passed
from pg_trigger
where tgrelid = 'public.shift_assignments'::regclass
  and tgname = 'prevent_shift_assignment_overlap'
  and not tgisinternal;

select 'no_direct_authenticated_writes' as check_name, count(*) = 0 as passed
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'authenticated'
  and table_name in (
    'attendance_logs',
    'attendance_approval_requests',
    'staff_sessions',
    'notifications',
    'staff_roles',
    'staff_role_permissions',
    'staff_members',
    'staff_branch_assignments',
    'shifts',
    'shift_assignments'
  )
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE');

select 'legacy_write_policies_removed' as check_name, count(*) = 0 as passed
from pg_policies
where schemaname = 'public'
  and tablename in ('attendance_logs', 'attendance_approval_requests', 'staff_sessions', 'notifications')
  and policyname in (
    'staff can write own attendance logs',
    'staff can update own open attendance logs',
    'staff can create own attendance approvals',
    'admins can review attendance approvals',
    'restaurant users can update own notifications',
    'staff can write own sessions',
    'staff can update own sessions'
  );
