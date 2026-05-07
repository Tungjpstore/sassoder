-- Feature-level SaaS entitlements, subscription reminders and payment anti-duplication.

create table if not exists public.plan_capabilities (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.saas_plans(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null default true,
  limit_value integer,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_capabilities_feature_key_format check (feature_key ~ '^[a-z0-9_]{3,64}$'),
  constraint plan_capabilities_limit_non_negative check (limit_value is null or limit_value >= 0),
  constraint plan_capabilities_unique unique (plan_id, feature_key)
);

create table if not exists public.restaurant_feature_overrides (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null,
  limit_value integer,
  reason text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint restaurant_feature_overrides_feature_key_format check (feature_key ~ '^[a-z0-9_]{3,64}$'),
  constraint restaurant_feature_overrides_limit_non_negative check (limit_value is null or limit_value >= 0),
  constraint restaurant_feature_overrides_unique unique (restaurant_id, feature_key)
);

create table if not exists public.subscription_reminder_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  subscription_id uuid references public.restaurant_subscriptions(id) on delete set null,
  reminder_key text not null,
  channel text not null default 'email',
  recipient text,
  status text not null default 'sent',
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint subscription_reminder_logs_key_format check (reminder_key ~ '^[a-z0-9_:-]{3,80}$'),
  constraint subscription_reminder_logs_status_check check (status in ('sent','failed','skipped'))
);

create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  customer_session_id text,
  feature_key text not null,
  provider text not null,
  model text not null,
  status text not null default 'success',
  request_kind text not null default 'chat',
  input_tokens integer,
  output_tokens integer,
  image_count integer,
  cost_units numeric(12, 4),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ai_usage_logs_feature_key_format check (feature_key ~ '^[a-z0-9_]{3,64}$'),
  constraint ai_usage_logs_status_check check (status in ('success','failed','blocked')),
  constraint ai_usage_logs_request_kind_check check (request_kind in ('chat','ocr','image','speech','embedding','tool'))
);

create index if not exists plan_capabilities_feature_idx
  on public.plan_capabilities (feature_key, enabled);

create index if not exists restaurant_feature_overrides_restaurant_idx
  on public.restaurant_feature_overrides (restaurant_id, feature_key);

create index if not exists subscription_reminder_logs_restaurant_sent_idx
  on public.subscription_reminder_logs (restaurant_id, sent_at desc);

create index if not exists ai_usage_logs_restaurant_month_idx
  on public.ai_usage_logs (restaurant_id, feature_key, created_at desc);

create unique index if not exists subscription_reminder_logs_once_idx
  on public.subscription_reminder_logs (subscription_id, reminder_key, channel)
  where status = 'sent' and subscription_id is not null;

alter table public.plan_capabilities enable row level security;
alter table public.restaurant_feature_overrides enable row level security;
alter table public.subscription_reminder_logs enable row level security;
alter table public.ai_usage_logs enable row level security;

drop policy if exists "authenticated can read active plan capabilities" on public.plan_capabilities;
create policy "authenticated can read active plan capabilities"
on public.plan_capabilities for select
to authenticated
using (
  exists (
    select 1
    from public.saas_plans
    where saas_plans.id = plan_capabilities.plan_id
      and saas_plans.is_active = true
  )
);

drop policy if exists "restaurant users can read own feature overrides" on public.restaurant_feature_overrides;
create policy "restaurant users can read own feature overrides"
on public.restaurant_feature_overrides for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

drop policy if exists "restaurant users can read own subscription reminders" on public.subscription_reminder_logs;
create policy "restaurant users can read own subscription reminders"
on public.subscription_reminder_logs for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

drop policy if exists "restaurant users can read own ai usage logs" on public.ai_usage_logs;
create policy "restaurant users can read own ai usage logs"
on public.ai_usage_logs for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

drop trigger if exists plan_capabilities_set_updated_at on public.plan_capabilities;
create trigger plan_capabilities_set_updated_at
before update on public.plan_capabilities
for each row execute function public.set_updated_at();

drop trigger if exists restaurant_feature_overrides_set_updated_at on public.restaurant_feature_overrides;
create trigger restaurant_feature_overrides_set_updated_at
before update on public.restaurant_feature_overrides
for each row execute function public.set_updated_at();

