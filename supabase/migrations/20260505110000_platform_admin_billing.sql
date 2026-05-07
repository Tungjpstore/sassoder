-- LogiVN platform control plane, SaaS billing, trial governance and CMS settings.

do $$
begin
  create type public.restaurant_platform_status as enum ('active', 'suspended', 'deleted');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.saas_subscription_status as enum (
    'trialing',
    'pending_payment',
    'active',
    'past_due',
    'suspended',
    'cancelled',
    'expired'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.subscription_payment_status as enum (
    'waiting_confirm',
    'confirmed',
    'rejected',
    'expired'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.platform_user_status as enum ('active', 'blocked');
exception
  when duplicate_object then null;
end $$;

alter table public.restaurants
  add column if not exists platform_status public.restaurant_platform_status not null default 'active',
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_reason text,
  add column if not exists deleted_at timestamptz;

alter table public.users
  add column if not exists account_status public.platform_user_status not null default 'active',
  add column if not exists blocked_at timestamptz,
  add column if not exists blocked_reason text;

create index if not exists restaurants_platform_status_idx
  on public.restaurants (platform_status, created_at desc);

create index if not exists users_account_status_idx
  on public.users (account_status, restaurant_id);

create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.saas_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  monthly_price integer not null check (monthly_price >= 0),
  trial_days integer not null default 30 check (trial_days >= 0 and trial_days <= 365),
  features jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.restaurant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  plan_id uuid not null references public.saas_plans(id),
  status public.saas_subscription_status not null default 'trialing',
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  suspended_at timestamptz,
  cancelled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists restaurant_subscriptions_single_current_idx
  on public.restaurant_subscriptions (restaurant_id)
  where status in ('trialing', 'pending_payment', 'active', 'past_due', 'suspended');

create index if not exists restaurant_subscriptions_status_period_idx
  on public.restaurant_subscriptions (status, current_period_end, trial_ends_at);

create table if not exists public.subscription_payment_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  subscription_id uuid references public.restaurant_subscriptions(id) on delete set null,
  plan_id uuid references public.saas_plans(id) on delete set null,
  amount integer not null check (amount >= 0),
  months integer not null default 1 check (months >= 1 and months <= 24),
  method text not null default 'VIETQR',
  status public.subscription_payment_status not null default 'waiting_confirm',
  transfer_content text not null unique,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by text,
  rejected_at timestamptz,
  rejected_reason text
);

create index if not exists subscription_payment_logs_status_created_idx
  on public.subscription_payment_logs (status, created_at desc);

create index if not exists subscription_payment_logs_restaurant_created_idx
  on public.subscription_payment_logs (restaurant_id, created_at desc);

create table if not exists public.trial_claims (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  owner_email text not null,
  owner_user_id uuid,
  ip_hash text,
  user_agent_hash text,
  claimed_at timestamptz not null default now()
);

create index if not exists trial_claims_email_idx
  on public.trial_claims (lower(owner_email), claimed_at desc);

create index if not exists trial_claims_ip_idx
  on public.trial_claims (ip_hash, claimed_at desc)
  where ip_hash is not null;

alter table public.platform_settings enable row level security;
alter table public.saas_plans enable row level security;
alter table public.restaurant_subscriptions enable row level security;
alter table public.subscription_payment_logs enable row level security;
alter table public.trial_claims enable row level security;

drop policy if exists "authenticated can read active saas plans" on public.saas_plans;
create policy "authenticated can read active saas plans"
on public.saas_plans for select
to authenticated
using (is_active = true);

drop policy if exists "restaurant users can read own subscription" on public.restaurant_subscriptions;
create policy "restaurant users can read own subscription"
on public.restaurant_subscriptions for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

drop policy if exists "restaurant users can read own subscription payments" on public.subscription_payment_logs;
create policy "restaurant users can read own subscription payments"
on public.subscription_payment_logs for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

insert into public.saas_plans (code, name, description, monthly_price, trial_days, features, is_active, sort_order)
values
  (
    'pro',
    'LogiVN Pro',
    'Gói thương mại cho quán cafe, nhà hàng nhỏ và vừa.',
    99000,
    30,
    '["QR menu theo bàn","Quản lý đơn realtime","VietQR thủ công","Đặt online/đến lấy/giao hàng","Báo cáo email"]'::jsonb,
    true,
    10
  ),
  (
    'premium',
    'LogiVN Premium',
    'Gói mở rộng cho chuỗi hoặc mô hình cần nhiều tự động hóa.',
    199000,
    30,
    '["Tất cả tính năng Pro","Đặt bàn và nhận cọc","Báo cáo nâng cao","Ưu tiên hỗ trợ","Sẵn sàng tích hợp webhook"]'::jsonb,
    true,
    20
  )
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  monthly_price = excluded.monthly_price,
  trial_days = excluded.trial_days,
  features = excluded.features,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.platform_settings (key, value, updated_by)
values
  (
    'brand',
    jsonb_build_object(
      'companyName', 'LogiVN',
      'legalName', 'LogiVN',
      'hotline', '1900 633 876',
      'email', 'support@logivn.com',
      'address', 'Tầng 3, 139 Nguyễn Trãi, Quận 1, TP. HCM',
      'logoUrl', '/brand/logivn/logo-horizontal-nav.png',
      'primaryColor', '#0F4D3A',
      'accentColor', '#F28C28'
    ),
    'migration'
  ),
  (
    'landing',
    jsonb_build_object(
      'heroTitle', 'Nền tảng gọi món & vận hành thông minh cho quán Việt',
      'heroSubtitle', 'QR menu, vận hành đơn, VietQR và báo cáo trong một hệ thống nhẹ, rõ ràng, dễ mở rộng.',
      'primaryCta', 'Dùng thử miễn phí',
      'secondaryCta', 'Xem demo',
      'bannerUrl', '/brand/logivn/landing-hero.webp'
    ),
    'migration'
  ),
  (
    'billing',
    jsonb_build_object(
      'bankCode', 'VCB',
      'bankAccount', '1234567890',
      'bankAccountName', 'LOGIVN',
      'transferPrefix', 'LOGIVN',
      'defaultPlanCode', 'pro'
    ),
    'migration'
  )
on conflict (key) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'platform-assets',
  'platform-assets',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public can read platform assets" on storage.objects;
create policy "public can read platform assets"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'platform-assets');
