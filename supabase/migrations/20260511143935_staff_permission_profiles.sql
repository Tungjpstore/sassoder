alter table public.users
  add column if not exists staff_title text not null default 'Phục vụ',
  add column if not exists permission_profile text not null default 'service',
  add column if not exists permissions jsonb not null default '["dashboard.view","orders.manage","tables.manage","reservations.manage"]'::jsonb;

alter table public.users
  drop constraint if exists users_permission_profile_check,
  add constraint users_permission_profile_check
    check (permission_profile in ('manager', 'cashier', 'kitchen', 'service', 'delivery', 'viewer'));

alter table public.users
  drop constraint if exists users_permissions_array_check,
  add constraint users_permissions_array_check
    check (jsonb_typeof(permissions) = 'array');

update public.users
set
  staff_title = case
    when role = 'ADMIN' then 'Quản lý'
    else coalesce(nullif(staff_title, ''), 'Phục vụ')
  end,
  permission_profile = case
    when role = 'ADMIN' then 'manager'
    when permission_profile not in ('manager', 'cashier', 'kitchen', 'service', 'delivery', 'viewer') then 'service'
    else permission_profile
  end,
  permissions = case
    when role = 'ADMIN' then '["dashboard.view","orders.manage","kitchen.view","menu.manage","tables.manage","payments.manage","online.manage","reservations.manage","promotions.manage","reports.view","staff.manage","settings.manage"]'::jsonb
    when jsonb_typeof(permissions) = 'array' and jsonb_array_length(permissions) > 0 then permissions
    else '["dashboard.view","orders.manage","tables.manage","reservations.manage"]'::jsonb
  end;

create index if not exists users_permission_profile_idx
  on public.users (restaurant_id, permission_profile);
