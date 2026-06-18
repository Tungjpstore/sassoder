create schema if not exists app_private;

revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated, service_role;

do $$
begin
  if to_regprocedure('app_private.current_restaurant_id()') is not null then
    grant execute on function app_private.current_restaurant_id() to authenticated, service_role;
  end if;

  if to_regprocedure('app_private.current_user_role()') is not null then
    grant execute on function app_private.current_user_role() to authenticated, service_role;
  end if;
end $$;

create or replace function app_private.create_staff_user_profile(
  p_user_id uuid,
  p_restaurant_id uuid,
  p_actor_user_id uuid,
  p_email text,
  p_role_scope public.user_role,
  p_staff_title text,
  p_permission_profile text,
  p_permissions jsonb,
  p_role_id uuid,
  p_role_code text,
  p_full_name text,
  p_phone text default null,
  p_username text default null,
  p_pin_hash text default null,
  p_pin_lookup_hash text default null,
  p_date_of_birth date default null,
  p_hometown text default null,
  p_must_change_app_password boolean default true,
  p_branch_id uuid default null,
  p_notes text default null
)
returns table(
  user_id uuid,
  staff_member_id uuid,
  employee_code text,
  employee_number integer,
  must_change_app_password boolean,
  branch_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_member public.staff_members%rowtype;
  v_actor_staff_member_id uuid;
  v_branch_id uuid;
  v_now timestamptz := now();
begin
  if p_user_id is null then
    raise exception 'Missing staff auth user id';
  end if;

  if p_restaurant_id is null then
    raise exception 'Missing staff restaurant id';
  end if;

  if p_email is null or position('@' in p_email) <= 1 then
    raise exception 'Invalid staff email';
  end if;

  if p_full_name is null or length(trim(p_full_name)) < 2 then
    raise exception 'Invalid staff full name';
  end if;

  if p_permissions is null or jsonb_typeof(p_permissions) <> 'array' then
    raise exception 'Invalid staff permission payload';
  end if;

  if p_role_code is null or p_role_code !~ '^[a-z0-9_-]{2,40}$' then
    raise exception 'Invalid staff role code';
  end if;

  if p_role_id is not null and not exists (
    select 1
    from public.staff_roles role
    where role.id = p_role_id
      and role.restaurant_id = p_restaurant_id
      and role.code = p_role_code
      and role.role_scope = p_role_scope
      and role.is_active = true
  ) then
    raise exception 'Invalid staff role assignment';
  end if;

  if p_branch_id is not null then
    select branch.id
    into v_branch_id
    from public.store_branches branch
    where branch.id = p_branch_id
      and branch.restaurant_id = p_restaurant_id
      and branch.is_active = true
    for share;

    if v_branch_id is null then
      raise exception 'Invalid staff branch assignment';
    end if;
  end if;

  if p_actor_user_id is not null then
    select staff.id
    into v_actor_staff_member_id
    from public.staff_members staff
    where staff.restaurant_id = p_restaurant_id
      and staff.user_id = p_actor_user_id
      and staff.archived_at is null
    limit 1;
  end if;

  insert into public.users (
    id,
    email,
    role,
    restaurant_id,
    staff_title,
    permission_profile,
    permissions
  )
  values (
    p_user_id,
    lower(trim(p_email)),
    p_role_scope,
    p_restaurant_id,
    coalesce(nullif(trim(p_staff_title), ''), 'Phục vụ'),
    coalesce(nullif(trim(p_permission_profile), ''), 'service'),
    p_permissions
  );

  insert into public.staff_members (
    restaurant_id,
    user_id,
    role_id,
    role_code,
    full_name,
    phone,
    username,
    pin_hash,
    pin_lookup_hash,
    pin_attempts,
    pin_locked_until,
    pin_updated_at,
    date_of_birth,
    hometown,
    must_change_app_password,
    employment_status,
    notes
  )
  values (
    p_restaurant_id,
    p_user_id,
    p_role_id,
    p_role_code,
    trim(p_full_name),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_username, '')), ''),
    p_pin_hash,
    p_pin_lookup_hash,
    0,
    null,
    case when p_pin_hash is not null then v_now else null end,
    p_date_of_birth,
    nullif(trim(coalesce(p_hometown, '')), ''),
    coalesce(p_must_change_app_password, true),
    'active',
    nullif(trim(coalesce(p_notes, '')), '')
  )
  returning * into v_staff_member;

  if v_branch_id is not null then
    insert into public.staff_branch_assignments (
      restaurant_id,
      staff_member_id,
      branch_id,
      is_primary,
      assignment_status,
      starts_at
    )
    values (
      p_restaurant_id,
      v_staff_member.id,
      v_branch_id,
      true,
      'active',
      v_now
    );
  end if;

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
  )
  values (
    p_restaurant_id,
    p_actor_user_id,
    v_actor_staff_member_id,
    v_branch_id,
    'staff_member',
    v_staff_member.id::text,
    'staff.created',
    'info',
    'Tạo nhân viên từ HR console',
    null,
    jsonb_build_object(
      'user_id', p_user_id,
      'staff_member_id', v_staff_member.id,
      'employee_code', v_staff_member.employee_code,
      'role_code', v_staff_member.role_code,
      'full_name', v_staff_member.full_name,
      'branch_id', v_branch_id,
      'must_change_app_password', v_staff_member.must_change_app_password
    ),
    jsonb_build_object(
      'source', 'create_staff_user_profile_rpc',
      'hardFailAudit', true,
      'diff', null
    ),
    '{}'::jsonb
  );

  user_id := p_user_id;
  staff_member_id := v_staff_member.id;
  employee_code := v_staff_member.employee_code;
  employee_number := v_staff_member.employee_number;
  must_change_app_password := v_staff_member.must_change_app_password;
  branch_id := v_branch_id;
  return next;
