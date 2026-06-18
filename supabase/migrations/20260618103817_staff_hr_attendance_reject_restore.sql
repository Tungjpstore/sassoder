create or replace function app_private.review_attendance_approval_atomic(
  p_restaurant_id uuid,
  p_approval_id uuid,
  p_actor_user_id uuid,
  p_next_status text,
  p_review_note text
)
returns table(approval jsonb, attendance jsonb)
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_approval public.attendance_approval_requests%rowtype;
  v_updated_approval public.attendance_approval_requests%rowtype;
  v_attendance public.attendance_logs%rowtype;
  v_actor_staff_member_id uuid;
  v_target_user_id uuid;
  v_previous jsonb;
  v_restored_previous boolean := false;
  v_now timestamptz := now();
begin
  if p_actor_user_id is null then
    raise exception 'Missing attendance reviewer';
  end if;

  if p_next_status not in ('approved', 'rejected') then
    raise exception 'Invalid attendance approval decision';
  end if;

  select *
  into v_approval
  from public.attendance_approval_requests approvals
  where approvals.restaurant_id = p_restaurant_id
    and approvals.id = p_approval_id
  for update;

  if not found then
    raise exception 'Attendance approval not found';
  end if;

  if v_approval.status <> 'pending' then
    raise exception 'Attendance approval already reviewed';
  end if;

  if v_approval.requested_by = p_actor_user_id then
    raise exception 'Actor cannot review own attendance request';
  end if;

  select staff.user_id
  into v_target_user_id
  from public.staff_members staff
  where staff.restaurant_id = p_restaurant_id
    and staff.id = v_approval.staff_member_id
  for share;

  if v_target_user_id is null then
    raise exception 'Attendance approval staff not found';
  end if;

  if v_target_user_id = p_actor_user_id then
    raise exception 'Actor cannot review own attendance';
  end if;

  update public.attendance_approval_requests
  set
    status = p_next_status,
    reviewed_by = p_actor_user_id,
    reviewed_at = v_now,
    review_note = p_review_note,
    updated_at = v_now
  where id = v_approval.id
    and restaurant_id = p_restaurant_id
    and status = 'pending'
  returning * into v_updated_approval;

  if not found then
    raise exception 'Attendance approval already reviewed';
  end if;

  if v_approval.attendance_log_id is not null then
    select *
    into v_attendance
    from public.attendance_logs logs
    where logs.restaurant_id = p_restaurant_id
      and logs.id = v_approval.attendance_log_id
    for update;

    if not found then
      raise exception 'Attendance log for approval not found';
    end if;

    v_previous := v_approval.requested_payload -> 'previousAttendance';

    if p_next_status = 'rejected'
      and v_approval.request_type = 'attendance_edit'
      and jsonb_typeof(v_previous) = 'object'
    then
      update public.attendance_logs
      set
        clock_in_at = coalesce(nullif(v_previous ->> 'clockInAt', '')::timestamptz, v_attendance.clock_in_at),
        clock_out_at = case when v_previous ? 'clockOutAt' then nullif(v_previous ->> 'clockOutAt', '')::timestamptz else v_attendance.clock_out_at end,
        clock_out_source = case when v_previous ? 'clockOutSource' then nullif(v_previous ->> 'clockOutSource', '') else v_attendance.clock_out_source end,
        attendance_state = case
          when v_previous ->> 'attendanceState' in ('on_time', 'late', 'early_leave', 'overtime', 'absent') then v_previous ->> 'attendanceState'
          else v_attendance.attendance_state
        end,
        approval_state = case
          when v_previous ->> 'approvalState' in ('auto_approved', 'pending', 'approved', 'rejected') then v_previous ->> 'approvalState'
          else 'auto_approved'
        end,
        late_minutes = coalesce(nullif(v_previous ->> 'lateMinutes', '')::integer, v_attendance.late_minutes),
        early_leave_minutes = coalesce(nullif(v_previous ->> 'earlyLeaveMinutes', '')::integer, v_attendance.early_leave_minutes),
        overtime_minutes = coalesce(nullif(v_previous ->> 'overtimeMinutes', '')::integer, v_attendance.overtime_minutes),
        work_minutes = case when v_previous ? 'workMinutes' then nullif(v_previous ->> 'workMinutes', '')::integer else v_attendance.work_minutes end,
        anomaly_score = coalesce(nullif(v_previous ->> 'anomalyScore', '')::integer, v_attendance.anomaly_score),
        anomaly_flags = case
          when jsonb_typeof(v_previous -> 'anomalyFlags') = 'array' then array(select jsonb_array_elements_text(v_previous -> 'anomalyFlags'))
          else v_attendance.anomaly_flags
        end,
        note = case when v_previous ? 'note' then v_previous ->> 'note' else v_attendance.note end,
        updated_at = v_now
      where id = v_attendance.id
        and restaurant_id = p_restaurant_id
      returning * into v_attendance;

      v_restored_previous := true;
    else
      update public.attendance_logs
      set
        approval_state = case when p_next_status = 'approved' then 'approved' else 'rejected' end,
        updated_at = v_now
      where id = v_attendance.id
        and restaurant_id = p_restaurant_id
      returning * into v_attendance;
    end if;
  end if;

  v_actor_staff_member_id := app_private.active_staff_member_id(p_restaurant_id, p_actor_user_id);

  insert into public.staff_activity_logs (
    restaurant_id,
    actor_user_id,
    actor_staff_member_id,
    branch_id,
    entity_type,
    entity_id,
    action,
    severity,
    reason,
    before_state,
    after_state,
    metadata,
    device_info
  ) values (
    p_restaurant_id,
    p_actor_user_id,
    v_actor_staff_member_id,
    v_updated_approval.branch_id,
    'attendance_approval_request',
    v_updated_approval.id::text,
    case when p_next_status = 'approved' then 'attendance.approval_approved' else 'attendance.approval_rejected' end,
    case when p_next_status = 'approved' then 'info' else 'warning' end,
    coalesce(nullif(trim(p_review_note), ''), v_updated_approval.reason),
    to_jsonb(v_approval),
    to_jsonb(v_updated_approval),
    jsonb_build_object(
      'attendanceLogId', v_updated_approval.attendance_log_id,
      'requestType', v_updated_approval.request_type,
      'requestedPayload', v_updated_approval.requested_payload,
      'restoredPreviousAttendance', v_restored_previous,
      'hardFailAudit', true
    ),
    '{}'::jsonb
  );

  approval := to_jsonb(v_updated_approval);
  attendance := case when v_attendance.id is null then null else to_jsonb(v_attendance) end;
  return next;
end;
$$;

revoke all on function app_private.review_attendance_approval_atomic(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function app_private.review_attendance_approval_atomic(uuid, uuid, uuid, text, text) to service_role;
