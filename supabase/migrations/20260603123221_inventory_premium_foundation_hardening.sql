-- Inventory premium foundation hardening.
-- Keep legacy inventory_management active, split premium workflow gates, and
-- ensure atomic order inventory RPCs are callable only from trusted server paths.
-- Inventory mutation RPCs use a service-role backend path with an actor header,
-- so browser-authenticated clients cannot call stock-mutating RPCs directly.

with plan_ids as (
  select
    (select id from public.saas_plans where code = 'pro' limit 1) as pro_id,
    (select id from public.saas_plans where code = 'premium' limit 1) as premium_id
),
capabilities as (
  select pro_id as plan_id, *
  from plan_ids,
  (values
    ('inventory_management', true, null::integer),
    ('inventory_basic', true, null::integer),
    ('inventory_premium', false, null::integer),
    ('inventory_procurement', false, null::integer),
    ('inventory_warehouse_advanced', false, null::integer),
    ('inventory_alerts', false, null::integer),
    ('inventory_ai_ocr', false, null::integer),
    ('inventory_ai_intelligence', false, null::integer)
  ) as feature(feature_key, enabled, limit_value)
  where pro_id is not null
  union all
  select premium_id as plan_id, *
  from plan_ids,
  (values
    ('inventory_management', true, null::integer),
    ('inventory_basic', true, null::integer),
    ('inventory_premium', true, null::integer),
    ('inventory_procurement', true, null::integer),
    ('inventory_warehouse_advanced', true, null::integer),
    ('inventory_alerts', true, null::integer),
    ('inventory_ai_ocr', true, 300::integer),
    ('inventory_ai_intelligence', true, 120::integer)
  ) as feature(feature_key, enabled, limit_value)
  where premium_id is not null
)
insert into public.plan_capabilities (plan_id, feature_key, enabled, limit_value, config)
select plan_id, feature_key, enabled, limit_value, '{}'::jsonb
from capabilities
on conflict (plan_id, feature_key) do update set
  enabled = excluded.enabled,
  limit_value = excluded.limit_value,
  updated_at = now();

insert into public.feature_flags (key, name, category, badge, preview_payload)
values
  (
    'inventory_basic',
    'Kho cơ bản',
    'inventory',
    'PRO',
    '{"route":"/dashboard/inventory","summary":"Theo dõi nguyên liệu, tồn cơ bản và cảnh báo thiếu hàng."}'::jsonb
  ),
  (
    'inventory_premium',
    'Trung tâm vận hành kho',
    'inventory',
    'PREMIUM',
    '{"route":"/dashboard/inventory","summary":"PO, nhà cung cấp, lô/HSD, kiểm kê, điều chuyển, alerts và cost control."}'::jsonb
  ),
  (
    'inventory_ai_ocr',
    'AI đọc hóa đơn kho',
    'inventory',
    'AI',
    '{"route":"/dashboard/inventory","summary":"AI đọc hóa đơn nhập kho và tạo nháp nhập hàng."}'::jsonb
  ),
  (
    'inventory_ai_intelligence',
    'AI tối ưu tồn kho',
    'inventory',
    'AI',
    '{"route":"/dashboard/inventory","summary":"AI gợi ý PO, phát hiện bất thường và tóm tắt ưu tiên kho."}'::jsonb
  )
on conflict (key) do update set
  name = excluded.name,
  category = excluded.category,
  badge = excluded.badge,
  preview_payload = excluded.preview_payload,
  updated_at = now();

with plans as (
  select id, code
  from public.subscription_plans
  where code in ('pro', 'premium')
    and deleted_at is null
),
entitlements as (
  select *
  from (
    values
      ('pro', 'inventory_basic', 'active', null::text, null::integer, null::integer, null::text),
      ('pro', 'inventory_premium', 'locked_plan', null::text, 0::integer, null::integer, null::text),
      ('pro', 'inventory_ai_ocr', 'locked_plan', 'ai_requests', 0::integer, null::integer, null::text),
      ('pro', 'inventory_ai_intelligence', 'locked_plan', 'ai_requests', 0::integer, null::integer, null::text),
      ('premium', 'inventory_basic', 'active', null::text, null::integer, null::integer, null::text),
      ('premium', 'inventory_premium', 'active', null::text, null::integer, null::integer, null::text),
      ('premium', 'inventory_ai_ocr', 'quota', 'ai_requests', 300::integer, null::integer, 'monthly'),
      ('premium', 'inventory_ai_intelligence', 'quota', 'ai_requests', 120::integer, null::integer, 'monthly')
  ) as t(plan_code, feature_key, access_mode, quota_dimension, limit_value, trial_limit, reset_window)
)
insert into public.plan_entitlements (
  plan_id,
  feature_flag_id,
  feature_key,
  access_mode,
  quota_dimension,
  limit_value,
  trial_limit,
  reset_window,
  config,
  metadata
)
select
  plans.id,
  feature_flags.id,
  entitlements.feature_key,
  entitlements.access_mode::public.entitlement_access_mode,
  entitlements.quota_dimension::public.quota_dimension,
  entitlements.limit_value,
  entitlements.trial_limit,
  entitlements.reset_window::public.quota_window,
  '{}'::jsonb,
  '{}'::jsonb
