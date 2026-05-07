-- Harden SaaS entitlement, payment confirmation and platform auditability.

create table if not exists public.platform_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor text not null default 'platform-admin',
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_audit_logs_created_idx
  on public.platform_audit_logs (created_at desc);

create index if not exists platform_audit_logs_target_idx
  on public.platform_audit_logs (target_type, target_id, created_at desc);

alter table public.platform_audit_logs enable row level security;

update public.platform_settings
set
  value = jsonb_build_object(
    'heroTitle', 'Nền tảng gọi món & vận hành thông minh cho quán Việt',
    'heroSubtitle', 'QR menu, vận hành đơn, VietQR và báo cáo trong một hệ thống nhẹ, rõ ràng, dễ mở rộng.',
    'primaryCta', 'Dùng thử miễn phí',
    'secondaryCta', 'Xem demo',
    'trustTitle', 'Vì sao hơn 5.000+ quán đã chọn LogiVN?',
    'dashboardTitle', 'Giao diện hiện đại - Dễ dùng trên mọi thiết bị',
    'dashboardSubtitle', 'Theo dõi hoạt động của quán mọi lúc mọi nơi với dashboard trực quan và báo cáo chi tiết.',
    'finalTitle', 'Sẵn sàng nâng tầm trải nghiệm và doanh thu cho quán của bạn?',
    'finalSubtitle', 'Đăng ký demo miễn phí - Trải nghiệm LogiVN ngay hôm nay.',
    'footerTagline', 'Gọi món QR & vận hành thông minh cho quán Việt.',
    'bannerUrl', '/brand/logivn/landing-hero.webp'
  ) || value,
  updated_at = now()
where key = 'landing';

with default_plan as (
  select id, trial_days
  from public.saas_plans
  where code = 'pro'
  limit 1
)
insert into public.restaurant_subscriptions (
  restaurant_id,
  plan_id,
  status,
  trial_started_at,
  trial_ends_at,
  current_period_start,
  current_period_end,
  metadata
)
select
  restaurants.id,
  default_plan.id,
  'trialing'::public.saas_subscription_status,
  now(),
  now() + make_interval(days => default_plan.trial_days),
  now(),
  now() + make_interval(days => default_plan.trial_days),
  jsonb_build_object('source', 'migration_backfill_20260505123000')
from public.restaurants
cross join default_plan
where restaurants.platform_status = 'active'
  and not exists (
    select 1
    from public.restaurant_subscriptions current_subscription
    where current_subscription.restaurant_id = restaurants.id
      and current_subscription.status in ('trialing', 'pending_payment', 'active', 'past_due', 'suspended')
  );

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
    status = 'active',
    current_period_start = v_now,
    current_period_end = v_next_period_end,
    suspended_at = null,
    updated_at = v_now
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
      'nextPeriodEnd', v_next_period_end
    )
  );

  return jsonb_build_object(
    'paymentId', v_payment.id,
    'subscriptionId', v_subscription.id,
    'restaurantId', v_payment.restaurant_id,
    'currentPeriodEnd', v_next_period_end
  );
end;
$$;

revoke all on function public.confirm_subscription_payment_atomic(uuid, text) from public;
grant execute on function public.confirm_subscription_payment_atomic(uuid, text) to service_role;
