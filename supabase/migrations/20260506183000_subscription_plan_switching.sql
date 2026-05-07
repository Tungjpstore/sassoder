-- Make subscription payment confirmation switch to the target plan carried by the VietQR payment request.

create or replace function public.confirm_subscription_payment_atomic(
  p_payment_id uuid,
  p_confirmed_by text default 'platform-admin'
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
  v_base_period timestamptz;
  v_next_period_end timestamptz;
  v_next_plan_id uuid;
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

  v_next_plan_id := coalesce(v_payment.plan_id, v_subscription.plan_id);

  v_base_period := case
    when v_subscription.current_period_end is not null and v_subscription.current_period_end > v_now
      then v_subscription.current_period_end
    else v_now
  end;
  v_next_period_end := v_base_period + make_interval(months => v_payment.months);

  update public.subscription_payment_logs
  set
    status = 'confirmed',
    confirmed_at = v_now,
    confirmed_by = p_confirmed_by
  where id = v_payment.id;

  update public.restaurant_subscriptions
  set
    plan_id = v_next_plan_id,
    status = 'active',
    current_period_start = v_now,
    current_period_end = v_next_period_end,
    suspended_at = null,
    updated_at = v_now,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'lastPaymentId', v_payment.id,
      'lastPlanSwitchAt', v_now,
      'lastPlanSwitchFrom', v_subscription.plan_id,
      'lastPlanSwitchTo', v_next_plan_id
    )
  where id = v_subscription.id;

  update public.restaurants
  set
    platform_status = 'active',
    suspended_at = null,
    suspended_reason = null
  where id = v_payment.restaurant_id;

  insert into public.platform_audit_logs (actor, action, target_type, target_id, metadata)
  values (
    coalesce(nullif(p_confirmed_by, ''), 'platform-admin'),
    'subscription_payment_confirmed',
    'subscription_payment',
    v_payment.id::text,
    jsonb_build_object(
      'restaurantId', v_payment.restaurant_id,
      'subscriptionId', v_subscription.id,
      'amount', v_payment.amount,
      'months', v_payment.months,
      'previousPlanId', v_subscription.plan_id,
      'nextPlanId', v_next_plan_id,
      'nextPeriodEnd', v_next_period_end
    )
  );

  return jsonb_build_object(
    'paymentId', v_payment.id,
    'subscriptionId', v_subscription.id,
    'restaurantId', v_payment.restaurant_id,
    'previousPlanId', v_subscription.plan_id,
    'nextPlanId', v_next_plan_id,
    'currentPeriodEnd', v_next_period_end
  );
end;
$$;

revoke all on function public.confirm_subscription_payment_atomic(uuid, text) from public;
grant execute on function public.confirm_subscription_payment_atomic(uuid, text) to service_role;
