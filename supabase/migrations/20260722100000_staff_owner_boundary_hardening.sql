alter table public.restaurants
  add column if not exists owner_user_id uuid;

create unique index if not exists users_restaurant_id_id_key
  on public.users (restaurant_id, id);

do $$
begin
  alter table public.restaurants
    drop constraint if exists restaurants_owner_user_id_fkey;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'restaurants_owner_user_id_tenant_fkey'
      and conrelid = 'public.restaurants'::regclass
  ) then
    alter table public.restaurants
      add constraint restaurants_owner_user_id_tenant_fkey
      foreign key (id, owner_user_id)
      references public.users(restaurant_id, id)
      on delete set null (owner_user_id)
      deferrable initially deferred;
  end if;
end $$;

do $$
begin
  if exists (
    select claims.restaurant_id
    from public.trial_claims claims
    join public.users users
      on users.id = claims.owner_user_id
     and users.restaurant_id = claims.restaurant_id
    where claims.restaurant_id is not null
      and claims.owner_user_id is not null
      and users.account_status is distinct from 'blocked'
      and not exists (
        select 1
        from public.staff_members staff
        where staff.user_id = users.id
          and (staff.archived_at is not null or staff.employment_status <> 'active')
      )
      and not exists (
        select 1
        from public.restaurants restaurants
        where restaurants.id = claims.restaurant_id
          and restaurants.owner_user_id is not null
      )
    group by claims.restaurant_id
    having count(distinct claims.owner_user_id) > 1
  ) then
    raise exception 'Ambiguous trial claim owners found; map restaurants.owner_user_id explicitly before rerunning';
  end if;

  if exists (
    select 1
    from public.trial_claims claims
    join public.users users
      on users.id = claims.owner_user_id
     and users.restaurant_id = claims.restaurant_id
    where claims.restaurant_id is not null
      and claims.owner_user_id is not null
      and users.role <> 'ADMIN'
      and not exists (
        select 1
        from public.restaurants restaurants
        where restaurants.id = claims.restaurant_id
          and restaurants.owner_user_id is not null
      )
  ) then
    raise exception 'Trial claim owner must be an ADMIN user; repair owner mappings before rerunning';
  end if;
end $$;

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
  is_active,
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
  is_active = true,
  sort_order = excluded.sort_order,
  preview_actions = excluded.preview_actions,
  updated_at = now();

delete from public.staff_role_permissions permissions
using public.staff_roles roles
where permissions.role_id = roles.id
  and permissions.restaurant_id = roles.restaurant_id
  and roles.code = 'manager'
  and permissions.permission_key = 'settings.billing.manage';

with role_permission_templates(code, permission_key) as (
  select 'owner'::text, permissions.permission_key
  from public.staff_permissions permissions
  union all
  select 'manager'::text, permissions.permission_key
  from public.staff_permissions permissions
  where permissions.permission_key <> 'settings.billing.manage'
  union all
  select templates.code, templates.permission_key
  from (values
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
  ) as templates(code, permission_key)
)
insert into public.staff_role_permissions (role_id, restaurant_id, permission_key)
select roles.id, roles.restaurant_id, templates.permission_key
from public.staff_roles roles
join role_permission_templates templates on templates.code = roles.code
join public.staff_permissions permissions on permissions.permission_key = templates.permission_key
on conflict (role_id, permission_key) do nothing;

with claim_owner as (
  select distinct on (claims.restaurant_id)
    claims.restaurant_id,
    claims.owner_user_id
  from public.trial_claims claims
  join public.users users
    on users.id = claims.owner_user_id
   and users.restaurant_id = claims.restaurant_id
  where claims.restaurant_id is not null
    and claims.owner_user_id is not null
    and users.role = 'ADMIN'
    and users.account_status is distinct from 'blocked'
    and not exists (
      select 1
      from public.staff_members staff
      where staff.user_id = users.id
        and (staff.archived_at is not null or staff.employment_status <> 'active')
    )
  order by claims.restaurant_id, claims.claimed_at asc, claims.id asc
)
update public.restaurants restaurants
set owner_user_id = claim_owner.owner_user_id
from claim_owner
where restaurants.id = claim_owner.restaurant_id
  and restaurants.owner_user_id is null;

