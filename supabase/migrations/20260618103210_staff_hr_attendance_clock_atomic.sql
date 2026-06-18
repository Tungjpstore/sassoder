create schema if not exists app_private;

revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated, service_role;

create or replace function app_private.normalize_attendance_approval_requests(p_requests jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  if p_requests is null then
    return '[]'::jsonb;
  end if;

  if jsonb_typeof(p_requests) <> 'array' then
    raise exception 'Invalid attendance approval request payload';
  end if;

  return p_requests;
end;
$$;

revoke all on function app_private.normalize_attendance_approval_requests(jsonb) from public, anon, authenticated;
grant execute on function app_private.normalize_attendance_approval_requests(jsonb) to service_role;

create or replace function app_private.apply_attendance_approval_requests(
  p_restaurant_id uuid,
  p_attendance_log_id uuid,
  p_staff_member_id uuid,
  p_branch_id uuid,
  p_actor_user_id uuid,
  p_requests jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_requests jsonb := app_private.normalize_attendance_approval_requests(p_requests);
  v_request jsonb;
  v_request_type text;
  v_reason text;
  v_payload jsonb;
  v_approval public.attendance_approval_requests%rowtype;
  v_results jsonb := '[]'::jsonb;
begin
  for v_request in select value from jsonb_array_elements(v_requests)
  loop
    if jsonb_typeof(v_request) <> 'object' then
      raise exception 'Invalid attendance approval request item';
    end if;

    v_request_type := coalesce(nullif(v_request ->> 'requestType', ''), nullif(v_request ->> 'request_type', ''));
    v_reason := nullif(v_request ->> 'reason', '');
    v_payload := coalesce(v_request -> 'payload', v_request -> 'requestedPayload', '{}'::jsonb);

    if v_request_type not in ('outside_location', 'attendance_edit', 'overtime', 'shift_override', 'manual_clock_in', 'leave_request', 'shift_swap', 'device_restriction') then
      raise exception 'Invalid attendance approval request type';
    end if;

    if jsonb_typeof(v_payload) <> 'object' then
      raise exception 'Invalid attendance approval requested payload';
    end if;

    select *
    into v_approval
    from public.attendance_approval_requests approvals
    where approvals.restaurant_id = p_restaurant_id
      and approvals.attendance_log_id = p_attendance_log_id
      and approvals.request_type = v_request_type
      and approvals.status = 'pending'
    limit 1
    for update;

    if v_approval.id is not null then
      update public.attendance_approval_requests
      set
        reason = coalesce(v_reason, reason),
        requested_payload = v_payload,
        requested_by = p_actor_user_id,
        updated_at = now()
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
        p_attendance_log_id,
        p_staff_member_id,
        p_branch_id,
        v_request_type,
        'pending',
        v_reason,
        v_payload,
        p_actor_user_id
      )
      returning * into v_approval;
    end if;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'id', v_approval.id,
      'attendance_log_id', v_approval.attendance_log_id,
      'staff_member_id', v_approval.staff_member_id,
      'branch_id', v_approval.branch_id,
      'request_type', v_approval.request_type,
      'reason', v_approval.reason,
      'requested_payload', v_approval.requested_payload
    ));
  end loop;

  return v_results;
end;
$$;

