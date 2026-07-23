do $$
declare
  v_cross_tenant_links bigint;
  v_orphan_links bigint;
begin
  select count(*)
  into v_orphan_links
  from public.orders orders
  left join public.table_bills bills on bills.id = orders.bill_id
  where orders.bill_id is not null
    and bills.id is null;

  if v_orphan_links > 0 then
    raise exception 'Found % orphan order-to-bill links; repair and rerun the migration', v_orphan_links;
  end if;

  select count(*)
  into v_cross_tenant_links
  from public.orders orders
  join public.table_bills bills on bills.id = orders.bill_id
  where orders.bill_id is not null
    and orders.restaurant_id is distinct from bills.restaurant_id;

  if v_cross_tenant_links > 0 then
    raise exception 'Found % cross-tenant order-to-bill links; repair and rerun the migration', v_cross_tenant_links;
  end if;
end $$;

revoke insert, update, delete on table
  public.orders,
  public.table_bills,
  public.payment_logs,
  public.reservations
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.orders,
  public.table_bills,
  public.payment_logs,
  public.reservations
to service_role;

drop policy if exists "staff can update own restaurant orders" on public.orders;
drop policy if exists "staff can update own table bills" on public.table_bills;
drop policy if exists "staff can insert own payment logs" on public.payment_logs;
drop policy if exists "staff can update own reservations" on public.reservations;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'table_bills_restaurant_id_id_key'
      and conrelid = 'public.table_bills'::regclass
  ) then
    alter table public.table_bills
      add constraint table_bills_restaurant_id_id_key
      unique (restaurant_id, id);
  end if;
end $$;

alter table public.orders
  drop constraint if exists orders_bill_id_fkey;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_restaurant_bill_id_fkey'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_restaurant_bill_id_fkey
      foreign key (restaurant_id, bill_id)
      references public.table_bills (restaurant_id, id)
      on delete set null (bill_id)
      not valid;
  end if;
end $$;

alter table public.orders
  validate constraint orders_restaurant_bill_id_fkey;

create index if not exists orders_restaurant_bill_id_idx
  on public.orders (restaurant_id, bill_id)
  where bill_id is not null;

create or replace function public.recalculate_table_bill_total(target_bill_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_restaurant_id uuid;
begin
  if target_bill_id is null then
    return;
  end if;

  select bills.restaurant_id
  into v_restaurant_id
  from public.table_bills bills
  where bills.id = target_bill_id
  for update;

  if not found then
    return;
  end if;

  if exists (
    select 1
    from public.orders o
    where o.bill_id = target_bill_id
      and o.restaurant_id is distinct from v_restaurant_id
  ) then
    raise exception using
      errcode = '23503',
      message = 'Order and bill must belong to the same restaurant',
      constraint = 'orders_restaurant_bill_id_fkey';
  end if;

  update public.table_bills bills
  set total = coalesce((
    select sum(o.total)
    from public.orders o
    where o.bill_id = target_bill_id
      and o.restaurant_id = v_restaurant_id
      and o.status <> 'cancelled'
  ), 0)
  where bills.id = target_bill_id
    and bills.restaurant_id = v_restaurant_id;
end;
$$;

revoke all on function public.recalculate_table_bill_total(uuid) from public, anon, authenticated;
grant execute on function public.recalculate_table_bill_total(uuid) to service_role;

create or replace function public.sync_table_bill_total()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_bill_id uuid;
begin
  if tg_op = 'DELETE' then
    if old.bill_id is not null then
      perform public.recalculate_table_bill_total(old.bill_id);
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.bill_id is distinct from new.bill_id then
    for v_bill_id in
      select candidate.bill_id
      from (values (old.bill_id), (new.bill_id)) as candidate(bill_id)
      where candidate.bill_id is not null
      group by candidate.bill_id
      order by candidate.bill_id
    loop
      perform public.recalculate_table_bill_total(v_bill_id);
    end loop;
    return new;
  end if;

  if new.bill_id is not null then
    perform public.recalculate_table_bill_total(new.bill_id);
  end if;

  return new;
end;
$$;

revoke all on function public.sync_table_bill_total() from public, anon, authenticated, service_role;

drop trigger if exists orders_sync_table_bill_total on public.orders;
create trigger orders_sync_table_bill_total
after insert or update of bill_id, total, status or delete on public.orders
for each row execute function public.sync_table_bill_total();

notify pgrst, 'reload schema';