update public.restaurants restaurants
set owner_user_id = users.id
from public.users users
where restaurants.owner_user_id is null
  and users.restaurant_id = restaurants.id
  and users.role = 'ADMIN'
  and users.account_status is distinct from 'blocked'
  and not exists (
    select 1
    from public.staff_members staff
    where staff.user_id = users.id
      and (staff.archived_at is not null or staff.employment_status <> 'active')
  )
  and restaurants.contact_email is not null
  and lower(users.email) = lower(restaurants.contact_email);

with single_admin as (
  select
    users.restaurant_id,
    max(users.id::text)::uuid as owner_user_id
  from public.users users
  where users.role = 'ADMIN'
    and users.account_status is distinct from 'blocked'
    and not exists (
      select 1
      from public.staff_members staff
      where staff.user_id = users.id
        and (staff.archived_at is not null or staff.employment_status <> 'active')
    )
  group by users.restaurant_id
  having count(*) = 1
)
update public.restaurants restaurants
set owner_user_id = single_admin.owner_user_id
from single_admin
where restaurants.id = single_admin.restaurant_id
  and restaurants.owner_user_id is null;

do $$
begin
  if exists (
    select 1
    from public.restaurants restaurants
    where restaurants.platform_status = 'active'
      and restaurants.deleted_at is null
      and restaurants.owner_user_id is null
  ) then
    raise exception 'Active restaurant owner is unresolved; map restaurants.owner_user_id explicitly before rerunning';
  end if;
end $$;

update public.staff_members staff
set
  role_code = 'owner',
  role_id = roles.id,
  updated_at = now()
from public.restaurants restaurants
join public.staff_roles roles
  on roles.restaurant_id = restaurants.id
 and roles.code = 'owner'
where staff.restaurant_id = restaurants.id
  and staff.user_id = restaurants.owner_user_id
  and (staff.role_code <> 'owner' or staff.role_id is distinct from roles.id);

update public.staff_members staff
set
  role_code = 'manager',
  role_id = roles.id,
  updated_at = now()
from public.restaurants restaurants
join public.staff_roles roles
  on roles.restaurant_id = restaurants.id
 and roles.code = 'manager'
where staff.restaurant_id = restaurants.id
  and staff.role_code = 'owner'
  and staff.user_id is distinct from restaurants.owner_user_id;

do $$
begin
  if exists (
    select staff.restaurant_id
    from public.staff_members staff
    where staff.role_code = 'owner'
      and staff.archived_at is null
    group by staff.restaurant_id
    having count(*) > 1
  ) then
    raise exception 'Multiple active owner staff rows remain after backfill; repair before rerunning';
  end if;

  if exists (
    select restaurants.id
    from public.restaurants restaurants
    where restaurants.owner_user_id is not null
      and (
        not exists (
          select 1
          from public.staff_roles roles
          where roles.restaurant_id = restaurants.id
            and roles.code = 'owner'
        )
        or not exists (
          select 1
          from public.staff_roles roles
          where roles.restaurant_id = restaurants.id
            and roles.code = 'manager'
        )
      )
  ) then
    raise exception 'Owner or manager system role is missing for one or more restaurants';
  end if;
end $$;

create unique index if not exists staff_members_one_active_owner_per_restaurant_idx
  on public.staff_members (restaurant_id)
  where role_code = 'owner' and archived_at is null;

