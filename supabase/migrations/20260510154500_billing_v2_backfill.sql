-- Backfill legacy SaaS billing and AI usage data into billing v2 foundation.

with legacy_subscriptions as (
  select
    rs.id as legacy_subscription_id,
    rs.restaurant_id,
    rs.plan_id as legacy_plan_id,
    rs.status,
    rs.created_at,
    rs.current_period_start,
    rs.current_period_end,
    rs.trial_started_at,
    rs.trial_ends_at,
    sp.code as legacy_plan_code
  from public.restaurant_subscriptions rs
  join public.saas_plans sp on sp.id = rs.plan_id
),
mapped_plans as (
  select id, code
  from public.subscription_plans
)
insert into public.subscriptions (
  restaurant_id,
  plan_id,
  status,
  interval,
  started_at,
  current_period_start,
  current_period_end,
  trial_started_at,
  trial_ends_at,
  metadata,
  created_at,
  updated_at
)
select
  ls.restaurant_id,
  mp.id,
  case
    when ls.status = 'past_due' then 'grace'::public.billing_subscription_status
    else ls.status::text::public.billing_subscription_status
  end,
  'month'::public.billing_interval,
  coalesce(ls.current_period_start, ls.created_at),
  ls.current_period_start,
  ls.current_period_end,
  ls.trial_started_at,
  ls.trial_ends_at,
  jsonb_build_object(
    'source', 'legacy_backfill',
    'legacySubscriptionId', ls.legacy_subscription_id,
    'legacyPlanId', ls.legacy_plan_id
  ),
  ls.created_at,
  now()
from legacy_subscriptions ls
join mapped_plans mp on mp.code::text = ls.legacy_plan_code
where not exists (
  select 1
  from public.subscriptions s
  where s.metadata->>'legacySubscriptionId' = ls.legacy_subscription_id::text
);

with v2_subscriptions as (
  select
    s.id as subscription_id,
    s.restaurant_id,
    s.plan_id,
    s.metadata->>'legacySubscriptionId' as legacy_subscription_id
  from public.subscriptions s
  where s.metadata ? 'legacySubscriptionId'
),
legacy_plan_codes as (
  select id, code
  from public.saas_plans
),
v2_plan_codes as (
  select id, code
  from public.subscription_plans
),
legacy_payments as (
  select
    spl.id as legacy_payment_id,
    spl.restaurant_id,
    spl.subscription_id as legacy_subscription_id,
    spl.plan_id as legacy_plan_id,
    spl.amount,
    spl.months,
    spl.status,
    spl.transfer_content,
    spl.created_at,
    spl.confirmed_at,
    coalesce((spl.raw_data->>'billingAction')::text, 'renew') as billing_reason,
    lp.code as legacy_plan_code
  from public.subscription_payment_logs spl
  left join legacy_plan_codes lp on lp.id = spl.plan_id
),
invoice_inserts as (
  insert into public.invoices (
    restaurant_id,
    subscription_id,
    plan_id,
    invoice_number,
    billing_reason,
    status,
    subtotal,
    total,
    currency,
    issued_at,
    paid_at,
    metadata,
    created_at,
    updated_at
  )
  select
    lp.restaurant_id,
    vs.subscription_id,
    vp.id,
    concat('LGV-BF-', upper(substr(replace(lp.transfer_content, '-', ''), 1, 18))),
    case
      when lp.billing_reason in ('renew','upgrade','downgrade') then lp.billing_reason
      else 'renew'
    end,
    case
      when lp.status = 'confirmed' then 'paid'::public.billing_invoice_status
      when lp.status = 'expired' then 'failed'::public.billing_invoice_status
      when lp.status = 'rejected' then 'failed'::public.billing_invoice_status
      else 'pending'::public.billing_invoice_status
    end,
    lp.amount,
    lp.amount,
    'VND',
    lp.created_at,
    lp.confirmed_at,
    jsonb_build_object(
      'source', 'legacy_backfill',
      'legacyPaymentId', lp.legacy_payment_id,
      'legacySubscriptionId', lp.legacy_subscription_id,
      'months', lp.months
    ),
    lp.created_at,
    now()
  from legacy_payments lp
  left join v2_subscriptions vs on vs.legacy_subscription_id = lp.legacy_subscription_id::text
  left join v2_plan_codes vp on vp.code::text = coalesce(lp.legacy_plan_code, 'pro')
  where not exists (
    select 1
    from public.invoices i
    where i.metadata->>'legacyPaymentId' = lp.legacy_payment_id::text
  )
  returning id, metadata
)
insert into public.payments (
  restaurant_id,
  subscription_id,
  invoice_id,
  provider,
  amount,
  currency,
  status,
  transfer_code,
  confirmed_at,
  expires_at,
  metadata,
  created_at,
  updated_at
)
select
  lp.restaurant_id,
  vs.subscription_id,
  i.id,
  'vietqr'::public.billing_payment_provider,
  lp.amount,
  'VND',
  case
    when lp.status = 'confirmed' then 'confirmed'::public.billing_payment_status
    when lp.status = 'expired' then 'expired'::public.billing_payment_status
    when lp.status = 'rejected' then 'failed'::public.billing_payment_status
    else 'waiting_confirmation'::public.billing_payment_status
  end,
  lp.transfer_content,
  lp.confirmed_at,
  coalesce(lp.created_at + interval '31 days', now() + interval '31 days'),
  jsonb_build_object(
    'source', 'legacy_backfill',
    'legacyPaymentId', lp.legacy_payment_id,
    'legacySubscriptionId', lp.legacy_subscription_id,
    'months', lp.months
  ),
  lp.created_at,
  now()
