-- Fix inventory service-role actor scope resolution.
--
-- Root cause: app_private.current_restaurant_id() / current_user_role() detected the
-- caller role via current_setting('request.jwt.claim.role', true). That per-claim GUC
-- was removed in PostgREST v9+, so for service-role requests the value is NULL, the
-- service_role branch never matched, and current_restaurant_id() returned NULL. Every
-- ledger mutation (apply_inventory_movement, counts, transfers, PO receiving) then failed
-- with "Inventory restaurant scope mismatch".
--
-- Fix: resolve the JWT role through auth.jwt() ->> 'role' (backed by request.jwt.claims),
-- with defensive fallbacks, so the scoped service-role actor header is honoured again.

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
      lower(coalesce(auth.jwt() ->> 'email', '')) as jwt_email,
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
      and (
        users.id = request_context.jwt_user_id
        or lower(users.email) = request_context.jwt_email
      )
    )
  order by case when users.id = coalesce(request_context.inventory_actor_user_id, request_context.jwt_user_id) then 0 else 1 end
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
      lower(coalesce(auth.jwt() ->> 'email', '')) as jwt_email,
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
      and (
        users.id = request_context.jwt_user_id
        or lower(users.email) = request_context.jwt_email
      )
    )
  order by case when users.id = coalesce(request_context.inventory_actor_user_id, request_context.jwt_user_id) then 0 else 1 end
  limit 1
$$;
