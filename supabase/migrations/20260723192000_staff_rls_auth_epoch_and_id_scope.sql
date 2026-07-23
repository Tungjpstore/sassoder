-- RLS helpers must never recover a tenant by email. They also need to reject
-- already-issued staff JWTs after an HR auth epoch revocation.

create or replace function app_private.current_restaurant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with request_context as (
    select
      coalesce(
        auth.jwt() ->> 'role',
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
        current_setting('request.jwt.claim.role', true)
      ) as jwt_role,
      auth.uid() as jwt_user_id,
      nullif(app_private.request_header_text('x-logivn-inventory-actor-id'), '')::uuid as inventory_actor_user_id
  )
  select users.restaurant_id
  from public.users
  cross join request_context
  where (
      request_context.jwt_role = 'service_role'
      and users.id = request_context.inventory_actor_user_id
    )
    or (
      request_context.jwt_role is distinct from 'service_role'
      and users.id = request_context.jwt_user_id
      and users.account_status is distinct from 'blocked'
      and not exists (
        select 1
        from public.staff_members staff
        where staff.user_id = users.id
          and staff.restaurant_id = users.restaurant_id
          and staff.auth_revoked_at is not null
      )
    )
  limit 1
$$;

create or replace function app_private.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  with request_context as (
    select
      coalesce(
        auth.jwt() ->> 'role',
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
        current_setting('request.jwt.claim.role', true)
      ) as jwt_role,
      auth.uid() as jwt_user_id,
      nullif(app_private.request_header_text('x-logivn-inventory-actor-id'), '')::uuid as inventory_actor_user_id
  )
  select users.role
  from public.users
  cross join request_context
  where (
      request_context.jwt_role = 'service_role'
      and users.id = request_context.inventory_actor_user_id
    )
    or (
      request_context.jwt_role is distinct from 'service_role'
      and users.id = request_context.jwt_user_id
      and users.account_status is distinct from 'blocked'
      and not exists (
        select 1
        from public.staff_members staff
        where staff.user_id = users.id
          and staff.restaurant_id = users.restaurant_id
          and staff.auth_revoked_at is not null
      )
    )
  limit 1
$$;

notify pgrst, 'reload schema';
