-- Staff Operations security hardening.
-- All staff operation mutations must pass through server APIs where entitlements,
-- permissions, GPS/QR validation, and audit logging are enforced.

revoke insert, update, delete on table
  public.staff_roles,
  public.staff_role_permissions,
  public.staff_members,
  public.staff_branch_assignments,
  public.shifts,
  public.shift_assignments
from authenticated;

revoke insert, update, delete on table
  public.attendance_logs,
  public.attendance_approval_requests,
  public.staff_sessions
from authenticated;

revoke insert, update, delete on table public.notifications from authenticated;

alter table public.staff_attendance_qr_tokens
  add column if not exists consumed_at timestamptz,
  add column if not exists consumed_by_staff_member_id uuid references public.staff_members(id) on delete set null;

create index if not exists staff_attendance_qr_tokens_active_once_idx
  on public.staff_attendance_qr_tokens (restaurant_id, branch_id, expires_at)
  where revoked_at is null and consumed_at is null;

create or replace function public.prevent_shift_assignment_overlap()
returns trigger
language plpgsql
as $$
declare
  new_shift record;
  new_start timestamp;
  new_end timestamp;
  conflicting_assignment_id uuid;
begin
  if new.status not in ('scheduled', 'confirmed', 'swapped') then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.staff_member_id::text));

  select start_time, end_time
    into new_shift
  from public.shifts
  where id = new.shift_id
    and restaurant_id = new.restaurant_id;

  if not found then
    return new;
  end if;

  new_start := new.scheduled_date::timestamp + new_shift.start_time;
  new_end := new.scheduled_date::timestamp + new_shift.end_time;
  if new_end <= new_start then
    new_end := new_end + interval '1 day';
  end if;

  select existing.id
    into conflicting_assignment_id
  from public.shift_assignments existing
  join public.shifts existing_shift
    on existing_shift.id = existing.shift_id
   and existing_shift.restaurant_id = existing.restaurant_id
  where existing.restaurant_id = new.restaurant_id
    and existing.staff_member_id = new.staff_member_id
    and existing.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    and existing.status in ('scheduled', 'confirmed', 'swapped')
    and existing.scheduled_date between new.scheduled_date - 1 and new.scheduled_date + 1
    and tsrange(new_start, new_end, '[)') && tsrange(
      existing.scheduled_date::timestamp + existing_shift.start_time,
      case
        when existing_shift.end_time <= existing_shift.start_time
          then existing.scheduled_date::timestamp + existing_shift.end_time + interval '1 day'
        else existing.scheduled_date::timestamp + existing_shift.end_time
      end,
      '[)'
    )
  limit 1;

  if conflicting_assignment_id is not null then
    raise exception 'Shift assignment overlaps an existing active assignment.'
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_shift_assignment_overlap on public.shift_assignments;
create trigger prevent_shift_assignment_overlap
before insert or update of staff_member_id, shift_id, scheduled_date, status
on public.shift_assignments
for each row execute function public.prevent_shift_assignment_overlap();

drop policy if exists "restaurant users can read own staff roles" on public.staff_roles;
create policy "restaurant users can read own staff roles"
on public.staff_roles for select
to authenticated
using (
  restaurant_id = app_private.current_restaurant_id()
  and (
    app_private.current_user_role() = 'ADMIN'
    or exists (
      select 1
      from public.staff_members own_member
      where own_member.restaurant_id = public.staff_roles.restaurant_id
        and own_member.user_id = auth.uid()
        and own_member.archived_at is null
        and own_member.employment_status = 'active'
        and (
          own_member.role_id = public.staff_roles.id
          or own_member.role_code = public.staff_roles.code
        )
    )
  )
);

drop policy if exists "restaurant users can read own staff role permissions" on public.staff_role_permissions;
create policy "restaurant users can read own staff role permissions"
on public.staff_role_permissions for select
to authenticated
using (
  restaurant_id = app_private.current_restaurant_id()
  and (
    app_private.current_user_role() = 'ADMIN'
    or exists (
      select 1
      from public.staff_members own_member
      where own_member.restaurant_id = public.staff_role_permissions.restaurant_id
        and own_member.user_id = auth.uid()
        and own_member.archived_at is null
        and own_member.employment_status = 'active'
        and own_member.role_id = public.staff_role_permissions.role_id
    )
  )
);

drop policy if exists "restaurant users can read own staff members" on public.staff_members;
create policy "restaurant users can read own staff members"
on public.staff_members for select
to authenticated
using (
  restaurant_id = app_private.current_restaurant_id()
  and (
    app_private.current_user_role() = 'ADMIN'
    or user_id = auth.uid()
  )
);