revoke all on function app_private.apply_attendance_approval_requests(uuid, uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function app_private.apply_attendance_approval_requests(uuid, uuid, uuid, uuid, uuid, jsonb) to service_role;

create or replace function app_private.clock_in_staff_attendance_atomic(
  p_restaurant_id uuid,
  p_actor_user_id uuid,
  p_staff_member_id uuid,
  p_staff_user_id uuid,
  p_branch_id uuid,
  p_shift_id uuid,
  p_shift_assignment_id uuid,
  p_clock_in_at timestamptz,
  p_clock_in_source text,
  p_clock_in_lat double precision,
  p_clock_in_lng double precision,
  p_clock_in_accuracy_meters numeric,
  p_clock_in_distance_meters numeric,
  p_clock_in_device jsonb,
  p_attendance_state text,
  p_approval_state text,
  p_late_minutes integer,
  p_anomaly_score integer,
  p_anomaly_flags text[],
  p_offline_queue_key text,
  p_raw_payload jsonb,
  p_note text,
  p_approval_requests jsonb
)
returns table(attendance jsonb, approvals jsonb)
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_attendance public.attendance_logs%rowtype;
  v_actor_staff_member_id uuid;
  v_conflict_id uuid;
  v_approvals jsonb := '[]'::jsonb;
begin
  if p_actor_user_id is null then
    raise exception 'Missing attendance actor';
  end if;

  if p_clock_in_at is null then
    raise exception 'Invalid attendance clock-in time';
  end if;

  if p_clock_in_source not in ('gps', 'qr', 'wifi', 'manual', 'offline_sync') then
    raise exception 'Invalid attendance clock-in source';
  end if;

  if p_attendance_state not in ('on_time', 'late', 'early_leave', 'overtime', 'absent') then
    raise exception 'Invalid attendance state';
  end if;

  if p_approval_state not in ('auto_approved', 'pending', 'approved', 'rejected') then
    raise exception 'Invalid attendance approval state';
  end if;

  if coalesce(p_late_minutes, 0) < 0 or coalesce(p_anomaly_score, 0) < 0 or coalesce(p_anomaly_score, 0) > 100 then
    raise exception 'Invalid attendance metrics';
  end if;

  if coalesce(jsonb_typeof(p_clock_in_device), 'object') <> 'object' or coalesce(jsonb_typeof(p_raw_payload), 'object') <> 'object' then
    raise exception 'Invalid attendance device payload';
  end if;

  perform 1
  from public.staff_members staff
  where staff.restaurant_id = p_restaurant_id
    and staff.id = p_staff_member_id
    and staff.user_id = p_staff_user_id
  for share;

  if not found then
    raise exception 'Attendance staff not found';
  end if;

  select logs.id
  into v_conflict_id
  from public.attendance_logs logs
  where logs.restaurant_id = p_restaurant_id
    and logs.staff_member_id = p_staff_member_id
    and logs.clock_out_at is null
  limit 1
  for update;

  if v_conflict_id is not null then
    raise exception 'Staff already has another open attendance session';
  end if;

  insert into public.attendance_logs (
    restaurant_id,
    staff_member_id,
    staff_user_id,
    branch_id,
    shift_id,
    shift_assignment_id,
    clock_in_at,
    clock_in_source,
    clock_in_lat,
    clock_in_lng,
    clock_in_accuracy_meters,
    clock_in_distance_meters,
    clock_in_device,
    attendance_state,
    approval_state,
    late_minutes,
    anomaly_score,
    anomaly_flags,
    offline_queue_key,
    raw_payload,
    note
  ) values (
    p_restaurant_id,
    p_staff_member_id,
    p_staff_user_id,
    p_branch_id,
    p_shift_id,
    p_shift_assignment_id,
    p_clock_in_at,
    p_clock_in_source,
    p_clock_in_lat,
    p_clock_in_lng,
    p_clock_in_accuracy_meters,
    p_clock_in_distance_meters,
    coalesce(p_clock_in_device, '{}'::jsonb),
    p_attendance_state,
    p_approval_state,
    coalesce(p_late_minutes, 0),
    coalesce(p_anomaly_score, 0),
    coalesce(p_anomaly_flags, '{}'::text[]),
    nullif(p_offline_queue_key, ''),
    coalesce(p_raw_payload, '{}'::jsonb),
    p_note
  )
  returning * into v_attendance;

  v_approvals := app_private.apply_attendance_approval_requests(
    p_restaurant_id,
    v_attendance.id,
    p_staff_member_id,
    p_branch_id,
    p_actor_user_id,
    p_approval_requests
  );

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
    after_state,
    metadata,
    device_info
  ) values (
    p_restaurant_id,
    p_actor_user_id,
    v_actor_staff_member_id,
    p_branch_id,
    'attendance_log',
    v_attendance.id::text,
    'attendance.clock_in',
    case when p_approval_state = 'pending' or coalesce(p_anomaly_score, 0) >= 60 then 'warning' else 'info' end,
    p_note,
    to_jsonb(v_attendance),
    coalesce(p_raw_payload, '{}'::jsonb) || jsonb_build_object(
      'approvalIds', coalesce((select jsonb_agg(value ->> 'id') from jsonb_array_elements(v_approvals)), '[]'::jsonb),
      'approvalRequestCount', jsonb_array_length(v_approvals),
      'hardFailAudit', true
    ),
    coalesce(p_clock_in_device, '{}'::jsonb)
  );

  attendance := to_jsonb(v_attendance);
  approvals := v_approvals;
  return next;
end;
$$;