create or replace function app_private.guard_restaurant_owner_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request_role text := auth.role();
begin
  if new.owner_user_id is not distinct from old.owner_user_id then
    return new;
  end if;

  if v_request_role is not null and v_request_role <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'Restaurant ownership changes require the trusted ownership workflow';
  end if;

  if new.owner_user_id is not null and not exists (
    select 1
    from public.users users
    where users.id = new.owner_user_id
      and users.restaurant_id = new.id
      and users.role = 'ADMIN'
      and users.account_status = 'active'
      and not exists (
        select 1
        from public.staff_members staff
        where staff.user_id = users.id
          and (staff.archived_at is not null or staff.employment_status <> 'active')
      )
  ) then
    raise exception 'Restaurant owner must be an active ADMIN in the same restaurant';
  end if;

  return new;
end;
$$;

revoke all on function app_private.guard_restaurant_owner_update() from public, anon, authenticated, service_role;

drop trigger if exists guard_restaurant_owner_update on public.restaurants;
create trigger guard_restaurant_owner_update
before update of owner_user_id on public.restaurants
for each row execute function app_private.guard_restaurant_owner_update();

create or replace function app_private.sync_restaurant_owner_from_trial_claim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_owner_user_id uuid;
begin
  if new.restaurant_id is null or new.owner_user_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.users users
    where users.id = new.owner_user_id
      and users.restaurant_id = new.restaurant_id
      and users.role = 'ADMIN'
      and users.account_status is distinct from 'blocked'
      and not exists (
        select 1
        from public.staff_members staff
        where staff.user_id = users.id
          and (staff.archived_at is not null or staff.employment_status <> 'active')
      )
  ) then
    raise exception 'Trial claim owner must belong to the claimed restaurant, be ADMIN and be active';
  end if;

  select restaurants.owner_user_id
  into v_current_owner_user_id
  from public.restaurants restaurants
  where restaurants.id = new.restaurant_id
  for update;

  if v_current_owner_user_id is not null and v_current_owner_user_id <> new.owner_user_id then
    raise exception 'Restaurant ownership transfer requires an explicit owner transfer workflow';
  end if;

  update public.restaurants
  set owner_user_id = new.owner_user_id
  where id = new.restaurant_id
    and owner_user_id is null;

  return new;
end;
$$;

revoke all on function app_private.sync_restaurant_owner_from_trial_claim() from public, anon, authenticated, service_role;

drop trigger if exists sync_restaurant_owner_from_trial_claim on public.trial_claims;
create trigger sync_restaurant_owner_from_trial_claim
after insert or update of restaurant_id, owner_user_id on public.trial_claims
for each row execute function app_private.sync_restaurant_owner_from_trial_claim();