drop policy if exists "restaurant users can read own staff branch assignments" on public.staff_branch_assignments;
create policy "restaurant users can read own staff branch assignments"
on public.staff_branch_assignments for select
to authenticated
using (
  restaurant_id = app_private.current_restaurant_id()
  and (
    app_private.current_user_role() = 'ADMIN'
    or exists (
      select 1
      from public.staff_members own_member
      where own_member.restaurant_id = public.staff_branch_assignments.restaurant_id
        and own_member.id = public.staff_branch_assignments.staff_member_id
        and own_member.user_id = auth.uid()
        and own_member.archived_at is null
    )
  )
);

drop policy if exists "restaurant users can read own shifts" on public.shifts;
create policy "restaurant users can read own shifts"
on public.shifts for select
to authenticated
using (
  restaurant_id = app_private.current_restaurant_id()
  and (
    app_private.current_user_role() = 'ADMIN'
    or exists (
      select 1
      from public.shift_assignments own_assignment
      join public.staff_members own_member
        on own_member.id = own_assignment.staff_member_id
       and own_member.restaurant_id = own_assignment.restaurant_id
      where own_assignment.restaurant_id = public.shifts.restaurant_id
        and own_assignment.shift_id = public.shifts.id
        and own_assignment.status in ('scheduled', 'confirmed', 'swapped', 'completed')
        and own_member.user_id = auth.uid()
        and own_member.archived_at is null
    )
  )
);

drop policy if exists "restaurant users can read own shift assignments" on public.shift_assignments;
create policy "restaurant users can read own shift assignments"
on public.shift_assignments for select
to authenticated
using (
  restaurant_id = app_private.current_restaurant_id()
  and (
    app_private.current_user_role() = 'ADMIN'
    or exists (
      select 1
      from public.staff_members own_member
      where own_member.restaurant_id = public.shift_assignments.restaurant_id
        and own_member.id = public.shift_assignments.staff_member_id
        and own_member.user_id = auth.uid()
        and own_member.archived_at is null
    )
  )
);

drop policy if exists "restaurant users can read own attendance logs" on public.attendance_logs;
create policy "restaurant users can read own attendance logs"
on public.attendance_logs for select
to authenticated
using (
  restaurant_id = app_private.current_restaurant_id()
  and (
    app_private.current_user_role() = 'ADMIN'
    or staff_user_id = auth.uid()
  )
);

drop policy if exists "staff can write own attendance logs" on public.attendance_logs;
drop policy if exists "staff can update own open attendance logs" on public.attendance_logs;

drop policy if exists "restaurant users can read own attendance approvals" on public.attendance_approval_requests;
create policy "restaurant users can read own attendance approvals"
on public.attendance_approval_requests for select
to authenticated
using (
  restaurant_id = app_private.current_restaurant_id()
  and (
    app_private.current_user_role() = 'ADMIN'
    or requested_by = auth.uid()
    or exists (
      select 1
      from public.staff_members own_member
      where own_member.restaurant_id = public.attendance_approval_requests.restaurant_id
        and own_member.id = public.attendance_approval_requests.staff_member_id
        and own_member.user_id = auth.uid()
        and own_member.archived_at is null
    )
  )
);

drop policy if exists "staff can create own attendance approvals" on public.attendance_approval_requests;
drop policy if exists "admins can review attendance approvals" on public.attendance_approval_requests;

drop policy if exists "restaurant users can read own staff activity logs" on public.staff_activity_logs;
create policy "restaurant users can read own staff activity logs"
on public.staff_activity_logs for select
to authenticated
using (
  restaurant_id = app_private.current_restaurant_id()
  and (
    app_private.current_user_role() = 'ADMIN'
    or actor_user_id = auth.uid()
    or exists (
      select 1
      from public.staff_members own_member
      where own_member.restaurant_id = public.staff_activity_logs.restaurant_id
        and own_member.id = public.staff_activity_logs.actor_staff_member_id
        and own_member.user_id = auth.uid()
        and own_member.archived_at is null
    )
  )
);

drop policy if exists "restaurant users can read own notifications" on public.notifications;
create policy "restaurant users can read own notifications"
on public.notifications for select
to authenticated
using (
  restaurant_id = app_private.current_restaurant_id()
  and (
    app_private.current_user_role() = 'ADMIN'
    or user_id = auth.uid()
  )
);

drop policy if exists "restaurant users can update own notifications" on public.notifications;

drop policy if exists "staff can write own sessions" on public.staff_sessions;
drop policy if exists "staff can update own sessions" on public.staff_sessions;
