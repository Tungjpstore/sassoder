create schema if not exists app_private;

revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated, service_role;

create or replace function app_private.adjust_staff_attendance_log_atomic(
  p_restaurant_id uuid,
  p_attendance_log_id uuid,
  p_staff_member_id uuid,
  p_actor_user_id uuid,
  p_clock_in_at timestamptz,
  p_clock_out_at timestamptz,
  p_attendance_state text,
  p_late_minutes integer,
  p_early_leave_minutes integer,
  p_overtime_minutes integer,
  p_work_minutes integer,
  p_anomaly_score integer,
  p_anomaly_flags text[],
  p_note text,
  p_approval_reason text,
  p_approval_payload jsonb
)
returns table(attendance jsonb, approval_id uuid)
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_existing public.attendance_logs%rowtype;
  v_updated public.attendance_logs%rowtype;
  v_approval public.attendance_approval_requests%rowtype;
  v_actor_staff_member_id uuid;
  v_conflict_id uuid;
  v_now timestamptz := now();
begin
  if p_actor_user_id is null then
    raise exception 'Missing attendance actor';
  end if;

  if p_clock_in_at is null then
    raise exception 'Invalid attendance clock-in time';
  end if;

  if p_clock_out_at is not null and p_clock_out_at <= p_clock_in_at then
    raise exception 'Clock-out must be after clock-in';
  end if;

  if p_attendance_state not in ('on_time', 'late', 'early_leave', 'overtime', 'absent') then
    raise exception 'Invalid attendance state';
  end if;

  if coalesce(p_late_minutes, 0) < 0 or coalesce(p_early_leave_minutes, 0) < 0 or coalesce(p_overtime_minutes, 0) < 0 or (p_work_minutes is not null and p_work_minutes < 0) then
    raise exception 'Attendance minutes cannot be negative';
  end if;

  if coalesce(p_anomaly_score, 0) < 0 or coalesce(p_anomaly_score, 0) > 100 then
    raise exception 'Invalid attendance anomaly score';
  end if;

  if p_approval_payload is null or jsonb_typeof(p_approval_payload) <> 'object' then
    raise exception 'Invalid attendance approval payload';
  end if;

  select *
  into v_existing
  from public.attendance_logs logs
  where logs.restaurant_id = p_restaurant_id
    and logs.id = p_attendance_log_id
    and logs.staff_member_id = p_staff_member_id
  for update;

  if not found then
    raise exception 'Attendance log not found';
  end if;

  if v_existing.staff_user_id = p_actor_user_id then
    raise exception 'Actor cannot adjust own attendance';
  end if;

  if p_clock_out_at is null then
    select logs.id
    into v_conflict_id
    from public.attendance_logs logs
    where logs.restaurant_id = p_restaurant_id
      and logs.staff_member_id = p_staff_member_id
      and logs.clock_out_at is null
      and logs.id <> p_attendance_log_id
    limit 1
    for update;

    if v_conflict_id is not null then
      raise exception 'Staff already has another open attendance session';
    end if;
  end if;

  update public.attendance_logs
  set
    clock_in_at = p_clock_in_at,
    clock_out_at = p_clock_out_at,
    clock_out_source = case when p_clock_out_at is null then null else 'manual' end,
    attendance_state = p_attendance_state,
    approval_state = 'pending',
    late_minutes = coalesce(p_late_minutes, 0),
    early_leave_minutes = coalesce(p_early_leave_minutes, 0),
    overtime_minutes = coalesce(p_overtime_minutes, 0),
    work_minutes = p_work_minutes,
    anomaly_score = greatest(coalesce(v_existing.anomaly_score, 0), coalesce(p_anomaly_score, 0)),
    anomaly_flags = coalesce(p_anomaly_flags, '{}'::text[]),
    note = p_note,
    updated_at = v_now
  where id = v_existing.id
    and restaurant_id = p_restaurant_id
  returning * into v_updated;

  select *
  into v_approval
  from public.attendance_approval_requests approvals
  where approvals.restaurant_id = p_restaurant_id
    and approvals.attendance_log_id = v_updated.id
    and approvals.request_type = 'attendance_edit'
    and approvals.status = 'pending'
  limit 1
  for update;

  if v_approval.id is not null then
    update public.attendance_approval_requests
    set
      reason = p_approval_reason,
      requested_payload = p_approval_payload,
      requested_by = p_actor_user_id,
      updated_at = v_now
    where id = v_approval.id
      and restaurant_id = p_restaurant_id
    returning * into v_approval;
  else
    insert into public.attendance_approval_requests (
      restaurant_id,
      attendance_log_id,
      staff_member_id,
      branch_id,
      request_type,
      status,
      reason,
      requested_payload,
      requested_by
    ) values (
      p_restaurant_id,
      v_updated.id,
      v_updated.staff_member_id,
      v_updated.branch_id,
      'attendance_edit',
      'pending',
      p_approval_reason,
      p_approval_payload,
      p_actor_user_id
    )
    returning * into v_approval;
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
    v_updated.branch_id,
    'attendance_log',
    v_updated.id::text,
    'attendance.adjusted',
    'warning',
    p_note,
    to_jsonb(v_existing),
    to_jsonb(v_updated),
    jsonb_build_object(
      'source', 'manual',
      'approval_id', v_approval.id,
      'hardFailAudit', true,
      'previousClockInAt', v_existing.clock_in_at,
      'previousClockOutAt', v_existing.clock_out_at,
      'nextClockInAt', v_updated.clock_in_at,
      'nextClockOutAt', v_updated.clock_out_at
    ),
    jsonb_build_object('mode', 'dashboard_staff_manual_adjustment', 'actorUserId', p_actor_user_id)
  );

  attendance := to_jsonb(v_updated);
  approval_id := v_approval.id;
  return next;