with ranked_pending as (
  select
    id,
    row_number() over (partition by subscription_id order by created_at desc, id desc) as rn
  from public.subscription_payment_logs
  where status = 'waiting_confirm'
    and subscription_id is not null
)
update public.subscription_payment_logs
set
  status = 'expired',
  rejected_at = coalesce(rejected_at, now()),
  rejected_reason = coalesce(rejected_reason, 'Tự động hết hạn để chống nhiều QR gia hạn chờ xác minh cùng lúc.')
where id in (
  select id
  from ranked_pending
  where rn > 1
);

create unique index if not exists subscription_payment_logs_single_waiting_subscription_idx
  on public.subscription_payment_logs (subscription_id)
  where status = 'waiting_confirm' and subscription_id is not null;

with plan_ids as (
  select
    (select id from public.saas_plans where code = 'pro' limit 1) as pro_id,
    (select id from public.saas_plans where code = 'premium' limit 1) as premium_id
),
capabilities as (
  select pro_id as plan_id, *
  from plan_ids,
  (values
    ('core_dashboard', true, null::integer),
    ('menu_management', true, 500),
    ('table_qr', true, 300),
    ('order_realtime', true, null::integer),
    ('kitchen_screen', true, null::integer),
    ('vietqr_payments', true, null::integer),
    ('cash_payments', true, null::integer),
    ('promotions', true, 20),
    ('staff_call', true, null::integer),
    ('online_ordering', true, null::integer),
    ('delivery_basic', true, null::integer),
    ('delivery_realtime_tracking', false, null::integer),
    ('reservations', false, null::integer),
    ('reservation_deposits', false, null::integer),
    ('advanced_reports', false, null::integer),
    ('scheduled_reports', true, 3),
    ('staff_management', true, 8),
    ('bulk_qr_export', true, null::integer),
    ('priority_support', false, null::integer),
    ('ai_owner_assistant', true, 300),
    ('ai_customer_assistant', true, 1000),
    ('ai_branding_studio', true, 40),
    ('ai_menu_ocr', false, null::integer),
    ('ai_image_generation', false, null::integer),
    ('ai_voice_input', true, 300),
    ('ai_voice_notifications', false, null::integer)
  ) as feature(feature_key, enabled, limit_value)
  where pro_id is not null
  union all
  select premium_id as plan_id, *
  from plan_ids,
  (values
    ('core_dashboard', true, null::integer),
    ('menu_management', true, 2000),
    ('table_qr', true, 1000),
    ('order_realtime', true, null::integer),
    ('kitchen_screen', true, null::integer),
    ('vietqr_payments', true, null::integer),
    ('cash_payments', true, null::integer),
    ('promotions', true, 200),
    ('staff_call', true, null::integer),
    ('online_ordering', true, null::integer),
    ('delivery_basic', true, null::integer),
    ('delivery_realtime_tracking', true, null::integer),
    ('reservations', true, null::integer),
    ('reservation_deposits', true, null::integer),
    ('advanced_reports', true, null::integer),
    ('scheduled_reports', true, 20),
    ('staff_management', true, 50),
    ('bulk_qr_export', true, null::integer),
    ('priority_support', true, null::integer),
    ('ai_owner_assistant', true, 3000),
    ('ai_customer_assistant', true, 10000),
    ('ai_branding_studio', true, 300),
    ('ai_menu_ocr', true, 500),
    ('ai_image_generation', true, 300),
    ('ai_voice_input', true, 3000),
    ('ai_voice_notifications', true, null::integer)
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

update public.saas_plans
set
  features = case
    when code = 'pro' then
      '["QR menu theo bàn","Quản lý đơn realtime","Đặt online/đến lấy/giao hàng","AI trợ lý chủ quán","AI hỗ trợ khách gọi món","AI tạo slogan/mô tả quán","Nhập liệu giọng nói","Báo cáo email"]'::jsonb
    when code = 'premium' then
      '["Tất cả tính năng Pro","Đặt bàn và nhận cọc","Báo cáo nâng cao","AI quét OCR menu","AI tạo ảnh menu/logo","Thông báo giọng nói","Theo dõi giao hàng realtime","Ưu tiên hỗ trợ"]'::jsonb
    else features
  end,
  updated_at = now()
where code in ('pro', 'premium');

insert into public.platform_audit_logs (actor, action, target_type, metadata)
values (
  'migration',
  'plan_entitlements_initialized',
  'saas_plan',
  jsonb_build_object('migration', '20260506163000_plan_entitlements_and_reminders')
);
