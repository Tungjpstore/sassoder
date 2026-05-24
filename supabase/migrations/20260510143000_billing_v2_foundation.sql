-- Centralized subscription, billing, entitlement and usage foundation for LogiVN.

do $$
begin
  create type public.billing_plan_code as enum ('pro', 'premium');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.billing_interval as enum ('month');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.billing_subscription_status as enum (
    'trialing',
    'active',
    'grace',
    'pending_payment',
    'cancelled',
    'expired',
    'suspended'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.billing_invoice_status as enum (
    'draft',
    'issued',
    'pending',
    'paid',
    'void',
    'failed',
    'refunded'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.billing_payment_provider as enum ('vietqr', 'payos', 'manual');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.billing_payment_status as enum (
    'pending',
    'detected',
    'waiting_confirmation',
    'confirmed',
    'failed',
    'expired',
    'cancelled',
    'refunded'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.entitlement_access_mode as enum ('active', 'locked_plan', 'quota', 'trial');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.quota_window as enum ('daily', 'monthly', 'lifetime');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.quota_dimension as enum (
    'tables',
    'staff',
    'ai_requests',
    'ai_tokens',
    'ai_images',
    'exports',
    'analytics_runs',
    'automation_runs'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code public.billing_plan_code not null unique,
  name text not null,
  tagline text,
  description text,
  monthly_price integer not null check (monthly_price >= 0),
  currency text not null default 'VND',
  interval public.billing_interval not null default 'month',
  is_active boolean not null default true,
  display_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  category text not null default 'core',
  badge text,
  preview_payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint feature_flags_key_format check (key ~ '^[a-z0-9_]{3,64}$')
);

create table if not exists public.plan_entitlements (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.subscription_plans(id) on delete cascade,
  feature_flag_id uuid references public.feature_flags(id) on delete set null,
  feature_key text not null,
  access_mode public.entitlement_access_mode not null default 'active',
  quota_dimension public.quota_dimension,
  limit_value numeric(14, 2),
  trial_limit integer,
  reset_window public.quota_window,
  config jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint plan_entitlements_feature_key_format check (feature_key ~ '^[a-z0-9_]{3,64}$'),
  constraint plan_entitlements_unique unique (plan_id, feature_key)
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  status public.billing_subscription_status not null default 'trialing',
  interval public.billing_interval not null default 'month',
  started_at timestamptz not null default now(),
  current_period_start timestamptz,
  current_period_end timestamptz,
  renew_at timestamptz,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  grace_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  ended_at timestamptz,
  latest_invoice_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  plan_id uuid references public.subscription_plans(id) on delete set null,
  invoice_number text not null unique,
  billing_reason text not null default 'renewal',
  status public.billing_invoice_status not null default 'draft',
  subtotal integer not null default 0 check (subtotal >= 0),
  discount_total integer not null default 0 check (discount_total >= 0),
  tax_total integer not null default 0 check (tax_total >= 0),
  total integer not null default 0 check (total >= 0),
  currency text not null default 'VND',
  issued_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  provider public.billing_payment_provider not null default 'vietqr',
  amount integer not null check (amount >= 0),
  currency text not null default 'VND',
  status public.billing_payment_status not null default 'pending',
  provider_reference text,
  transfer_code text not null unique,
  idempotency_key text,
  requested_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  detected_at timestamptz,
  confirmed_at timestamptz,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.billing_payment_logs (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  event_type text not null,
  actor_type text not null default 'system',
  actor_id text,
  request_signature text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.usage_quotas (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  feature_key text not null,
  dimension public.quota_dimension not null,
  quota_window public.quota_window not null,
  period_start timestamptz not null,
  period_end timestamptz,
  used_value numeric(14, 2) not null default 0,
  limit_value numeric(14, 2),
  soft_limit_value numeric(14, 2),
  grace_value numeric(14, 2),
  reset_at timestamptz,
  source text not null default 'system',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint usage_quotas_feature_key_format check (feature_key ~ '^[a-z0-9_]{3,64}$'),
  constraint usage_quotas_unique unique (restaurant_id, feature_key, dimension, quota_window, period_start)
);

create table if not exists public.trial_usage (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  feature_key text not null,
  consumed_at timestamptz not null default now(),
  consumed_by uuid references auth.users(id) on delete set null,
  source text not null default 'dashboard',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint trial_usage_feature_key_format check (feature_key ~ '^[a-z0-9_]{3,64}$'),
  constraint trial_usage_once unique (restaurant_id, feature_key)
);

create table if not exists public.feature_usage_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  feature_key text not null,
  dimension public.quota_dimension not null,
  quantity numeric(14, 2) not null default 1,
  unit_cost numeric(14, 4),
  provider text,
  model text,
  request_id text,
  status text not null default 'success',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint feature_usage_logs_feature_key_format check (feature_key ~ '^[a-z0-9_]{3,64}$'),
  constraint feature_usage_logs_status_check check (status in ('success', 'failed', 'blocked'))
);

create table if not exists public.upgrade_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  from_plan_id uuid references public.subscription_plans(id) on delete set null,
  to_plan_id uuid references public.subscription_plans(id) on delete set null,
  feature_key text,
  trigger text not null default 'manual',
  source text not null default 'dashboard',
  context jsonb not null default '{}'::jsonb,
  converted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace view public.restaurant_members as
select
  users.id,
  users.restaurant_id,
  users.email,
  users.email as full_name,
  users.role,
  users.account_status,
  null::timestamptz as created_at,
  null::timestamptz as updated_at
from public.users;

create index if not exists subscriptions_restaurant_status_idx
  on public.subscriptions (restaurant_id, status, current_period_end desc);

create unique index if not exists subscriptions_single_active_idx
  on public.subscriptions (restaurant_id)
  where status in ('trialing', 'active', 'grace', 'pending_payment');

create index if not exists invoices_restaurant_status_idx
  on public.invoices (restaurant_id, status, created_at desc);

create index if not exists payments_restaurant_status_idx
  on public.payments (restaurant_id, status, created_at desc);

create unique index if not exists payments_single_pending_invoice_idx
  on public.payments (invoice_id)
  where status in ('pending', 'detected', 'waiting_confirmation') and invoice_id is not null;

create index if not exists billing_payment_logs_payment_idx
  on public.billing_payment_logs (payment_id, created_at desc);

create index if not exists usage_quotas_restaurant_idx
  on public.usage_quotas (restaurant_id, feature_key, period_start desc);

create index if not exists feature_usage_logs_restaurant_idx
  on public.feature_usage_logs (restaurant_id, feature_key, created_at desc);

create index if not exists upgrade_events_restaurant_idx
  on public.upgrade_events (restaurant_id, created_at desc);

create index if not exists audit_logs_restaurant_idx
  on public.audit_logs (restaurant_id, created_at desc);

alter table public.subscription_plans enable row level security;
alter table public.feature_flags enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.subscriptions enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.billing_payment_logs enable row level security;
alter table public.usage_quotas enable row level security;
alter table public.trial_usage enable row level security;
alter table public.feature_usage_logs enable row level security;
alter table public.upgrade_events enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "authenticated can read subscription plans" on public.subscription_plans;
create policy "authenticated can read subscription plans"
on public.subscription_plans for select
to authenticated
using (is_active = true and deleted_at is null);

drop policy if exists "authenticated can read feature flags" on public.feature_flags;
create policy "authenticated can read feature flags"
on public.feature_flags for select
to authenticated
using (deleted_at is null);

drop policy if exists "authenticated can read plan entitlements" on public.plan_entitlements;
create policy "authenticated can read plan entitlements"
on public.plan_entitlements for select
to authenticated
using (deleted_at is null);

drop policy if exists "restaurant users can read own subscriptions v2" on public.subscriptions;
create policy "restaurant users can read own subscriptions v2"
on public.subscriptions for select
to authenticated
using (restaurant_id = public.current_restaurant_id() and deleted_at is null);

drop policy if exists "restaurant users can read own invoices" on public.invoices;
create policy "restaurant users can read own invoices"
on public.invoices for select
to authenticated
using (restaurant_id = public.current_restaurant_id() and deleted_at is null);

drop policy if exists "restaurant users can read own payments v2" on public.payments;
create policy "restaurant users can read own payments v2"
on public.payments for select
to authenticated
using (restaurant_id = public.current_restaurant_id() and deleted_at is null);

drop policy if exists "restaurant users can read own payment logs v2" on public.billing_payment_logs;
create policy "restaurant users can read own payment logs v2"
on public.billing_payment_logs for select
to authenticated
using (
  exists (
    select 1
    from public.payments
    where payments.id = billing_payment_logs.payment_id
      and payments.restaurant_id = public.current_restaurant_id()
      and payments.deleted_at is null
  )
);

drop policy if exists "restaurant users can read own usage quotas" on public.usage_quotas;
create policy "restaurant users can read own usage quotas"
on public.usage_quotas for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

drop policy if exists "restaurant users can read own trial usage" on public.trial_usage;
create policy "restaurant users can read own trial usage"
on public.trial_usage for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

drop policy if exists "restaurant users can read own feature usage logs" on public.feature_usage_logs;
create policy "restaurant users can read own feature usage logs"
on public.feature_usage_logs for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

drop policy if exists "restaurant users can read own upgrade events" on public.upgrade_events;
create policy "restaurant users can read own upgrade events"
on public.upgrade_events for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

drop policy if exists "restaurant users can read own audit logs" on public.audit_logs;
create policy "restaurant users can read own audit logs"
on public.audit_logs for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

drop trigger if exists subscription_plans_set_updated_at on public.subscription_plans;
create trigger subscription_plans_set_updated_at
before update on public.subscription_plans
for each row execute function public.set_updated_at();

drop trigger if exists feature_flags_set_updated_at on public.feature_flags;
create trigger feature_flags_set_updated_at
before update on public.feature_flags
for each row execute function public.set_updated_at();

drop trigger if exists plan_entitlements_set_updated_at on public.plan_entitlements;
create trigger plan_entitlements_set_updated_at
before update on public.plan_entitlements
for each row execute function public.set_updated_at();

drop trigger if exists subscriptions_set_updated_at_v2 on public.subscriptions;
create trigger subscriptions_set_updated_at_v2
before update on public.subscriptions
for each row execute function public.set_updated_at();

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
before update on public.invoices
for each row execute function public.set_updated_at();

drop trigger if exists payments_set_updated_at_v2 on public.payments;
create trigger payments_set_updated_at_v2
before update on public.payments
for each row execute function public.set_updated_at();

drop trigger if exists usage_quotas_set_updated_at on public.usage_quotas;
create trigger usage_quotas_set_updated_at
before update on public.usage_quotas
for each row execute function public.set_updated_at();

insert into public.subscription_plans (code, name, tagline, description, monthly_price, currency, interval, is_active, display_order, metadata)
values
  (
    'pro',
    'LogiVN Pro',
    'Tối ưu vận hành cho quán đang tăng trưởng',
    'Dành cho quán cafe, nhà hàng và mô hình QR ordering cần đủ AI cơ bản, bán online và billing gọn.',
    99000,
    'VND',
    'month',
    true,
    10,
    jsonb_build_object('tablesLimit', 20, 'staffLimit', 10)
  ),
  (
    'premium',
    'LogiVN Premium',
    'Tự động hóa sâu hơn, AI sâu hơn, conversion mạnh hơn',
    'Dành cho quán đã có nhịp vận hành rõ và muốn AI analytics, AI marketing, automation và branding nâng cao.',
    199000,
    'VND',
    'month',
    true,
    20,
    jsonb_build_object('tablesLimit', null, 'staffLimit', null)
  )
on conflict (code) do update set
  name = excluded.name,
  tagline = excluded.tagline,
  description = excluded.description,
  monthly_price = excluded.monthly_price,
  currency = excluded.currency,
  interval = excluded.interval,
  is_active = excluded.is_active,
  display_order = excluded.display_order,
  metadata = excluded.metadata,
  updated_at = now();

with features as (
  select *
  from (
    values
      ('tables', 'Quản lý bàn', 'core', 'PRO', jsonb_build_object('unit', 'bàn')),
      ('staff', 'Quản lý nhân sự', 'core', 'PRO', jsonb_build_object('unit', 'nhân viên')),
      ('qr_ordering', 'QR ordering', 'commerce', 'PRO', '{}'::jsonb),
      ('payment_qr', 'Thanh toán QR', 'commerce', 'PRO', '{}'::jsonb),
      ('menu_management', 'Quản lý menu', 'core', 'PRO', '{}'::jsonb),
      ('online_ordering', 'Đặt món online', 'commerce', 'PRO', '{}'::jsonb),
      ('basic_analytics', 'Analytics cơ bản', 'analytics', 'PRO', '{}'::jsonb),
      ('ai_menu_generation', 'AI tạo menu', 'ai', 'AI', jsonb_build_object('preview', 'sample_menu')),
      ('ai_chatbot', 'AI chatbot cơ bản', 'ai', 'AI', jsonb_build_object('preview', 'sample_chat')),
      ('ai_image_generation', 'AI tạo ảnh', 'ai', 'PREMIUM', jsonb_build_object('preview', 'sample_image')),
      ('branding_basic', 'Branding cơ bản', 'brand', 'PRO', '{}'::jsonb),
      ('export_pdf', 'Xuất PDF', 'reports', 'PRO', '{}'::jsonb),
      ('advanced_automation', 'Automation nâng cao', 'automation', 'PREMIUM', '{}'::jsonb),
      ('ai_analytics', 'AI analytics', 'analytics', 'PREMIUM', jsonb_build_object('preview', 'sample_dashboard')),
      ('ai_marketing', 'AI marketing', 'ai', 'PREMIUM', jsonb_build_object('preview', 'sample_campaign')),
      ('ai_branding', 'AI branding', 'brand', 'PREMIUM', jsonb_build_object('preview', 'sample_brand')),
      ('ai_automation', 'AI automation', 'automation', 'PREMIUM', '{}'::jsonb),
      ('advanced_reports', 'Báo cáo nâng cao', 'analytics', 'PREMIUM', '{}'::jsonb),
      ('loyalty_system', 'Loyalty system', 'growth', 'PREMIUM', '{}'::jsonb),
      ('advanced_qr_branding', 'QR branding nâng cao', 'brand', 'PREMIUM', '{}'::jsonb),
      ('custom_domain', 'Custom domain', 'brand', 'PREMIUM', '{}'::jsonb),
      ('realtime_insight', 'Realtime insight', 'analytics', 'PREMIUM', jsonb_build_object('preview', 'sample_realtime')),
      ('advanced_ai_assistant', 'AI assistant nâng cao', 'ai', 'PREMIUM', '{}'::jsonb),
      ('advanced_permissions', 'Phân quyền nâng cao', 'security', 'PREMIUM', '{}'::jsonb),
      ('automation_workflow', 'Workflow automation', 'automation', 'PREMIUM', '{}'::jsonb)
  ) as t(key, name, category, badge, preview_payload)
)
insert into public.feature_flags (key, name, category, badge, preview_payload)
select key, name, category, badge, preview_payload
from features
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
      ('pro', 'tables', 'active', 'tables', 20, null, null),
      ('pro', 'staff', 'active', 'staff', 10, null, null),
      ('pro', 'qr_ordering', 'active', null, null, null, null),
      ('pro', 'payment_qr', 'active', null, null, null, null),
      ('pro', 'menu_management', 'active', null, null, null, null),
      ('pro', 'online_ordering', 'active', null, null, null, null),
      ('pro', 'basic_analytics', 'active', null, null, null, null),
      ('pro', 'ai_menu_generation', 'quota', 'ai_requests', 60, null, 'monthly'),
      ('pro', 'ai_chatbot', 'quota', 'ai_requests', 500, null, 'monthly'),
      ('pro', 'ai_image_generation', 'trial', 'ai_images', 1, 1, 'lifetime'),
      ('pro', 'branding_basic', 'active', null, null, null, null),
      ('pro', 'export_pdf', 'quota', 'exports', 20, null, 'monthly'),
      ('pro', 'advanced_automation', 'locked_plan', 'automation_runs', 0, null, null),
      ('pro', 'ai_analytics', 'trial', 'analytics_runs', 1, 1, 'lifetime'),
      ('pro', 'ai_marketing', 'locked_plan', 'ai_requests', 0, null, null),
      ('pro', 'ai_branding', 'trial', 'ai_requests', 1, 1, 'lifetime'),
      ('pro', 'ai_automation', 'locked_plan', 'automation_runs', 0, null, null),
      ('pro', 'advanced_reports', 'locked_plan', 'analytics_runs', 0, null, null),
      ('pro', 'loyalty_system', 'locked_plan', null, 0, null, null),
      ('pro', 'advanced_qr_branding', 'locked_plan', null, 0, null, null),
      ('pro', 'custom_domain', 'locked_plan', null, 0, null, null),
      ('pro', 'realtime_insight', 'locked_plan', 'analytics_runs', 0, null, null),
      ('pro', 'advanced_ai_assistant', 'locked_plan', 'ai_requests', 0, null, null),
      ('pro', 'advanced_permissions', 'locked_plan', null, 0, null, null),
      ('pro', 'automation_workflow', 'locked_plan', 'automation_runs', 0, null, null),
      ('premium', 'tables', 'active', 'tables', null, null, null),
      ('premium', 'staff', 'active', 'staff', null, null, null),
      ('premium', 'qr_ordering', 'active', null, null, null, null),
      ('premium', 'payment_qr', 'active', null, null, null, null),
      ('premium', 'menu_management', 'active', null, null, null, null),
      ('premium', 'online_ordering', 'active', null, null, null, null),
      ('premium', 'basic_analytics', 'active', null, null, null, null),
      ('premium', 'ai_menu_generation', 'quota', 'ai_requests', 300, null, 'monthly'),
      ('premium', 'ai_chatbot', 'quota', 'ai_requests', 5000, null, 'monthly'),
      ('premium', 'ai_image_generation', 'quota', 'ai_images', 120, null, 'monthly'),
      ('premium', 'branding_basic', 'active', null, null, null, null),
      ('premium', 'export_pdf', 'quota', 'exports', 200, null, 'monthly'),
      ('premium', 'advanced_automation', 'quota', 'automation_runs', 300, null, 'monthly'),
      ('premium', 'ai_analytics', 'quota', 'analytics_runs', 120, null, 'monthly'),
      ('premium', 'ai_marketing', 'quota', 'ai_requests', 150, null, 'monthly'),
      ('premium', 'ai_branding', 'quota', 'ai_requests', 60, null, 'monthly'),
      ('premium', 'ai_automation', 'quota', 'automation_runs', 300, null, 'monthly'),
      ('premium', 'advanced_reports', 'active', null, null, null, null),
      ('premium', 'loyalty_system', 'active', null, null, null, null),
      ('premium', 'advanced_qr_branding', 'active', null, null, null, null),
      ('premium', 'custom_domain', 'active', null, null, null, null),
      ('premium', 'realtime_insight', 'active', null, null, null, null),
      ('premium', 'advanced_ai_assistant', 'quota', 'ai_requests', 2000, null, 'monthly'),
      ('premium', 'advanced_permissions', 'active', null, null, null, null),
      ('premium', 'automation_workflow', 'active', null, null, null, null)
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
  updated_at = now();
