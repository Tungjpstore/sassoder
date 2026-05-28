-- Staff attendance: daily branch QR codes and WiFi network verification.

alter table public.staff_attendance_qr_tokens
  add column if not exists token_mode text not null default 'single_use',
  add column if not exists qr_date date,
  add column if not exists usage_limit integer;

alter table public.staff_attendance_qr_tokens
  drop constraint if exists staff_attendance_qr_tokens_token_mode_check,
  add constraint staff_attendance_qr_tokens_token_mode_check check (token_mode in ('single_use', 'daily_branch')),
  drop constraint if exists staff_attendance_qr_tokens_qr_date_check,
  add constraint staff_attendance_qr_tokens_qr_date_check check (token_mode <> 'daily_branch' or qr_date is not null),
  drop constraint if exists staff_attendance_qr_tokens_usage_limit_check,
  add constraint staff_attendance_qr_tokens_usage_limit_check check (usage_limit is null or usage_limit > 0);

create unique index if not exists staff_attendance_qr_tokens_daily_branch_idx
  on public.staff_attendance_qr_tokens (restaurant_id, branch_id, qr_date, purpose, token_mode)
  where token_mode = 'daily_branch' and revoked_at is null;

create index if not exists staff_attendance_qr_tokens_daily_lookup_idx
  on public.staff_attendance_qr_tokens (restaurant_id, branch_id, qr_date, expires_at desc)
  where token_mode = 'daily_branch' and revoked_at is null;

alter table public.attendance_logs
  drop constraint if exists attendance_logs_clock_in_source_check,
  add constraint attendance_logs_clock_in_source_check check (clock_in_source in ('gps', 'qr', 'wifi', 'manual', 'offline_sync')),
  drop constraint if exists attendance_logs_clock_out_source_check,
  add constraint attendance_logs_clock_out_source_check check (
    clock_out_source is null or clock_out_source in ('gps', 'qr', 'wifi', 'manual', 'offline_sync')
  );

create table if not exists public.staff_attendance_wifi_networks (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid not null references public.store_branches(id) on delete cascade,
  label text not null default 'WiFi quan',
  public_ip_cidr cidr not null,
  is_active boolean not null default true,
  last_seen_ip inet,
  last_seen_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_attendance_wifi_networks_label_check check (char_length(trim(label)) between 2 and 80),
  constraint staff_attendance_wifi_networks_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists staff_attendance_wifi_networks_active_unique_idx
  on public.staff_attendance_wifi_networks (restaurant_id, branch_id, public_ip_cidr)
  where is_active = true;

create index if not exists staff_attendance_wifi_networks_branch_active_idx
  on public.staff_attendance_wifi_networks (restaurant_id, branch_id, updated_at desc)
  where is_active = true;

drop trigger if exists staff_attendance_wifi_networks_set_updated_at on public.staff_attendance_wifi_networks;
create trigger staff_attendance_wifi_networks_set_updated_at
before update on public.staff_attendance_wifi_networks
for each row execute function public.set_updated_at();

alter table public.staff_attendance_wifi_networks enable row level security;

revoke all on table public.staff_attendance_wifi_networks from anon, authenticated;
grant all on table public.staff_attendance_wifi_networks to service_role;