create or replace function app_private.assert_staff_owner_boundary(
  p_restaurant_id uuid,
  p_actor_user_id uuid,
  p_target_user_id uuid default null,
  p_requested_role_code text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_user_id uuid;
  v_target_role_code text;
  v_touches_owner boolean;
begin
  if p_actor_user_id is not null and not exists (
    select 1
    from public.users actor
    where actor.id = p_actor_user_id
      and actor.restaurant_id = p_restaurant_id
      and actor.account_status is distinct from 'blocked'
  ) then
    raise exception 'Staff owner boundary actor must belong to the restaurant and be active';
  end if;

  select restaurants.owner_user_id
  into v_owner_user_id
  from public.restaurants restaurants
  where restaurants.id = p_restaurant_id
  for share;

  if p_actor_user_id is not null and exists (
    select 1
    from public.staff_members staff
    where staff.restaurant_id = p_restaurant_id
      and staff.user_id = p_actor_user_id
      and (staff.archived_at is not null or staff.employment_status <> 'active')
  ) then
    raise exception 'Staff owner boundary actor must have an active staff profile';
  end if;

  if p_actor_user_id is not null
    and p_actor_user_id <> v_owner_user_id
    and not exists (
      select 1
      from public.staff_members staff
      where staff.restaurant_id = p_restaurant_id
        and staff.user_id = p_actor_user_id
        and staff.archived_at is null
        and staff.employment_status = 'active'
    ) then
    raise exception 'Staff owner boundary actor must have an active staff profile';
  end if;

  if p_target_user_id is not null then
    select staff.role_code
    into v_target_role_code
    from public.staff_members staff
    where staff.restaurant_id = p_restaurant_id
      and staff.user_id = p_target_user_id
    limit 1;
  end if;

  v_touches_owner := p_target_user_id = v_owner_user_id
    or p_requested_role_code = 'owner'
    or v_target_role_code = 'owner';

  if v_touches_owner and v_owner_user_id is null then
    raise exception 'Canonical restaurant owner is unresolved';
  end if;

  if v_touches_owner and (p_actor_user_id is null or p_actor_user_id <> v_owner_user_id) then
    raise exception 'Only an owner can create or mutate an owner account';
  end if;

  if p_requested_role_code = 'owner'
    and p_target_user_id is distinct from v_owner_user_id then
    raise exception 'Only the canonical owner user can hold the owner role';
  end if;

  if p_target_user_id = v_owner_user_id
    and p_requested_role_code is not null
    and p_requested_role_code <> 'owner' then
    raise exception 'Canonical owner role cannot be changed without an ownership transfer';
  end if;
end;
$$;

revoke all on function app_private.assert_staff_owner_boundary(uuid, uuid, uuid, text) from public, anon, authenticated, service_role;

alter function app_private.create_staff_user_profile(
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
) rename to create_staff_user_profile_unchecked_20260722;

revoke all on function app_private.create_staff_user_profile_unchecked_20260722(
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
) from public, anon, authenticated, service_role;

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
set search_path = public, app_private
as $$
begin
  perform app_private.assert_staff_owner_boundary(
    p_restaurant_id,
    p_actor_user_id,
    p_user_id,
    p_role_code
  );

  return query
  select result.user_id,
    result.staff_member_id,
    result.employee_code,
    result.employee_number,
    result.must_change_app_password,
    result.branch_id
  from app_private.create_staff_user_profile_unchecked_20260722(
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

alter function app_private.update_staff_user_profile(
  uuid,
  uuid,
  uuid,
  public.user_role,
  text,
  text,
  jsonb,
  uuid,
  text,
  jsonb,
  uuid
) rename to update_staff_user_profile_unchecked_20260722;

revoke all on function app_private.update_staff_user_profile_unchecked_20260722(
  uuid,
  uuid,
  uuid,
  public.user_role,
  text,
  text,
  jsonb,
  uuid,
  text,
  jsonb,
  uuid
) from public, anon, authenticated, service_role;

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
begin
  perform app_private.assert_staff_owner_boundary(
    p_restaurant_id,
    p_actor_user_id,
    p_user_id,
    p_role_code
  );

  return query
  select result.user_id, result.staff_member_id, result.branch_id
  from app_private.update_staff_user_profile_unchecked_20260722(
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

alter function app_private.set_staff_account_state(
  uuid,
  uuid,
  uuid,
  text,
  text
) rename to set_staff_account_state_unchecked_20260722;

revoke all on function app_private.set_staff_account_state_unchecked_20260722(uuid, uuid, uuid, text, text) from public, anon, authenticated, service_role;

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
begin
  perform app_private.assert_staff_owner_boundary(
    p_restaurant_id,
    p_actor_user_id,
    p_user_id,
    null
  );

  if p_next_state <> 'active' and exists (
    select 1
    from public.restaurants restaurants
    where restaurants.id = p_restaurant_id
      and restaurants.owner_user_id = p_user_id
  ) then
    raise exception 'Canonical owner cannot be suspended or archived without an ownership transfer';
  end if;

  return query
  select result.user_id, result.staff_member_id, result.next_state
  from app_private.set_staff_account_state_unchecked_20260722(
    p_restaurant_id,
    p_user_id,
    p_actor_user_id,
    p_next_state,
    p_reason
  ) as result;
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

notify pgrst, 'reload schema';