revoke all on function app_private.clock_in_staff_attendance_atomic(uuid, uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, text, double precision, double precision, numeric, numeric, jsonb, text, text, integer, integer, text[], text, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function app_private.clock_in_staff_attendance_atomic(uuid, uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, text, double precision, double precision, numeric, numeric, jsonb, text, text, integer, integer, text[], text, jsonb, text, jsonb) to service_role;

create or replace function public.clock_in_staff_attendance_atomic(
  p_restaurant_id uuid,
  p_actor_user_id uuid,
  p_staff_member_id uuid,
  p_staff_user_id uuid,
  p_branch_id uuid,
  p_shift_id uuid,
  p_shift_assignment_id uuid,
  p_clock_in_at timestamptz,
  p_clock_in_source text,
  p_clock_in_lat double precision,
  p_clock_in_lng double precision,
  p_clock_in_accuracy_meters numeric,
  p_clock_in_distance_meters numeric,
  p_clock_in_device jsonb,
  p_attendance_state text,
  p_approval_state text,
  p_late_minutes integer,
  p_anomaly_score integer,
  p_anomaly_flags text[],
  p_offline_queue_key text,
  p_raw_payload jsonb,
  p_note text,
  p_approval_requests jsonb
)
returns table(attendance jsonb, approvals jsonb)
language sql
security invoker
set search_path = public, app_private
as $$
  select result.attendance, result.approvals
  from app_private.clock_in_staff_attendance_atomic(
    p_restaurant_id,
    p_actor_user_id,
    p_staff_member_id,
    p_staff_user_id,
    p_branch_id,
    p_shift_id,
    p_shift_assignment_id,
    p_clock_in_at,
    p_clock_in_source,
    p_clock_in_lat,
    p_clock_in_lng,
    p_clock_in_accuracy_meters,
    p_clock_in_distance_meters,
    p_clock_in_device,
    p_attendance_state,
    p_approval_state,
    p_late_minutes,
    p_anomaly_score,
    p_anomaly_flags,
    p_offline_queue_key,
    p_raw_payload,
    p_note,
    p_approval_requests
  ) as result;
$$;

revoke all on function public.clock_in_staff_attendance_atomic(uuid, uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, text, double precision, double precision, numeric, numeric, jsonb, text, text, integer, integer, text[], text, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.clock_in_staff_attendance_atomic(uuid, uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, text, double precision, double precision, numeric, numeric, jsonb, text, text, integer, integer, text[], text, jsonb, text, jsonb) to service_role;

create or replace function app_private.clock_out_staff_attendance_atomic(
  p_restaurant_id uuid,
  p_actor_user_id uuid,
  p_attendance_log_id uuid,
  p_staff_member_id uuid,
  p_branch_id uuid,
  p_clock_out_at timestamptz,
  p_clock_out_source text,
  p_clock_out_lat double precision,
  p_clock_out_lng double precision,
  p_clock_out_accuracy_meters numeric,
  p_clock_out_distance_meters numeric,
  p_clock_out_device jsonb,
  p_attendance_state text,
  p_approval_state text,
  p_early_leave_minutes integer,
  p_overtime_minutes integer,
  p_work_minutes integer,
  p_anomaly_score integer,
  p_anomaly_flags text[],
  p_note text,
  p_audit_metadata jsonb,
  p_approval_requests jsonb
)
returns table(attendance jsonb, approvals jsonb)
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_existing public.attendance_logs%rowtype;
  v_updated public.attendance_logs%rowtype;
  v_actor_staff_member_id uuid;
  v_approvals jsonb := '[]'::jsonb;
begin
  if p_actor_user_id is null then
    raise exception 'Missing attendance actor';
  end if;

  if p_clock_out_at is null then
    raise exception 'Invalid attendance clock-out time';
  end if;

  if p_clock_out_source not in ('gps', 'qr', 'wifi', 'manual', 'offline_sync') then
    raise exception 'Invalid attendance clock-out source';
  end if;

  if p_attendance_state not in ('on_time', 'late', 'early_leave', 'overtime', 'absent') then
    raise exception 'Invalid attendance state';
  end if;

  if p_approval_state not in ('auto_approved', 'pending', 'approved', 'rejected') then
    raise exception 'Invalid attendance approval state';
  end if;

  if coalesce(p_early_leave_minutes, 0) < 0 or coalesce(p_overtime_minutes, 0) < 0 or (p_work_minutes is not null and p_work_minutes < 0) then
    raise exception 'Attendance minutes cannot be negative';
  end if;

  if coalesce(p_anomaly_score, 0) < 0 or coalesce(p_anomaly_score, 0) > 100 then
    raise exception 'Invalid attendance anomaly score';
  end if;

  if coalesce(jsonb_typeof(p_clock_out_device), 'object') <> 'object' or coalesce(jsonb_typeof(p_audit_metadata), 'object') <> 'object' then
    raise exception 'Invalid attendance clock-out payload';
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

  if v_existing.clock_out_at is not null then
    raise exception 'Attendance session already closed';
  end if;

  if p_clock_out_at <= v_existing.clock_in_at then
    raise exception 'Clock-out must be after clock-in';
  end if;

  update public.attendance_logs
  set
    clock_out_at = p_clock_out_at,
    clock_out_source = p_clock_out_source,
    clock_out_lat = p_clock_out_lat,
    clock_out_lng = p_clock_out_lng,
    clock_out_accuracy_meters = p_clock_out_accuracy_meters,
    clock_out_distance_meters = p_clock_out_distance_meters,
    clock_out_device = coalesce(p_clock_out_device, '{}'::jsonb),
    attendance_state = p_attendance_state,
    approval_state = p_approval_state,
    early_leave_minutes = coalesce(p_early_leave_minutes, 0),
    overtime_minutes = coalesce(p_overtime_minutes, 0),
    work_minutes = p_work_minutes,
    anomaly_score = coalesce(p_anomaly_score, 0),
    anomaly_flags = coalesce(p_anomaly_flags, '{}'::text[]),
    note = p_note,
    updated_at = now()
  where id = v_existing.id
    and restaurant_id = p_restaurant_id
    and clock_out_at is null
  returning * into v_updated;

  if not found then
    raise exception 'Attendance session already closed';
  end if;

  v_approvals := app_private.apply_attendance_approval_requests(
    p_restaurant_id,
    v_updated.id,
    p_staff_member_id,
    p_branch_id,
    p_actor_user_id,
    p_approval_requests
  );

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
    p_branch_id,
    'attendance_log',
    v_updated.id::text,
    'attendance.clock_out',
    case when p_approval_state = 'pending' or coalesce(p_anomaly_score, 0) >= 60 then 'warning' else 'info' end,
    p_note,
    to_jsonb(v_existing),
    to_jsonb(v_updated),
    coalesce(p_audit_metadata, '{}'::jsonb) || jsonb_build_object(
      'approvalIds', coalesce((select jsonb_agg(value ->> 'id') from jsonb_array_elements(v_approvals)), '[]'::jsonb),
      'approvalRequestCount', jsonb_array_length(v_approvals),
      'hardFailAudit', true
    ),
    coalesce(p_clock_out_device, '{}'::jsonb)
  );

  attendance := to_jsonb(v_updated);
  approvals := v_approvals;
  return next;
end;
$$;

revoke all on function app_private.clock_out_staff_attendance_atomic(uuid, uuid, uuid, uuid, uuid, timestamptz, text, double precision, double precision, numeric, numeric, jsonb, text, text, integer, integer, integer, integer, text[], text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function app_private.clock_out_staff_attendance_atomic(uuid, uuid, uuid, uuid, uuid, timestamptz, text, double precision, double precision, numeric, numeric, jsonb, text, text, integer, integer, integer, integer, text[], text, jsonb, jsonb) to service_role;

create or replace function public.clock_out_staff_attendance_atomic(
  p_restaurant_id uuid,
  p_actor_user_id uuid,
  p_attendance_log_id uuid,
  p_staff_member_id uuid,
  p_branch_id uuid,
  p_clock_out_at timestamptz,
  p_clock_out_source text,
  p_clock_out_lat double precision,
  p_clock_out_lng double precision,
  p_clock_out_accuracy_meters numeric,
  p_clock_out_distance_meters numeric,
  p_clock_out_device jsonb,
  p_attendance_state text,
  p_approval_state text,
  p_early_leave_minutes integer,
  p_overtime_minutes integer,
  p_work_minutes integer,
  p_anomaly_score integer,
  p_anomaly_flags text[],
  p_note text,
  p_audit_metadata jsonb,
  p_approval_requests jsonb
)
returns table(attendance jsonb, approvals jsonb)
language sql
security invoker
set search_path = public, app_private
as $$
  select result.attendance, result.approvals
  from app_private.clock_out_staff_attendance_atomic(
    p_restaurant_id,
    p_actor_user_id,
    p_attendance_log_id,
    p_staff_member_id,
    p_branch_id,
    p_clock_out_at,
    p_clock_out_source,
    p_clock_out_lat,
    p_clock_out_lng,
    p_clock_out_accuracy_meters,
    p_clock_out_distance_meters,
    p_clock_out_device,
    p_attendance_state,
    p_approval_state,
    p_early_leave_minutes,
    p_overtime_minutes,
    p_work_minutes,
    p_anomaly_score,
    p_anomaly_flags,
    p_note,
    p_audit_metadata,
    p_approval_requests
  ) as result;
$$;

revoke all on function public.clock_out_staff_attendance_atomic(uuid, uuid, uuid, uuid, uuid, timestamptz, text, double precision, double precision, numeric, numeric, jsonb, text, text, integer, integer, integer, integer, text[], text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.clock_out_staff_attendance_atomic(uuid, uuid, uuid, uuid, uuid, timestamptz, text, double precision, double precision, numeric, numeric, jsonb, text, text, integer, integer, integer, integer, text[], text, jsonb, jsonb) to service_role;