end;
$$;

revoke all on function app_private.create_staff_user_profile(
  uuid,
  uuid,
  uuid,
  text,
  public.user_role,
  text,
  text,
  jsonb,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  text,
  boolean,
  uuid,
  text
) from public, anon, authenticated;
grant execute on function app_private.create_staff_user_profile(
  uuid,
  uuid,
  uuid,
  text,
  public.user_role,
  text,
  text,
  jsonb,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  text,
  boolean,
  uuid,
  text
) to service_role;

create or replace function public.create_staff_user_profile(
  p_user_id uuid,
  p_restaurant_id uuid,
  p_actor_user_id uuid,
  p_email text,
  p_role_scope public.user_role,
  p_staff_title text,
  p_permission_profile text,
  p_permissions jsonb,
  p_role_id uuid,
  p_role_code text,
  p_full_name text,
  p_phone text default null,
  p_username text default null,
  p_pin_hash text default null,
  p_pin_lookup_hash text default null,
  p_date_of_birth date default null,
  p_hometown text default null,
  p_must_change_app_password boolean default true,
  p_branch_id uuid default null,
  p_notes text default null
)
returns table(
  user_id uuid,
  staff_member_id uuid,
  employee_code text,
  employee_number integer,
  must_change_app_password boolean,
  branch_id uuid
)
language sql
security invoker
set search_path = public, app_private
as $$
  select result.user_id,
    result.staff_member_id,
    result.employee_code,
    result.employee_number,
    result.must_change_app_password,
    result.branch_id
  from app_private.create_staff_user_profile(
    p_user_id,
    p_restaurant_id,
    p_actor_user_id,
    p_email,
    p_role_scope,
    p_staff_title,
    p_permission_profile,
    p_permissions,
    p_role_id,
    p_role_code,
    p_full_name,
    p_phone,
    p_username,
    p_pin_hash,
    p_pin_lookup_hash,
    p_date_of_birth,
    p_hometown,
    p_must_change_app_password,
    p_branch_id,
    p_notes
  ) as result;
$$;

revoke all on function public.create_staff_user_profile(
  uuid,
  uuid,
  uuid,
  text,
  public.user_role,
  text,
  text,
  jsonb,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  text,
  boolean,
  uuid,
  text
) from public, anon, authenticated;
grant execute on function public.create_staff_user_profile(
  uuid,
  uuid,
  uuid,
  text,
  public.user_role,
  text,
  text,
  jsonb,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  text,
  boolean,
  uuid,
  text
) to service_role;
