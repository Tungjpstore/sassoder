-- Hardening for restaurant order lifecycle operations.
-- Keeps destructive test cleanup atomic and preserves an operator audit trail.

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

create index if not exists audit_logs_restaurant_idx
  on public.audit_logs (restaurant_id, created_at desc);

create index if not exists audit_logs_entity_idx
  on public.audit_logs (entity_type, entity_id, created_at desc);

alter table public.audit_logs enable row level security;

revoke all on public.audit_logs from anon;
grant select on public.audit_logs to authenticated;
grant insert on public.audit_logs to service_role;

drop policy if exists "restaurant users can read own audit logs" on public.audit_logs;
create policy "restaurant users can read own audit logs"
on public.audit_logs for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

create index if not exists payment_logs_bill_status_idx
  on public.payment_logs (bill_id, status, created_at desc)
  where bill_id is not null;

create or replace function public.delete_test_order_atomic(
  p_restaurant_id uuid,
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_bill_status public.table_bill_status;
  v_bill_paid_at timestamptz;
  v_bill_closed boolean := false;
begin
  select o.*
  into v_order
  from public.orders o
  where o.id = p_order_id
    and o.restaurant_id = p_restaurant_id
  for update;

  if not found then
    raise exception 'Không tìm thấy đơn hàng' using errcode = 'P0001';
  end if;

  if v_order.bill_id is not null then
    select b.status, b.paid_at
    into v_bill_status, v_bill_paid_at
    from public.table_bills b
    where b.id = v_order.bill_id
      and b.restaurant_id = p_restaurant_id
    for update;
  end if;

  if v_order.status not in ('pending', 'ordering', 'completed', 'waiting_payment', 'cancelled') then
    raise exception 'Chỉ xoá test các đơn chưa hoàn tất thanh toán.' using errcode = 'P0001';
  end if;

  if v_order.status = 'waiting_confirm'
    or v_order.payment_status in ('paid', 'waiting_confirm')
    or v_order.paid_at is not null
    or v_bill_status in ('paid', 'waiting_confirm')
    or v_bill_paid_at is not null
  then
    raise exception 'Đơn có dấu hiệu thanh toán. Hãy huỷ mềm để giữ dấu vết.' using errcode = 'P0001';
  end if;

  if v_order.delivery_status in ('out_for_delivery', 'delivered') then
    raise exception 'Đơn giao hàng đã rời quán/đã giao không được xoá test.' using errcode = 'P0001';
  end if;

  perform 1
  from public.payment_logs pl
  where (
      pl.order_id = p_order_id
      or (v_order.bill_id is not null and pl.bill_id = v_order.bill_id)
    )
    and pl.status in ('waiting_confirm', 'confirmed')
  for update;

  if found then
    raise exception 'Đơn có log thanh toán đang/đã xác nhận. Chỉ được huỷ mềm, không xoá test.' using errcode = 'P0001';
  end if;

  delete from public.orders
  where id = p_order_id
    and restaurant_id = p_restaurant_id;

  if v_order.bill_id is not null then
    perform 1
    from public.orders
    where bill_id = v_order.bill_id
      and restaurant_id = p_restaurant_id
      and status in ('pending', 'ordering', 'completed', 'waiting_payment', 'waiting_confirm')
    limit 1;

    if not found then
      update public.table_bills
      set status = 'cancelled',
          payment_method = null,
          closed_at = now()
      where id = v_order.bill_id
        and restaurant_id = p_restaurant_id
        and status in ('open', 'waiting_payment')
      returning true into v_bill_closed;
    end if;
  end if;

  return jsonb_build_object(
    'orderId', p_order_id,
    'deleted', true,
    'billId', v_order.bill_id,
    'billClosed', coalesce(v_bill_closed, false)
  );
end;
$$;

revoke all on function public.delete_test_order_atomic(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_test_order_atomic(uuid, uuid) to service_role;
