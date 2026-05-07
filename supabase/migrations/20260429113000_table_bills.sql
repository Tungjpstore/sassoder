do $$
begin
  create type public.table_bill_status as enum ('open', 'waiting_payment', 'waiting_confirm', 'paid', 'cancelled');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.table_bills (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id uuid not null references public.tables(id) on delete restrict,
  status public.table_bill_status not null default 'open',
  total integer not null default 0 check (total >= 0),
  payment_method public.payment_method,
  customer_session_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  closed_at timestamptz,
  constraint table_bills_customer_session_id_format
    check (customer_session_id is null or customer_session_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
);

alter table public.orders
  add column if not exists bill_id uuid;

alter table public.payment_logs
  add column if not exists bill_id uuid;

do $$
begin
  alter table public.orders
    add constraint orders_bill_id_fkey
    foreign key (bill_id) references public.table_bills(id) on delete set null;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.payment_logs
    add constraint payment_logs_bill_id_fkey
    foreign key (bill_id) references public.table_bills(id) on delete set null;
exception
  when duplicate_object then null;
end $$;

create index if not exists table_bills_restaurant_table_status_idx
  on public.table_bills (restaurant_id, table_id, status, created_at desc);

create unique index if not exists table_bills_open_table_idx
  on public.table_bills (restaurant_id, table_id)
  where status = 'open';

create index if not exists orders_bill_id_idx on public.orders (bill_id);

alter table public.table_bills enable row level security;

drop policy if exists "staff can read own table bills" on public.table_bills;
create policy "staff can read own table bills"
on public.table_bills for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

drop policy if exists "staff can update own table bills" on public.table_bills;
create policy "staff can update own table bills"
on public.table_bills for update
to authenticated
using (restaurant_id = public.current_restaurant_id())
with check (restaurant_id = public.current_restaurant_id());

drop trigger if exists table_bills_set_updated_at on public.table_bills;

create trigger table_bills_set_updated_at
before update on public.table_bills
for each row execute function public.set_updated_at();

create or replace function public.recalculate_table_bill_total(target_bill_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.table_bills
  set total = coalesce((
    select sum(total)
    from public.orders
    where bill_id = target_bill_id
      and status <> 'cancelled'
  ), 0)
  where id = target_bill_id;
end;
$$;

create or replace function public.sync_table_bill_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.bill_id is not null then
      perform public.recalculate_table_bill_total(old.bill_id);
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.bill_id is not null and old.bill_id is distinct from new.bill_id then
    perform public.recalculate_table_bill_total(old.bill_id);
  end if;

  if new.bill_id is not null then
    perform public.recalculate_table_bill_total(new.bill_id);
  end if;

  return new;
end;
$$;

drop trigger if exists orders_sync_table_bill_total on public.orders;

create trigger orders_sync_table_bill_total
after insert or update of bill_id, total, status or delete on public.orders
for each row execute function public.sync_table_bill_total();

with grouped_open_orders as (
  select
    restaurant_id,
    table_id,
    min(customer_session_id) filter (where customer_session_id is not null) as customer_session_id,
    case
      when bool_or(status = 'waiting_confirm') then 'waiting_confirm'::public.table_bill_status
      when bool_or(status = 'waiting_payment') then 'waiting_payment'::public.table_bill_status
      else 'open'::public.table_bill_status
    end as status
  from public.orders
  where bill_id is null
    and status in ('pending', 'ordering', 'completed', 'waiting_payment', 'waiting_confirm')
  group by restaurant_id, table_id
),
inserted_bills as (
  insert into public.table_bills (restaurant_id, table_id, customer_session_id, status)
  select restaurant_id, table_id, customer_session_id, status
  from grouped_open_orders
  on conflict do nothing
  returning id, restaurant_id, table_id
)
update public.orders as orders
set bill_id = bills.id
from inserted_bills as bills
where orders.bill_id is null
  and orders.restaurant_id = bills.restaurant_id
  and orders.table_id = bills.table_id
  and orders.status in ('pending', 'ordering', 'completed', 'waiting_payment', 'waiting_confirm');

update public.table_bills as bills
set
  total = coalesce(summary.total, 0),
  payment_method = summary.payment_method
from (
  select
    bill_id,
    sum(total) filter (where status <> 'cancelled') as total,
    case
      when bool_or(payment_method = 'QR') then 'QR'::public.payment_method
      when bool_or(payment_method = 'CASH') then 'CASH'::public.payment_method
      else null
    end as payment_method
  from public.orders
  where bill_id is not null
  group by bill_id
) as summary
where bills.id = summary.bill_id;