from entitlements
join plans on plans.code::text = entitlements.plan_code
join public.feature_flags on feature_flags.key = entitlements.feature_key
on conflict (plan_id, feature_key) do update set
  feature_flag_id = excluded.feature_flag_id,
  access_mode = excluded.access_mode,
  quota_dimension = excluded.quota_dimension,
  limit_value = excluded.limit_value,
  trial_limit = excluded.trial_limit,
  reset_window = excluded.reset_window,
  deleted_at = null,
  updated_at = now();

create or replace function app_private.request_header_text(header_name text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(
    coalesce(
      coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb ->> lower(header_name),
      ''
    ),
    ''
  )
$$;

create or replace function app_private.current_restaurant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with request_context as (
    select
      current_setting('request.jwt.claim.role', true) as jwt_role,
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
      current_setting('request.jwt.claim.role', true) as jwt_role,
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

revoke all on function app_private.request_header_text(text) from public, anon;
revoke all on function app_private.current_restaurant_id() from public, anon;
revoke all on function app_private.current_user_role() from public, anon;
grant execute on function app_private.request_header_text(text) to authenticated, service_role;
grant execute on function app_private.current_restaurant_id() to authenticated, service_role;
grant execute on function app_private.current_user_role() to authenticated, service_role;

revoke execute on function public.apply_inventory_movement(
  uuid, uuid, text, numeric, integer, text, uuid, text, uuid, jsonb,
  uuid, uuid, uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.apply_inventory_movement(
  uuid, uuid, text, numeric, integer, text, uuid, text, uuid, jsonb,
  uuid, uuid, uuid, uuid, uuid
) to service_role;

revoke execute on function public.create_purchase_order(
  uuid, uuid, uuid, timestamptz, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.create_purchase_order(
  uuid, uuid, uuid, timestamptz, text, uuid, jsonb
) to service_role;

revoke execute on function public.receive_purchase_order(
  uuid, uuid, uuid, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.receive_purchase_order(
  uuid, uuid, uuid, timestamptz, jsonb
) to service_role;

revoke execute on function public.apply_inventory_count(
  uuid, text, uuid, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.apply_inventory_count(
  uuid, text, uuid, text, uuid, jsonb
) to service_role;

revoke execute on function public.create_branch_transfer(
  uuid, uuid, uuid, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.create_branch_transfer(
  uuid, uuid, uuid, text, uuid, jsonb
) to service_role;

do $$
begin
  if to_regprocedure('public.process_branch_transfer(uuid,uuid,text,uuid,text,jsonb)') is not null then
    execute 'revoke execute on function public.process_branch_transfer(uuid, uuid, text, uuid, text, jsonb) from public, anon, authenticated';
    execute 'grant execute on function public.process_branch_transfer(uuid, uuid, text, uuid, text, jsonb) to service_role';
  end if;

  if to_regprocedure('public.process_branch_transfer(uuid,uuid,text,uuid,text)') is not null then
    execute 'revoke execute on function public.process_branch_transfer(uuid, uuid, text, uuid, text) from public, anon, authenticated';
    execute 'grant execute on function public.process_branch_transfer(uuid, uuid, text, uuid, text) to service_role';
  end if;
end;
$$;

revoke execute on function public.accept_order_with_inventory_deduction(
  uuid, uuid, uuid, timestamptz, text, jsonb
) from public, anon, authenticated;
grant execute on function public.accept_order_with_inventory_deduction(
  uuid, uuid, uuid, timestamptz, text, jsonb
) to service_role;

revoke execute on function public.cancel_order_with_inventory_rollback(
  uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.cancel_order_with_inventory_rollback(
  uuid, uuid, uuid
) to service_role;