from legacy_payments lp
left join v2_subscriptions vs on vs.legacy_subscription_id = lp.legacy_subscription_id::text
join public.invoices i on i.metadata->>'legacyPaymentId' = lp.legacy_payment_id::text
where not exists (
  select 1
  from public.payments p
  where p.transfer_code = lp.transfer_content
);

insert into public.billing_payment_logs (
  payment_id,
  event_type,
  actor_type,
  payload,
  created_at
)
select
  p.id,
  case
    when p.status = 'confirmed' then 'payment_confirmed'
    when p.status = 'waiting_confirmation' then 'payment_requested'
    else 'payment_closed'
  end,
  'system',
  jsonb_build_object(
    'source', 'legacy_backfill',
    'legacyPaymentId', p.metadata->>'legacyPaymentId'
  ),
  p.created_at
from public.payments p
where (p.metadata->>'source') = 'legacy_backfill'
  and not exists (
    select 1
    from public.billing_payment_logs pl
    where pl.payment_id = p.id
  );

with latest_invoice as (
  select distinct on (i.subscription_id)
    i.subscription_id,
    i.id
  from public.invoices i
  where i.subscription_id is not null
  order by i.subscription_id, i.created_at desc
)
update public.subscriptions s
set latest_invoice_id = li.id,
    updated_at = now()
from latest_invoice li
where li.subscription_id = s.id
  and s.latest_invoice_id is distinct from li.id;

