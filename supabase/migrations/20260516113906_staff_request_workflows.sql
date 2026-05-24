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
      'shift_swap'
    )
  );

create index if not exists attendance_approvals_staff_type_status_idx
  on public.attendance_approval_requests (restaurant_id, staff_member_id, request_type, status, created_at desc);

create index if not exists attendance_approvals_branch_type_status_idx
  on public.attendance_approval_requests (restaurant_id, branch_id, request_type, status, created_at desc)
  where branch_id is not null;
