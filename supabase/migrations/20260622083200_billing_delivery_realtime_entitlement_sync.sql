-- Keep runtime feature gates and Billing v2 entitlements aligned for online delivery.
-- Premium must include delivery realtime tracking in every entitlement surface.

with plan_ids as (
  select
    (select id from public.saas_plans where code = 'pro' limit 1) as legacy_pro_id,
    (select id from public.saas_plans where code = 'premium' limit 1) as legacy_premium_id
),
legacy_capabilities as (
  select legacy_pro_id as plan_id, *
  from plan_ids,
  (values
    ('order_realtime', true, null::integer),
    ('cash_payments', true, null::integer),
    ('vietqr_payments', true, null::integer),
    ('delivery_basic', true, null::integer),
    ('delivery_realtime_tracking', false, null::integer)
  ) as feature(feature_key, enabled, limit_value)
  where legacy_pro_id is not null
  union all
  select legacy_premium_id as plan_id, *
  from plan_ids,
  (values
    ('order_realtime', true, null::integer),
    ('cash_payments', true, null::integer),
    ('vietqr_payments', true, null::integer),
    ('delivery_basic', true, null::integer),
    ('delivery_realtime_tracking', true, null::integer)
  ) as feature(feature_key, enabled, limit_value)
  where legacy_premium_id is not null
)
insert into public.plan_capabilities (plan_id, feature_key, enabled, limit_value, config)
select plan_id, feature_key, enabled, limit_value, '{}'::jsonb
from legacy_capabilities
on conflict (plan_id, feature_key) do update set
  enabled = excluded.enabled,
  limit_value = excluded.limit_value,
  updated_at = now();

insert into public.feature_flags (key, name, category, badge, preview_payload)
values
  ('order_realtime', 'Order realtime', 'core', 'PRO', '{}'::jsonb),
  ('cash_payments', 'Cash payments', 'payment', 'PRO', '{}'::jsonb),
  ('vietqr_payments', 'VietQR payments', 'payment', 'PRO', '{}'::jsonb),
  ('delivery_basic', 'Delivery basic', 'delivery', 'PRO', '{}'::jsonb),
  ('delivery_realtime_tracking', 'Delivery realtime tracking', 'delivery', 'PREMIUM', jsonb_build_object('preview', 'delivery_tracking'))
on conflict (key) do update set
  name = excluded.name,
  category = excluded.category,
  badge = excluded.badge,
  preview_payload = excluded.preview_payload,
  updated_at = now();

with plans as (
  select code, id
  from public.subscription_plans
  where deleted_at is null
),
entitlements as (
  select *
  from (
    values
      ('pro', 'order_realtime', 'active', null::text, null::integer, null::integer, null::text),
      ('pro', 'cash_payments', 'active', null::text, null::integer, null::integer, null::text),
      ('pro', 'vietqr_payments', 'active', null::text, null::integer, null::integer, null::text),
      ('pro', 'delivery_basic', 'active', null::text, null::integer, null::integer, null::text),
      ('pro', 'delivery_realtime_tracking', 'locked_plan', null::text, 0::integer, null::integer, null::text),
      ('premium', 'order_realtime', 'active', null::text, null::integer, null::integer, null::text),
      ('premium', 'cash_payments', 'active', null::text, null::integer, null::integer, null::text),
      ('premium', 'vietqr_payments', 'active', null::text, null::integer, null::integer, null::text),
      ('premium', 'delivery_basic', 'active', null::text, null::integer, null::integer, null::text),
      ('premium', 'delivery_realtime_tracking', 'active', null::text, null::integer, null::integer, null::text)
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
  jsonb_build_object('source', 'billing_delivery_realtime_entitlement_sync')
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
  metadata = public.plan_entitlements.metadata || excluded.metadata,
  updated_at = now();

update public.saas_plans
set
  features = case
    when code = 'premium' and not (coalesce(features, '[]'::jsonb) ? 'Theo dõi giao hàng realtime') then coalesce(features, '[]'::jsonb) || '["Theo dõi giao hàng realtime"]'::jsonb
    else features
  end,
  updated_at = now()
where code = 'premium';
