create table if not exists public.staff_reviews (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_member_id uuid not null references public.staff_members(id) on delete cascade,
  period_label text not null,
  score numeric(3,2) not null,
  status text not null default 'completed',
  note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_reviews_score_range check (score between 1 and 5),
  constraint staff_reviews_status_check check (status in ('draft', 'completed', 'archived'))
);

create table if not exists public.staff_contracts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_member_id uuid not null references public.staff_members(id) on delete cascade,
  contract_type text not null default 'official',
  start_date date not null,
  end_date date,
  status text not null default 'active',
  note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_contracts_type_check check (contract_type in ('official', 'probation', 'part_time', 'service', 'other')),
  constraint staff_contracts_status_check check (status in ('draft', 'active', 'expired', 'terminated')),
  constraint staff_contracts_date_check check (end_date is null or end_date >= start_date)
);

create table if not exists public.staff_documents (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_member_id uuid not null references public.staff_members(id) on delete cascade,
  document_name text not null,
  document_type text not null default 'other',
  file_url text,
  file_size_bytes integer,
  status text not null default 'complete',
  note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_documents_type_check check (document_type in ('identity_card', 'health_certificate', 'contract', 'training', 'other')),
  constraint staff_documents_status_check check (status in ('complete', 'missing', 'expired')),
  constraint staff_documents_size_check check (file_size_bytes is null or file_size_bytes >= 0)
);

create table if not exists public.staff_devices (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_member_id uuid references public.staff_members(id) on delete set null,
  device_name text not null,
  device_type text not null default 'other',
  serial_number text,
  issued_at date not null default current_date,
  status text not null default 'assigned',
  note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_devices_type_check check (device_type in ('phone', 'tablet', 'pos', 'cash_drawer', 'other')),
  constraint staff_devices_status_check check (status in ('assigned', 'returned', 'lost', 'maintenance'))
);

create index if not exists staff_reviews_restaurant_member_idx
  on public.staff_reviews (restaurant_id, staff_member_id, created_at desc);

create index if not exists staff_contracts_restaurant_member_idx
  on public.staff_contracts (restaurant_id, staff_member_id, status, start_date desc);

create index if not exists staff_documents_restaurant_member_idx
  on public.staff_documents (restaurant_id, staff_member_id, status, created_at desc);

create index if not exists staff_devices_restaurant_member_idx
  on public.staff_devices (restaurant_id, staff_member_id, status, issued_at desc);

drop trigger if exists staff_reviews_set_updated_at on public.staff_reviews;
create trigger staff_reviews_set_updated_at
before update on public.staff_reviews
for each row execute function public.set_updated_at();

drop trigger if exists staff_contracts_set_updated_at on public.staff_contracts;
create trigger staff_contracts_set_updated_at
before update on public.staff_contracts
for each row execute function public.set_updated_at();

drop trigger if exists staff_documents_set_updated_at on public.staff_documents;
create trigger staff_documents_set_updated_at
before update on public.staff_documents
for each row execute function public.set_updated_at();

drop trigger if exists staff_devices_set_updated_at on public.staff_devices;
create trigger staff_devices_set_updated_at
before update on public.staff_devices
for each row execute function public.set_updated_at();

alter table public.staff_reviews enable row level security;
alter table public.staff_contracts enable row level security;
alter table public.staff_documents enable row level security;
alter table public.staff_devices enable row level security;

grant select, insert, update, delete on table
  public.staff_reviews,
  public.staff_contracts,
  public.staff_documents,
  public.staff_devices
to authenticated;

drop policy if exists "restaurant users can read own staff reviews" on public.staff_reviews;
create policy "restaurant users can read own staff reviews"
on public.staff_reviews for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

drop policy if exists "admins can mutate own staff reviews" on public.staff_reviews;
create policy "admins can mutate own staff reviews"
on public.staff_reviews for all
to authenticated
using (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN')
with check (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN');

drop policy if exists "restaurant users can read own staff contracts" on public.staff_contracts;
create policy "restaurant users can read own staff contracts"
on public.staff_contracts for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

drop policy if exists "admins can mutate own staff contracts" on public.staff_contracts;
create policy "admins can mutate own staff contracts"
on public.staff_contracts for all
to authenticated
using (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN')
with check (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN');

drop policy if exists "restaurant users can read own staff documents" on public.staff_documents;
create policy "restaurant users can read own staff documents"
on public.staff_documents for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

drop policy if exists "admins can mutate own staff documents" on public.staff_documents;
create policy "admins can mutate own staff documents"
on public.staff_documents for all
to authenticated
using (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN')
with check (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN');

drop policy if exists "restaurant users can read own staff devices" on public.staff_devices;
create policy "restaurant users can read own staff devices"
on public.staff_devices for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

drop policy if exists "admins can mutate own staff devices" on public.staff_devices;
create policy "admins can mutate own staff devices"
on public.staff_devices for all
to authenticated
using (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN')
with check (restaurant_id = public.current_restaurant_id() and public.current_user_role() = 'ADMIN');