end;
$$;

revoke all on function app_private.adjust_staff_attendance_log_atomic(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, integer, integer, integer, integer, integer, text[], text, text, jsonb) from public, anon, authenticated;
grant execute on function app_private.adjust_staff_attendance_log_atomic(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, integer, integer, integer, integer, integer, text[], text, text, jsonb) to service_role;

create or replace function public.adjust_staff_attendance_log_atomic(
  p_restaurant_id uuid,
  p_attendance_log_id uuid,
  p_staff_member_id uuid,
  p_actor_user_id uuid,
  p_clock_in_at timestamptz,
  p_clock_out_at timestamptz,
  p_attendance_state text,
  p_late_minutes integer,
  p_early_leave_minutes integer,
  p_overtime_minutes integer,
  p_work_minutes integer,
  p_anomaly_score integer,
  p_anomaly_flags text[],
  p_note text,
  p_approval_reason text,
  p_approval_payload jsonb
)
returns table(attendance jsonb, approval_id uuid)
language sql
security invoker
set search_path = public, app_private
as $$
  select result.attendance, result.approval_id
  from app_private.adjust_staff_attendance_log_atomic(
    p_restaurant_id,
    p_attendance_log_id,
    p_staff_member_id,
    p_actor_user_id,
    p_clock_in_at,
    p_clock_out_at,
    p_attendance_state,
    p_late_minutes,
    p_early_leave_minutes,
    p_overtime_minutes,
    p_work_minutes,
    p_anomaly_score,
    p_anomaly_flags,
    p_note,
    p_approval_reason,
    p_approval_payload
  ) as result;
$$;

revoke all on function public.adjust_staff_attendance_log_atomic(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, integer, integer, integer, integer, integer, text[], text, text, jsonb) from public, anon, authenticated;
grant execute on function public.adjust_staff_attendance_log_atomic(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, integer, integer, integer, integer, integer, text[], text, text, jsonb) to service_role;

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

    update public.attendance_logs
    set
      approval_state = case when p_next_status = 'approved' then 'approved' else 'rejected' end,
      updated_at = v_now
    where id = v_attendance.id
      and restaurant_id = p_restaurant_id
    returning * into v_attendance;
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

create or replace function public.review_attendance_approval_atomic(
  p_restaurant_id uuid,
  p_approval_id uuid,
  p_actor_user_id uuid,
  p_next_status text,
  p_review_note text
)
returns table(approval jsonb, attendance jsonb)
language sql
security invoker
set search_path = public, app_private
as $$
  select result.approval, result.attendance
  from app_private.review_attendance_approval_atomic(
    p_restaurant_id,
    p_approval_id,
    p_actor_user_id,
    p_next_status,
    p_review_note
  ) as result;
$$;

revoke all on function public.review_attendance_approval_atomic(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_attendance_approval_atomic(uuid, uuid, uuid, text, text) to service_role;
