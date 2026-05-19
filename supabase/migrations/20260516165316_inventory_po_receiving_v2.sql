drop function if exists public.receive_purchase_order(uuid, uuid, uuid, timestamptz);
drop function if exists public.receive_purchase_order(uuid, uuid, uuid, timestamptz, jsonb);

create or replace function public.receive_purchase_order(
  target_restaurant_id uuid,
  target_purchase_order_id uuid,
  target_actor_user_id uuid default auth.uid(),
  target_received_at timestamptz default now(),
  target_lines jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  order_record public.purchase_orders;
  line_record record;
  stock_unit text;
  conversion_factor numeric(18, 8);
  purchase_quantity numeric(14, 3);
  stock_quantity numeric(14, 3);
  batch_id uuid;
  received_line_count integer := 0;
  received_total_quantity numeric(14, 3) := 0;
  received_total_value integer := 0;
  effective_batch_code text;
  effective_unit_cost integer;
  effective_expiration_date date;
  request_count integer := 0;
  total_line_count integer := 0;
  completed_line_count integer := 0;
  next_status text;
begin
  if target_restaurant_id is distinct from app_private.current_restaurant_id() then
    raise exception 'Purchase receipt restaurant scope mismatch';
  end if;

  if target_lines is not null and jsonb_typeof(target_lines) <> 'array' then
    raise exception 'Purchase receipt lines must be an array';
  end if;

  select *
  into order_record
  from public.purchase_orders
  where id = target_purchase_order_id
    and restaurant_id = target_restaurant_id
  for update;

  if order_record.id is null then
    raise exception 'Purchase order is missing';
  end if;

  if order_record.status in ('cancelled', 'delivered') then
    raise exception 'Purchase order cannot be received in current status';
  end if;

  drop table if exists pg_temp.po_receipt_requests;
  create temporary table pg_temp.po_receipt_requests (
    purchase_order_line_id uuid,
    received_quantity numeric(14, 3),
    unit_cost integer,
    expiration_date date,
    batch_code text,
    note text
  ) on commit drop;

  if target_lines is not null and jsonb_array_length(target_lines) > 0 then
    insert into pg_temp.po_receipt_requests (
      purchase_order_line_id,
      received_quantity,
      unit_cost,
      expiration_date,
      batch_code,
      note
    )
    select
      nullif(line_item ->> 'purchaseOrderLineId', '')::uuid,
      round((line_item ->> 'receivedQuantity')::numeric, 3),
      case
        when nullif(line_item ->> 'unitCost', '') is null then null
        else (line_item ->> 'unitCost')::integer
      end,
      case
        when nullif(line_item ->> 'expirationDate', '') is null then null
        else (line_item ->> 'expirationDate')::date
      end,
      nullif(trim(coalesce(line_item ->> 'batchCode', '')), ''),
      nullif(trim(coalesce(line_item ->> 'note', '')), '')
    from jsonb_array_elements(target_lines) as line_item;
  else
    insert into pg_temp.po_receipt_requests (
      purchase_order_line_id,
      received_quantity
    )
    select
      id,
      order_quantity - received_quantity
    from public.purchase_order_lines
    where purchase_order_id = order_record.id
      and restaurant_id = target_restaurant_id
      and order_quantity - received_quantity > 0;
  end if;

  if exists (
    select 1
    from pg_temp.po_receipt_requests
    where purchase_order_line_id is null
      or received_quantity is null
      or received_quantity <= 0
      or coalesce(unit_cost, 0) < 0
  ) then
    raise exception 'Purchase receipt line is invalid';
  end if;

  if exists (
    select 1
    from pg_temp.po_receipt_requests
    group by purchase_order_line_id
    having count(*) > 1
  ) then
    raise exception 'Purchase receipt line is duplicated';
  end if;

  select count(*) into request_count from pg_temp.po_receipt_requests;

  if request_count = 0 then
    raise exception 'Purchase order has no remaining quantity to receive';
  end if;

  for line_record in
    select
      l.*,
      i.unit as ingredient_unit,
      i.base_unit as ingredient_base_unit,
      r.received_quantity as receipt_quantity,
      coalesce(r.unit_cost, l.unit_cost) as receipt_unit_cost,
      coalesce(r.expiration_date, l.expiration_date) as receipt_expiration_date,
      coalesce(r.batch_code, nullif(trim(coalesce(l.batch_code, '')), '')) as receipt_batch_code,
      r.note as receipt_note
    from pg_temp.po_receipt_requests r
    join public.purchase_order_lines l on l.id = r.purchase_order_line_id
    join public.ingredients i on i.id = l.ingredient_id
    where l.purchase_order_id = order_record.id
      and l.restaurant_id = target_restaurant_id
    order by l.created_at, l.id
    for update of l
  loop
    purchase_quantity := line_record.receipt_quantity;
    effective_unit_cost := line_record.receipt_unit_cost;
    effective_expiration_date := line_record.receipt_expiration_date;

    stock_unit := coalesce(line_record.ingredient_base_unit, line_record.ingredient_unit);
    conversion_factor := 1;

    if line_record.order_unit <> stock_unit then
      select factor
      into conversion_factor
      from public.ingredient_unit_conversions
      where restaurant_id = target_restaurant_id
        and ingredient_id = line_record.ingredient_id
        and from_unit = line_record.order_unit
        and to_unit = stock_unit
      limit 1;

      if conversion_factor is null then
        raise exception 'Missing unit conversion from % to %', line_record.order_unit, stock_unit;
      end if;
    end if;

    stock_quantity := round((purchase_quantity * conversion_factor)::numeric, 3);
    effective_batch_code := coalesce(
      line_record.receipt_batch_code,
      order_record.po_number || '-' || substr(line_record.id::text, 1, 8)
    );

    insert into public.inventory_batches (
      restaurant_id,
      ingredient_id,
      supplier_id,
      purchase_order_line_id,
      batch_code,
      received_at,
      expiration_date,
      initial_quantity,
      remaining_quantity,
      unit_cost,
      metadata
    )
    values (
      target_restaurant_id,
      line_record.ingredient_id,
      order_record.supplier_id,
      line_record.id,
      effective_batch_code,
      target_received_at,
      effective_expiration_date,
      stock_quantity,
      0,
      effective_unit_cost,
      jsonb_build_object(
        'purchaseQuantity', purchase_quantity,
        'purchaseUnit', line_record.order_unit,
        'stockUnit', stock_unit,
        'conversionFactor', conversion_factor,
        'receiptNote', line_record.receipt_note
      )
    )
    on conflict (restaurant_id, ingredient_id, batch_code) where batch_code is not null
    do update set
      initial_quantity = public.inventory_batches.initial_quantity + excluded.initial_quantity,
      unit_cost = excluded.unit_cost,
      expiration_date = coalesce(excluded.expiration_date, public.inventory_batches.expiration_date),
      updated_at = now(),
      metadata = public.inventory_batches.metadata || excluded.metadata
    returning id into batch_id;

    perform public.apply_inventory_movement(
      target_restaurant_id,
      line_record.ingredient_id,
      'receive',
      stock_quantity,
      effective_unit_cost,
      'purchase_order',
      order_record.id,
      'Nhan hang tu PO ' || order_record.po_number,
      target_actor_user_id,
      jsonb_build_object(
        'purchaseOrderLineId', line_record.id,
        'purchaseQuantity', purchase_quantity,
        'purchaseUnit', line_record.order_unit,
        'stockUnit', stock_unit,
        'conversionFactor', conversion_factor,
        'receiptNote', line_record.receipt_note,
        'overReceivedQuantity', greatest(line_record.received_quantity + purchase_quantity - line_record.order_quantity, 0)
      ),
      order_record.branch_id,
      order_record.location_id,
      batch_id,
      order_record.id,
      null
    );

    update public.purchase_order_lines
    set
      received_quantity = received_quantity + purchase_quantity,
      unit_cost = effective_unit_cost,
      line_total = round(order_quantity * effective_unit_cost)::integer,
      expiration_date = effective_expiration_date,
      batch_code = effective_batch_code,
      note = coalesce(line_record.receipt_note, note),
      metadata = metadata || jsonb_build_object(
        'lastReceiptAt', target_received_at,
        'lastReceiptQuantity', purchase_quantity,
        'lastReceiptValue', round(purchase_quantity * effective_unit_cost)::integer
      ),
      updated_at = now()
    where id = line_record.id
      and restaurant_id = target_restaurant_id;

    if order_record.supplier_id is not null then
      insert into public.supplier_price_history (
        restaurant_id,
        supplier_id,
        ingredient_id,
        purchase_order_id,
        purchase_unit,
        unit_cost,
        quantity,
        recorded_at,
        metadata
      )
      values (
        target_restaurant_id,
        order_record.supplier_id,
        line_record.ingredient_id,
        order_record.id,
        line_record.order_unit,
        effective_unit_cost,
        purchase_quantity,
        target_received_at,
        jsonb_build_object('purchaseOrderLineId', line_record.id, 'receiptNote', line_record.receipt_note)
      );
    end if;

    received_line_count := received_line_count + 1;
    received_total_quantity := received_total_quantity + stock_quantity;
    received_total_value := received_total_value + round(purchase_quantity * effective_unit_cost)::integer;
  end loop;

  if received_line_count <> request_count then
    raise exception 'One or more purchase receipt lines do not belong to this PO';
  end if;

  select
    count(*),
    count(*) filter (where received_quantity >= order_quantity)
  into total_line_count, completed_line_count
  from public.purchase_order_lines
  where purchase_order_id = order_record.id
    and restaurant_id = target_restaurant_id;

  next_status := case
    when completed_line_count = total_line_count then 'delivered'
    else 'partially_delivered'
  end;

  update public.purchase_orders
  set
    status = next_status,
    delivered_at = case when next_status = 'delivered' then target_received_at else delivered_at end,
    total_amount = (
      select coalesce(sum(line_total), 0)::integer
      from public.purchase_order_lines
      where purchase_order_id = order_record.id
        and restaurant_id = target_restaurant_id
    ),
    subtotal = (
      select coalesce(sum(line_total), 0)::integer
      from public.purchase_order_lines
      where purchase_order_id = order_record.id
        and restaurant_id = target_restaurant_id
    ),
    metadata = metadata || jsonb_build_object(
      'lastReceiptAt', target_received_at,
      'lastReceiptLineCount', received_line_count,
      'lastReceiptValue', received_total_value,
      'lastReceiptStatus', next_status
    ),
    updated_at = now()
  where id = order_record.id
    and restaurant_id = target_restaurant_id;

  return jsonb_build_object(
    'purchaseOrderId', order_record.id,
    'poNumber', order_record.po_number,
    'status', next_status,
    'receivedLines', received_line_count,
    'receivedQuantity', received_total_quantity,
    'receivedValue', received_total_value
  );
end;
$$;

revoke all on function public.receive_purchase_order(uuid, uuid, uuid, timestamptz, jsonb) from public;
grant execute on function public.receive_purchase_order(uuid, uuid, uuid, timestamptz, jsonb) to authenticated, service_role;
