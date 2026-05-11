-- Atomic application step for the TypeScript billing state machine.
-- The app computes renew/upgrade/downgrade policy centrally, then this RPC
-- commits the payment, subscription, and restaurant status in one transaction.

create or replace function public.apply_subscription_payment_confirmation(
  p_payment_id uuid,
  p_confirmed_by text,
  p_next_plan_id uuid,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_subscription_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.subscription_payment_logs%rowtype;
  v_subscription public.restaurant_subscriptions%rowtype;
  v_now timestamptz := now();
begin
  select *
  into v_payment
  from public.subscription_payment_logs
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Không tìm thấy giao dịch gói.' using errcode = 'P0002';
  end if;

  if v_payment.status <> 'waiting_confirm' then
    raise exception 'Giao dịch này không còn chờ xác nhận.' using errcode = 'P0001';
  end if;

  if v_payment.subscription_id is null then
    raise exception 'Giao dịch không gắn với subscription.' using errcode = 'P0002';
  end if;

  select *
  into v_subscription
  from public.restaurant_subscriptions
  where id = v_payment.subscription_id
  for update;

  if not found then
    raise exception 'Không tìm thấy subscription của giao dịch.' using errcode = 'P0002';
  end if;

  if v_payment.plan_id is not null and v_payment.plan_id <> p_next_plan_id then
    raise exception 'Gói đích của payment không khớp transition.' using errcode = 'P0001';
  end if;

  update public.subscription_payment_logs
  set
    status = 'confirmed',
    confirmed_at = v_now,
    confirmed_by = coalesce(nullif(p_confirmed_by, ''), 'platform-admin')
  where id = v_payment.id;

  update public.restaurant_subscriptions
  set
    plan_id = p_next_plan_id,
    status = 'active',
    current_period_start = p_current_period_start,
    current_period_end = p_current_period_end,
    suspended_at = null,
    updated_at = v_now,
    metadata = coalesce(p_subscription_metadata, '{}'::jsonb)
  where id = v_subscription.id;

  update public.restaurants
  set
    platform_status = 'active',
    suspended_at = null,
    suspended_reason = null
  where id = v_payment.restaurant_id;

  return jsonb_build_object(
    'paymentId', v_payment.id,
    'subscriptionId', v_subscription.id,
    'restaurantId', v_payment.restaurant_id,
    'previousPlanId', v_subscription.plan_id,
    'nextPlanId', p_next_plan_id,
    'currentPeriodStart', p_current_period_start,
    'currentPeriodEnd', p_current_period_end
  );
end;
$$;

revoke all on function public.apply_subscription_payment_confirmation(uuid, text, uuid, timestamptz, timestamptz, jsonb) from public;
revoke all on function public.apply_subscription_payment_confirmation(uuid, text, uuid, timestamptz, timestamptz, jsonb) from anon;
revoke all on function public.apply_subscription_payment_confirmation(uuid, text, uuid, timestamptz, timestamptz, jsonb) from authenticated;

grant execute on function public.apply_subscription_payment_confirmation(uuid, text, uuid, timestamptz, timestamptz, jsonb) to service_role;