with ai_mapping as (
  select *
  from (
    values
      ('ai_owner_assistant', 'advanced_ai_assistant', 'ai_requests'),
      ('ai_customer_assistant', 'ai_chatbot', 'ai_requests'),
      ('ai_branding_studio', 'ai_branding', 'ai_requests'),
      ('ai_menu_ocr', 'ai_menu_generation', 'ai_requests'),
      ('ai_image_generation', 'ai_image_generation', 'ai_images'),
      ('advanced_reports', 'ai_analytics', 'analytics_runs')
  ) as m(legacy_feature_key, feature_key, dimension)
),
usage_source as (
  select
    aul.id,
    aul.restaurant_id,
    aul.user_id,
    vs.subscription_id,
    map.feature_key,
    map.dimension::public.quota_dimension as dimension,
    case
      when map.dimension = 'ai_images' then greatest(coalesce(aul.image_count, 1), 1)::numeric
      when map.dimension = 'ai_requests' then 1::numeric
      when map.dimension = 'analytics_runs' then 1::numeric
      else 1::numeric
    end as quantity,
    aul.provider,
    aul.model,
    aul.status,
    aul.metadata,
    aul.created_at
  from public.ai_usage_logs aul
  join ai_mapping map on map.legacy_feature_key = aul.feature_key
  left join public.subscriptions s on s.restaurant_id = aul.restaurant_id and s.status in ('trialing','active','grace','pending_payment')
  left join lateral (
    select s.id as subscription_id
  ) vs on true
)
insert into public.feature_usage_logs (
  restaurant_id,
  user_id,
  subscription_id,
  feature_key,
  dimension,
  quantity,
  provider,
  model,
  status,
  metadata,
  created_at
)
select
  us.restaurant_id,
  us.user_id,
  us.subscription_id,
  us.feature_key,
  us.dimension,
  us.quantity,
  us.provider,
  us.model,
  us.status,
  coalesce(us.metadata, '{}'::jsonb) || jsonb_build_object('source', 'legacy_backfill', 'legacyAiUsageId', us.id),
  us.created_at
from usage_source us
where not exists (
  select 1
  from public.feature_usage_logs ful
  where ful.metadata->>'legacyAiUsageId' = us.id::text
);

with usage_rollup as (
  select
    ful.restaurant_id,
    min(ful.subscription_id::text)::uuid as subscription_id,
    ful.feature_key,
    ful.dimension,
    'monthly'::public.quota_window as quota_window,
    date_trunc('month', ful.created_at)::timestamptz as period_start,
    (date_trunc('month', ful.created_at) + interval '1 month')::timestamptz as period_end,
    sum(ful.quantity)::numeric as used_value
  from public.feature_usage_logs ful
  where (ful.metadata->>'source') = 'legacy_backfill'
    and ful.status = 'success'
  group by ful.restaurant_id, ful.feature_key, ful.dimension, date_trunc('month', ful.created_at)
)
insert into public.usage_quotas (
  restaurant_id,
  subscription_id,
  feature_key,
  dimension,
  quota_window,
  period_start,
  period_end,
  used_value,
  source,
  metadata,
  created_at,
  updated_at
)
select
  ur.restaurant_id,
  ur.subscription_id,
  ur.feature_key,
  ur.dimension,
  ur.quota_window,
  ur.period_start,
  ur.period_end,
  ur.used_value,
  'legacy_backfill',
  jsonb_build_object('source', 'legacy_backfill'),
  now(),
  now()
from usage_rollup ur
where not exists (
  select 1
  from public.usage_quotas uq
  where uq.restaurant_id = ur.restaurant_id
    and uq.feature_key = ur.feature_key
    and uq.dimension = ur.dimension
    and uq.quota_window = ur.quota_window
    and uq.period_start = ur.period_start
);

insert into public.trial_usage (
  restaurant_id,
  feature_key,
  consumed_at,
  consumed_by,
  source,
  metadata,
  created_at
)
select distinct on (aul.restaurant_id, mapped.feature_key)
  aul.restaurant_id,
  mapped.feature_key,
  aul.created_at,
  aul.user_id,
  'legacy_backfill',
  jsonb_build_object('source', 'legacy_backfill', 'legacyAiUsageId', aul.id),
  aul.created_at
from public.ai_usage_logs aul
join (
  values
    ('ai_branding_studio', 'ai_branding'),
    ('advanced_reports', 'ai_analytics'),
    ('ai_image_generation', 'ai_image_generation')
) as mapped(legacy_feature_key, feature_key)
  on mapped.legacy_feature_key = aul.feature_key
where aul.status = 'success'
  and not exists (
    select 1
    from public.trial_usage tu
    where tu.restaurant_id = aul.restaurant_id
      and tu.feature_key = mapped.feature_key
  )
order by aul.restaurant_id, mapped.feature_key, aul.created_at asc;
