create schema if not exists app_private;

revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated, service_role;

create or replace function app_private.active_staff_member_id(
  p_restaurant_id uuid,
  p_user_id uuid
)
returns uuid
language sql
security definer
set search_path = public
as $$
  select staff.id
  from public.staff_members staff
  where staff.restaurant_id = p_restaurant_id
    and staff.user_id = p_user_id
    and staff.archived_at is null
  limit 1;
$$;

revoke all on function app_private.active_staff_member_id(uuid, uuid) from public, anon, authenticated;
grant execute on function app_private.active_staff_member_id(uuid, uuid) to service_role;

create or replace function app_private.ensure_staff_role_assignment(
  p_restaurant_id uuid,
  p_role_id uuid,
  p_role_code text,
  p_role_scope public.user_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
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
end;
$$;

revoke all on function app_private.ensure_staff_role_assignment(uuid, uuid, text, public.user_role) from public, anon, authenticated;
grant execute on function app_private.ensure_staff_role_assignment(uuid, uuid, text, public.user_role) to service_role;

create or replace function app_private.prevent_last_active_admin(
  p_restaurant_id uuid,
  p_user_id uuid,
  p_next_role public.user_role,
  p_next_account_status public.platform_user_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_role public.user_role;
  v_active_admin_count integer;
begin
  select users.role
  into v_current_role
  from public.users users
  where users.id = p_user_id
    and users.restaurant_id = p_restaurant_id
  for update;

  if not found then
    raise exception 'Staff user not found';
  end if;

  if v_current_role = 'ADMIN' and (p_next_role <> 'ADMIN' or p_next_account_status <> 'active') then
    perform 1
    from public.users users
    where users.restaurant_id = p_restaurant_id
      and users.role = 'ADMIN'
      and users.account_status = 'active'
    for update;

    select count(*)::integer
    into v_active_admin_count
    from public.users users
    where users.restaurant_id = p_restaurant_id
      and users.role = 'ADMIN'
      and users.account_status = 'active';

    if coalesce(v_active_admin_count, 0) <= 1 then
      raise exception 'Last active admin cannot be changed';
    end if;
  end if;
end;
$$;

revoke all on function app_private.prevent_last_active_admin(uuid, uuid, public.user_role, public.platform_user_status) from public, anon, authenticated;
grant execute on function app_private.prevent_last_active_admin(uuid, uuid, public.user_role, public.platform_user_status) to service_role;

create or replace function app_private.sync_staff_primary_branch(
  p_restaurant_id uuid,
  p_staff_member_id uuid,
  p_branch_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_assignment_id uuid;
  v_now timestamptz := now();
begin
  if p_branch_id is null then
    return null;
  end if;

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

  update public.staff_branch_assignments assignment
  set
    is_primary = false,
    assignment_status = 'paused',
    ended_at = v_now,
    updated_at = v_now
  where assignment.restaurant_id = p_restaurant_id
    and assignment.staff_member_id = p_staff_member_id
    and assignment.is_primary = true
    and assignment.branch_id <> v_branch_id
    and assignment.ended_at is null;

  select assignment.id
  into v_assignment_id
  from public.staff_branch_assignments assignment
  where assignment.restaurant_id = p_restaurant_id
    and assignment.staff_member_id = p_staff_member_id
    and assignment.branch_id = v_branch_id
  order by assignment.created_at desc
  limit 1
  for update;

  if v_assignment_id is not null then
    update public.staff_branch_assignments
    set
      is_primary = true,
      assignment_status = 'active',
      starts_at = v_now,
      ended_at = null,
      updated_at = v_now
    where id = v_assignment_id;
  else
    insert into public.staff_branch_assignments (
      restaurant_id,
      staff_member_id,
      branch_id,
      is_primary,
      assignment_status,
      starts_at
    ) values (
      p_restaurant_id,
      p_staff_member_id,
      v_branch_id,
      true,
      'active',
      v_now
    );
  end if;

  return v_branch_id;
end;
$$;

revoke all on function app_private.sync_staff_primary_branch(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function app_private.sync_staff_primary_branch(uuid, uuid, uuid) to service_role;

create or replace function app_private.update_staff_user_profile(
  p_restaurant_id uuid,
  p_user_id uuid,
  p_actor_user_id uuid,
  p_role_scope public.user_role,
  p_staff_title text,
  p_permission_profile text,
  p_permissions jsonb,
  p_role_id uuid,
  p_role_code text,
  p_profile jsonb,
  p_branch_id uuid default null
)
returns table(user_id uuid, staff_member_id uuid, branch_id uuid)
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_member public.staff_members%rowtype;
  v_actor_staff_member_id uuid;
  v_branch_id uuid;
  v_employment_status text;
  v_now timestamptz := now();
begin
  if p_user_id = p_actor_user_id and p_role_scope <> 'ADMIN' then
    raise exception 'Actor cannot demote own admin account';
  end if;

  if p_user_id = p_actor_user_id and coalesce(p_profile->>'employmentStatus', 'active') <> 'active' then
    raise exception 'Actor cannot lock own account';
  end if;

  if p_profile is null or jsonb_typeof(p_profile) <> 'object' then
    raise exception 'Invalid staff profile payload';
  end if;

  if p_permissions is null or jsonb_typeof(p_permissions) <> 'array' then
    raise exception 'Invalid staff permission payload';
  end if;

  perform app_private.ensure_staff_role_assignment(p_restaurant_id, p_role_id, p_role_code, p_role_scope);
  perform app_private.prevent_last_active_admin(
    p_restaurant_id,
    p_user_id,
    p_role_scope,
    case when coalesce(p_profile->>'employmentStatus', 'active') in ('suspended', 'resigned') then 'blocked'::public.platform_user_status else 'active'::public.platform_user_status end
  );

  select staff.*
  into v_member
  from public.staff_members staff
  where staff.restaurant_id = p_restaurant_id
    and staff.user_id = p_user_id
  for update;

  if not found then
    raise exception 'Staff member profile not found';
  end if;

  v_employment_status := coalesce(nullif(p_profile->>'employmentStatus', ''), v_member.employment_status, 'active');
  if v_employment_status not in ('active', 'suspended', 'resigned') then
    raise exception 'Invalid staff employment status';
  end if;

  update public.users
  set
    role = p_role_scope,
    staff_title = coalesce(nullif(trim(p_staff_title), ''), staff_title),
    permission_profile = coalesce(nullif(trim(p_permission_profile), ''), permission_profile),
    permissions = p_permissions,
    account_status = case when v_employment_status in ('suspended', 'resigned') then 'blocked'::public.platform_user_status else 'active'::public.platform_user_status end,
    blocked_at = case when v_employment_status in ('suspended', 'resigned') then v_now else null end,
    blocked_reason = case when v_employment_status = 'suspended' then 'Suspended from staff operations console' when v_employment_status = 'resigned' then 'Archived from staff operations console' else null end
  where id = p_user_id
    and restaurant_id = p_restaurant_id;

  if not found then
    raise exception 'Staff user not found';
  end if;

  update public.staff_members
  set
    role_id = p_role_id,
    role_code = p_role_code,
    full_name = coalesce(nullif(trim(p_profile->>'fullName'), ''), full_name),
    phone = nullif(trim(coalesce(p_profile->>'phone', phone, '')), ''),
    username = nullif(trim(coalesce(p_profile->>'username', username, '')), ''),
    date_of_birth = nullif(trim(coalesce(p_profile->>'dateOfBirth', date_of_birth::text, '')), '')::date,
    hometown = nullif(trim(coalesce(p_profile->>'hometown', hometown, '')), ''),
    employment_status = v_employment_status,
    emergency_contact_name = nullif(trim(coalesce(p_profile->>'emergencyContactName', emergency_contact_name, '')), ''),
    emergency_contact_phone = nullif(trim(coalesce(p_profile->>'emergencyContactPhone', emergency_contact_phone, '')), ''),
    notes = nullif(trim(coalesce(p_profile->>'notes', notes, '')), ''),
    pin_hash = case when p_profile ? 'pinHash' then nullif(p_profile->>'pinHash', '') else pin_hash end,
    pin_lookup_hash = case when p_profile ? 'pinLookupHash' then nullif(p_profile->>'pinLookupHash', '') else pin_lookup_hash end,
    pin_attempts = case when p_profile ? 'pinHash' then 0 else pin_attempts end,
    pin_locked_until = case when p_profile ? 'pinHash' then null else pin_locked_until end,
    pin_updated_at = case when p_profile ? 'pinHash' then v_now else pin_updated_at end,
    suspended_at = case when v_employment_status = 'suspended' then v_now else null end,
    archived_at = case when v_employment_status = 'resigned' then v_now else null end,
    updated_at = v_now
  where id = v_member.id
  returning * into v_member;

  v_branch_id := app_private.sync_staff_primary_branch(p_restaurant_id, v_member.id, p_branch_id);
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
    v_branch_id,
    'staff_member',
    v_member.id::text,
    'staff.profile.updated',
    case when v_employment_status <> 'active' then 'warning' else 'info' end,
    'Cập nhật hồ sơ/quyền nhân sự từ HR console',
    jsonb_build_object(
      'user_id', p_user_id,
      'staff_member_id', v_member.id,
      'role_code', v_member.role_code,
      'employment_status', v_member.employment_status,
      'branch_id', v_branch_id
    ),
    jsonb_build_object('source', 'update_staff_user_profile_rpc', 'hardFailAudit', true, 'diff', null),
    '{}'::jsonb
  );

  user_id := p_user_id;
  staff_member_id := v_member.id;
  branch_id := v_branch_id;
  return next;
end;
$$;

revoke all on function app_private.update_staff_user_profile(uuid, uuid, uuid, public.user_role, text, text, jsonb, uuid, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function app_private.update_staff_user_profile(uuid, uuid, uuid, public.user_role, text, text, jsonb, uuid, text, jsonb, uuid) to service_role;

create or replace function public.update_staff_user_profile(
  p_restaurant_id uuid,
  p_user_id uuid,
  p_actor_user_id uuid,
  p_role_scope public.user_role,
  p_staff_title text,
  p_permission_profile text,
  p_permissions jsonb,
  p_role_id uuid,
  p_role_code text,
  p_profile jsonb,
  p_branch_id uuid default null
)
returns table(user_id uuid, staff_member_id uuid, branch_id uuid)
language sql
security invoker
set search_path = public, app_private
as $$
  select result.user_id, result.staff_member_id, result.branch_id
  from app_private.update_staff_user_profile(
    p_restaurant_id,
    p_user_id,
    p_actor_user_id,
    p_role_scope,
    p_staff_title,
    p_permission_profile,
    p_permissions,
    p_role_id,
    p_role_code,
    p_profile,
    p_branch_id
  ) as result;
$$;

revoke all on function public.update_staff_user_profile(uuid, uuid, uuid, public.user_role, text, text, jsonb, uuid, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.update_staff_user_profile(uuid, uuid, uuid, public.user_role, text, text, jsonb, uuid, text, jsonb, uuid) to service_role;

create or replace function app_private.set_staff_account_state(
  p_restaurant_id uuid,
  p_user_id uuid,
  p_actor_user_id uuid,
  p_next_state text,
  p_reason text default null
)
returns table(user_id uuid, staff_member_id uuid, next_state text)
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_user public.users%rowtype;
  v_member public.staff_members%rowtype;
  v_actor_staff_member_id uuid;
  v_next_account_status public.platform_user_status;
  v_employment_status text;
  v_now timestamptz := now();
begin
  if p_next_state not in ('active', 'suspended', 'archived') then
    raise exception 'Invalid staff account state';
  end if;

  if p_user_id = p_actor_user_id and p_next_state <> 'active' then
    raise exception 'Actor cannot lock own account';
  end if;

  select *
  into v_user
  from public.users users
  where users.id = p_user_id
    and users.restaurant_id = p_restaurant_id
  for update;

  if not found then
    raise exception 'Staff user not found';
  end if;

  select *
  into v_member
  from public.staff_members staff
  where staff.restaurant_id = p_restaurant_id
    and staff.user_id = p_user_id
  for update;

  if not found then
    raise exception 'Staff member profile not found';
  end if;

  v_next_account_status := case when p_next_state = 'active' then 'active'::public.platform_user_status else 'blocked'::public.platform_user_status end;
  v_employment_status := case when p_next_state = 'archived' then 'resigned' when p_next_state = 'suspended' then 'suspended' else 'active' end;

  perform app_private.prevent_last_active_admin(p_restaurant_id, p_user_id, v_user.role, v_next_account_status);

  update public.users
  set
    account_status = v_next_account_status,
    blocked_at = case when p_next_state = 'active' then null else v_now end,
    blocked_reason = case when p_next_state = 'active' then null else coalesce(nullif(trim(p_reason), ''), case when p_next_state = 'archived' then 'Archived from staff operations console' else 'Suspended from staff operations console' end) end
  where id = p_user_id
    and restaurant_id = p_restaurant_id;

  update public.staff_members
  set
    employment_status = v_employment_status,
    suspended_at = case when p_next_state = 'suspended' then v_now else null end,
    archived_at = case when p_next_state = 'archived' then v_now else null end,
    notes = coalesce(nullif(trim(p_reason), ''), notes),
    updated_at = v_now
  where id = v_member.id
  returning * into v_member;

  update public.staff_sessions
  set forced_logout_at = case when p_next_state = 'active' then null else v_now end
  where restaurant_id = p_restaurant_id
    and staff_user_id = p_user_id;

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
    null,
    'staff_member',
    v_member.id::text,
    'staff.account_state.updated',
    case when p_next_state = 'active' then 'info' else 'warning' end,
    p_reason,
    jsonb_build_object('user_id', p_user_id, 'staff_member_id', v_member.id, 'next_state', p_next_state, 'employment_status', v_member.employment_status),
    jsonb_build_object('source', 'set_staff_account_state_rpc', 'hardFailAudit', true, 'diff', null),
    '{}'::jsonb
  );

  user_id := p_user_id;
  staff_member_id := v_member.id;
  next_state := p_next_state;
  return next;
end;
$$;

revoke all on function app_private.set_staff_account_state(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function app_private.set_staff_account_state(uuid, uuid, uuid, text, text) to service_role;

create or replace function public.set_staff_account_state(
  p_restaurant_id uuid,
  p_user_id uuid,
  p_actor_user_id uuid,
  p_next_state text,
  p_reason text default null
)
returns table(user_id uuid, staff_member_id uuid, next_state text)
language sql
security invoker
set search_path = public, app_private
as $$
  select result.user_id, result.staff_member_id, result.next_state
  from app_private.set_staff_account_state(
    p_restaurant_id,
    p_user_id,
    p_actor_user_id,
    p_next_state,
    p_reason
  ) as result;
$$;

revoke all on function public.set_staff_account_state(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.set_staff_account_state(uuid, uuid, uuid, text, text) to service_role;
