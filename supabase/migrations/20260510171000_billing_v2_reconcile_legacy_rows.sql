-- Reconcile legacy billing rows that were created before the billing v2 mirror
-- became authoritative. Safe to run repeatedly.

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
    'source', 'legacy_reconcile',
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
)
and not exists (
  select 1
  from public.subscriptions s
  where s.restaurant_id = ls.restaurant_id
    and s.deleted_at is null
);

with v2_subscriptions as (
  select
    s.id as subscription_id,
    s.restaurant_id,
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
)
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
    'source', 'legacy_reconcile',
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
);

with v2_subscriptions as (
  select
    s.id as subscription_id,
    s.restaurant_id,
    s.metadata->>'legacySubscriptionId' as legacy_subscription_id
  from public.subscriptions s
  where s.metadata ? 'legacySubscriptionId'
),
legacy_plan_codes as (
  select id, code
  from public.saas_plans
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
    lp.code as legacy_plan_code
  from public.subscription_payment_logs spl
  left join legacy_plan_codes lp on lp.id = spl.plan_id
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
    'source', 'legacy_reconcile',
    'legacyPaymentId', lp.legacy_payment_id,
    'legacySubscriptionId', lp.legacy_subscription_id,
    'months', lp.months,
    'planCode', lp.legacy_plan_code
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
    'source', 'legacy_reconcile',
    'legacyPaymentId', p.metadata->>'legacyPaymentId'
  ),
  p.created_at
from public.payments p
where p.metadata ? 'legacyPaymentId'
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

with legacy_plan_codes as (
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
    spl.plan_id as legacy_plan_id,
    spl.raw_data,
    spl.created_at,
    coalesce((spl.raw_data->>'billingAction')::text, 'renew') as billing_action,
    lp.code as legacy_plan_code
  from public.subscription_payment_logs spl
  left join legacy_plan_codes lp on lp.id = spl.plan_id
)
insert into public.upgrade_events (
  restaurant_id,
  from_plan_id,
  to_plan_id,
  trigger,
  source,
  context,
  converted_at,
  created_at
)
select
  lp.restaurant_id,
  from_plan.id,
  to_plan.id,
  lp.billing_action,
  'legacy_reconcile',
  coalesce(lp.raw_data, '{}'::jsonb) || jsonb_build_object('legacyPaymentId', lp.legacy_payment_id),
  case when lp.billing_action = 'upgrade' then lp.created_at else null end,
  lp.created_at
from legacy_payments lp
left join v2_plan_codes to_plan on to_plan.code::text = coalesce(lp.legacy_plan_code, 'pro')
left join v2_plan_codes from_plan on from_plan.code::text = coalesce(lp.raw_data->>'fromPlanCode', lp.legacy_plan_code, 'pro')
where not exists (
  select 1
  from public.upgrade_events ue
  where ue.context->>'legacyPaymentId' = lp.legacy_payment_id::text
);
