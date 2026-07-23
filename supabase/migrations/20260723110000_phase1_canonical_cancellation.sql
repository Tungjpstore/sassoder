-- Canonical order cancellation boundary.
-- Locks bill -> order to match checkout/attach flows and keeps every side effect atomic.

create or replace function public.cancel_order_atomic(
  p_restaurant_id uuid,
  p_order_id uuid,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  locked_bill_id uuid;
  order_record public.orders%rowtype;
  cancelled_order public.orders%rowtype;
  bill_record public.table_bills%rowtype;
  active_order_count integer := 0;
  bill_closed boolean := false;
  was_cancelled boolean := false;
  cancelled_transition_key text;
  event_payload jsonb;
begin
  select orders.bill_id
  into locked_bill_id
  from public.orders orders
  where orders.id = p_order_id
    and orders.restaurant_id = p_restaurant_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND_FOR_CANCELLATION';
  end if;

  if locked_bill_id is not null then
    select bills.*
    into bill_record
    from public.table_bills bills
    where bills.id = locked_bill_id
      and bills.restaurant_id = p_restaurant_id
    for update;

    if not found then
      raise exception using errcode = '23503', message = 'CANCELLATION_BILL_NOT_FOUND';
    end if;
  end if;

  select orders.*
  into order_record
  from public.orders orders
  where orders.id = p_order_id
    and orders.restaurant_id = p_restaurant_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND_FOR_CANCELLATION';
  end if;

  if order_record.bill_id is distinct from locked_bill_id then
    raise exception using errcode = '40001', message = 'CANCELLATION_ATTACHMENT_CONFLICT';
  end if;

  if order_record.payment_status in ('paid', 'waiting_confirm')
    or order_record.paid_at is not null
    or order_record.status::text in ('paid', 'waiting_confirm')
    or (
      locked_bill_id is not null
      and (
        bill_record.status::text in ('paid', 'waiting_confirm')
        or bill_record.paid_at is not null
      )
    )
  then
    raise exception using errcode = 'P0001', message = 'INVALID_ORDER_PAYMENT_STATE_FOR_CANCELLATION';
  end if;

  was_cancelled := order_record.status::text = 'cancelled';

  if not was_cancelled and (
    order_record.status::text = 'completed'
    or exists (
      select 1
      from public.order_items items
      where items.order_id = p_order_id
        and items.prepared_at is not null
    )
  ) then
    raise exception using errcode = 'P0001', message = 'CANCELLATION_AFTER_PREPARATION_NOT_ALLOWED';
  end if;

  perform public.cancel_order_with_inventory_rollback(
    p_restaurant_id,
    p_order_id,
    p_actor_user_id
  );

  select orders.*
  into cancelled_order
  from public.orders orders
  where orders.id = p_order_id
    and orders.restaurant_id = p_restaurant_id;

  if cancelled_order.payment_method is not null then
    cancelled_transition_key := 'order:' || p_order_id::text || ':cancelled';

    insert into public.payment_logs (
      restaurant_id,
      order_id,
      bill_id,
      method,
      status,
      amount,
      transition_key,
      raw_data
    )
    values (
      p_restaurant_id,
      p_order_id,
      locked_bill_id,
      cancelled_order.payment_method,
      'cancelled',
      cancelled_order.total,
      cancelled_transition_key,
      jsonb_build_object(
        'source', 'cancel_order_atomic',
        'transitionKey', cancelled_transition_key,
        'actorUserId', p_actor_user_id
      )
    )
    on conflict (transition_key) where transition_key is not null
    do nothing;
  end if;

  if locked_bill_id is not null then
    select count(*)::integer
    into active_order_count
    from public.orders orders
    where orders.restaurant_id = p_restaurant_id
      and orders.bill_id = locked_bill_id
      and orders.status::text <> 'cancelled';

    if active_order_count = 0 then
      update public.table_bills bills
      set
        status = 'cancelled',
        payment_method = null,
        closed_at = coalesce(bills.closed_at, now()),
        updated_at = now()
      where bills.id = locked_bill_id
        and bills.restaurant_id = p_restaurant_id
        and bills.status::text in ('open', 'waiting_payment', 'cancelled')
      returning bills.* into bill_record;

      bill_closed := found and bill_record.status::text = 'cancelled';
    end if;
  end if;

  if not was_cancelled then
    insert into public.audit_logs (
      restaurant_id,
      actor_user_id,
      actor_role,
      action,
      entity_type,
      entity_id,
      before_data,
      after_data,
      metadata
    )
    values (
      p_restaurant_id,
      p_actor_user_id,
      case when p_actor_user_id is null then 'system' else 'merchant' end,
      'order.cancelled',
      'order',
      p_order_id::text,
      to_jsonb(order_record),
      to_jsonb(cancelled_order),
      jsonb_build_object(
        'source', 'cancel_order_atomic',
        'billId', locked_bill_id,
        'billClosed', bill_closed
      )
    );
  end if;

  event_payload := jsonb_build_object(
    'type', 'order.cancelled',
    'eventId', 'order.cancelled:' || p_order_id::text,
    'restaurantId', p_restaurant_id,
    'tenantId', p_restaurant_id::text,
    'branchId', cancelled_order.branch_id,
    'occurredAt', coalesce(cancelled_order.updated_at, cancelled_order.created_at),
    'actor', jsonb_build_object(
      'type', case when p_actor_user_id is null then 'system' else 'merchant' end,
      'userId', p_actor_user_id
    ),
    'source', 'dashboard',
    'order', jsonb_build_object(
      'id', cancelled_order.id,
      'displayCode', upper(left(replace(cancelled_order.id::text, '-', ''), 6)),
      'itemCount', (
        select coalesce(sum(items.quantity), 0)::integer
        from public.order_items items
        where items.order_id = p_order_id
      ),
      'lineCount', (
        select count(*)::integer
        from public.order_items items
        where items.order_id = p_order_id
      ),
      'subtotal', cancelled_order.subtotal,
      'discountAmount', cancelled_order.discount_amount,
      'deliveryFee', cancelled_order.delivery_fee,
      'serviceFee', cancelled_order.service_fee,
      'total', cancelled_order.total,
      'items', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'name', coalesce(menu_items.name, 'Mon'),
            'quantity', items.quantity,
            'unitPrice', items.price,
            'lineTotal', items.price * items.quantity,
            'note', items.note
          )
          order by items.id
        )
        from public.order_items items
        left join public.menu_items menu_items on menu_items.id = items.menu_item_id
        where items.order_id = p_order_id
      ), '[]'::jsonb),
      'tableName', (
        select tables.name
        from public.tables tables
        where tables.id = cancelled_order.table_id
          and tables.restaurant_id = p_restaurant_id
      ),
      'fulfillmentType', cancelled_order.fulfillment_type,
      'customerName', cancelled_order.customer_name,
      'customerPhone', cancelled_order.customer_phone,
      'customerNote', cancelled_order.customer_note,
      'status', cancelled_order.status,
      'paymentStatus', cancelled_order.payment_status,
      'deliveryStatus', cancelled_order.delivery_status,
      'deliveryAddress', cancelled_order.delivery_address,
      'deliveryDistanceKm', cancelled_order.delivery_distance_km,
      'createdAt', cancelled_order.created_at,
      'acceptedAt', cancelled_order.accepted_at,
      'servedAt', cancelled_order.served_at,
      'serviceDueAt', cancelled_order.service_due_at
    )
  );

  insert into public.operational_event_outbox (
    event_id,
    event_type,
    restaurant_id,
    branch_id,
    tenant_id,
    source,
    priority,
    payload
  )
  values (
    'order.cancelled:' || p_order_id::text,
    'order.cancelled',
    p_restaurant_id,
    cancelled_order.branch_id,
    p_restaurant_id::text,
    'cancel_order_atomic',
    2,
    event_payload
  )
  on conflict (restaurant_id, event_id) do update
  set
    branch_id = excluded.branch_id,
    source = excluded.source,
    priority = excluded.priority,
    payload = excluded.payload,
    updated_at = now();

  return jsonb_build_object(
    'order', to_jsonb(cancelled_order),
    'bill', case when locked_bill_id is null then null else to_jsonb(bill_record) end,
    'billClosed', bill_closed,
    'idempotentReplay', was_cancelled
  );
end;
$$;

do $legacy_cancellation_acl$
begin
  if to_regprocedure('public.cancel_order_with_inventory_rollback(uuid,uuid,uuid)') is not null then
    execute 'revoke all on function public.cancel_order_with_inventory_rollback(uuid, uuid, uuid) '
      || 'from public, anon, authenticated, service_role';
  end if;
end
$legacy_cancellation_acl$;

revoke all on function public.cancel_order_atomic(uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.cancel_order_atomic(uuid, uuid, uuid)
to service_role;
