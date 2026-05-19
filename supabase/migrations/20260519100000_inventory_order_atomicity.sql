-- Atomic order/inventory lifecycle guards.
-- Keeps order state changes and stock movements in the same database transaction.

create or replace function public.apply_order_inventory_movement_atomic(
  target_restaurant_id uuid,
  target_ingredient_id uuid,
  target_movement_type text,
  target_quantity_delta numeric,
  target_unit_cost integer default null,
  target_source_id uuid default null,
  target_reason text default null,
  target_actor_user_id uuid default null,
  target_metadata jsonb default '{}'::jsonb,
  target_branch_id uuid default null,
  target_location_id uuid default null,
  target_batch_id uuid default null
)
returns public.inventory_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_movement public.inventory_movements;
  balance_id uuid;
begin
  if target_quantity_delta = 0 then
    raise exception 'Inventory movement quantity cannot be zero';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      target_restaurant_id::text || ':' ||
      target_ingredient_id::text || ':' ||
      coalesce(target_branch_id::text, 'global') || ':' ||
      coalesce(target_location_id::text, 'global') || ':' ||
      coalesce(target_batch_id::text, 'no-batch'),
      0
    )
  );

  update public.ingredients
  set
    on_hand_quantity = on_hand_quantity + target_quantity_delta,
    reference_unit_cost = case
      when target_unit_cost is not null and target_unit_cost >= 0 and target_quantity_delta > 0 then target_unit_cost
      else reference_unit_cost
    end,
    updated_at = now()
  where id = target_ingredient_id
    and restaurant_id = target_restaurant_id
    and on_hand_quantity + target_quantity_delta >= 0;

  if not found then
    raise exception 'Inventory movement would make stock negative or ingredient is missing';
  end if;

  if target_batch_id is not null then
    update public.inventory_batches
    set
      remaining_quantity = remaining_quantity + target_quantity_delta,
      status = case
        when remaining_quantity + target_quantity_delta <= 0 then 'depleted'
        when status = 'depleted' and remaining_quantity + target_quantity_delta > 0 then 'active'
        else status
      end,
      updated_at = now()
    where id = target_batch_id
      and restaurant_id = target_restaurant_id
      and ingredient_id = target_ingredient_id
      and remaining_quantity + target_quantity_delta >= 0;

    if not found then
      raise exception 'Inventory batch movement would make batch negative or batch is missing';
    end if;
  end if;

  update public.stock_balances
  set
    on_hand_quantity = on_hand_quantity + target_quantity_delta,
    updated_at = now()
  where restaurant_id = target_restaurant_id
    and ingredient_id = target_ingredient_id
    and coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid) =
      coalesce(target_branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid) =
      coalesce(target_location_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and (
      (target_batch_id is null and batch_id is null)
      or batch_id = target_batch_id
    )
    and on_hand_quantity + target_quantity_delta >= 0
    and reserved_quantity <= on_hand_quantity + target_quantity_delta
  returning id into balance_id;

  if balance_id is null then
    if target_quantity_delta > 0 then
      insert into public.stock_balances (
        restaurant_id,
        branch_id,
        location_id,
        ingredient_id,
        batch_id,
        on_hand_quantity,
        reserved_quantity,
        metadata
      )
      values (
        target_restaurant_id,
        target_branch_id,
        target_location_id,
        target_ingredient_id,
        target_batch_id,
        target_quantity_delta,
        0,
        jsonb_build_object('createdFrom', 'order_inventory_atomic')
      )
      returning id into balance_id;
    else
      raise exception 'Inventory balance movement would make stock negative, over-reserved, or balance is missing';
    end if;
  end if;

  insert into public.inventory_movements (
    restaurant_id,
    ingredient_id,
    branch_id,
    location_id,
    batch_id,
    movement_type,
    quantity_delta,
    unit_cost,
    source_type,
    source_id,
    reason,
    actor_user_id,
    metadata
  )
  values (
    target_restaurant_id,
    target_ingredient_id,
    target_branch_id,
    target_location_id,
    target_batch_id,
    target_movement_type,
    target_quantity_delta,
    target_unit_cost,
    'order',
    target_source_id,
    nullif(trim(coalesce(target_reason, '')), ''),
    target_actor_user_id,
    coalesce(target_metadata, '{}'::jsonb)
  )
  returning * into inserted_movement;

  return inserted_movement;
end;
$$;

revoke all on function public.apply_order_inventory_movement_atomic(
  uuid, uuid, text, numeric, integer, uuid, text, uuid, jsonb, uuid, uuid, uuid
) from public, anon, authenticated;

create or replace function public.accept_order_with_inventory_deduction(
  target_restaurant_id uuid,
  target_order_id uuid,
  target_actor_user_id uuid default null,
  target_service_due_at timestamptz default null,
  target_delivery_status text default null,
  target_allocations jsonb default '[]'::jsonb
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_record public.orders;
  updated_order public.orders;
  allocation_record record;
  existing_count integer := 0;
  expected_count integer := 0;
  mismatch_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and target_restaurant_id is distinct from app_private.current_restaurant_id() then
    raise exception 'Inventory restaurant scope mismatch';
  end if;

  if jsonb_typeof(coalesce(target_allocations, '[]'::jsonb)) <> 'array' then
    raise exception 'Inventory allocations must be a JSON array';
  end if;

  select *
  into order_record
  from public.orders
  where id = target_order_id
    and restaurant_id = target_restaurant_id
  for update;

  if not found then
    raise exception 'Order not found for inventory acceptance';
  end if;

  if order_record.status::text not in ('pending', 'ordering') then
    raise exception 'Order status changed before inventory acceptance';
  end if;

  select count(*)::integer
  into expected_count
  from jsonb_to_recordset(coalesce(target_allocations, '[]'::jsonb)) as allocation(
    "ingredientId" uuid,
    quantity numeric,
    "unitCost" integer,
    "branchId" uuid,
    "locationId" uuid,
    "batchId" uuid,
    "allocationIndex" integer
  );

  select count(*)::integer
  into existing_count
  from public.inventory_movements
  where restaurant_id = target_restaurant_id
    and source_type = 'order'
    and source_id = target_order_id
    and movement_type = 'deduct_sale';

  if existing_count > 0 then
    with expected as (
      select
        "ingredientId" as ingredient_id,
        "branchId" as branch_id,
        "locationId" as location_id,
        "batchId" as batch_id,
        round(sum(abs(quantity))::numeric, 3) as quantity
      from jsonb_to_recordset(coalesce(target_allocations, '[]'::jsonb)) as allocation(
        "ingredientId" uuid,
        quantity numeric,
        "unitCost" integer,
        "branchId" uuid,
        "locationId" uuid,
        "batchId" uuid,
        "allocationIndex" integer
      )
      group by "ingredientId", "branchId", "locationId", "batchId"
    ),
    existing as (
      select
        ingredient_id,
        branch_id,
        location_id,
        batch_id,
        round(sum(abs(quantity_delta))::numeric, 3) as quantity
      from public.inventory_movements
      where restaurant_id = target_restaurant_id
        and source_type = 'order'
        and source_id = target_order_id
        and movement_type = 'deduct_sale'
      group by ingredient_id, branch_id, location_id, batch_id
    )
    select count(*)::integer
    into mismatch_count
    from expected e
    full join existing x
      on e.ingredient_id = x.ingredient_id
      and e.branch_id is not distinct from x.branch_id
      and e.location_id is not distinct from x.location_id
      and e.batch_id is not distinct from x.batch_id
    where e.ingredient_id is null
      or x.ingredient_id is null
      or e.quantity <> x.quantity;

    if mismatch_count > 0 or existing_count <> expected_count then
      raise exception 'partial order inventory sync detected';
    end if;
  else
    for allocation_record in
      select *
      from jsonb_to_recordset(coalesce(target_allocations, '[]'::jsonb)) as allocation(
        "ingredientId" uuid,
        quantity numeric,
        "unitCost" integer,
        "branchId" uuid,
        "locationId" uuid,
        "batchId" uuid,
        "allocationIndex" integer
      )
      order by "allocationIndex"
    loop
      if allocation_record.quantity <= 0 then
        raise exception 'Inventory allocation quantity must be positive';
      end if;

      perform public.apply_order_inventory_movement_atomic(
        target_restaurant_id,
        allocation_record."ingredientId",
        'deduct_sale',
        -abs(round(allocation_record.quantity::numeric, 3)),
        allocation_record."unitCost",
        target_order_id,
        'Tru kho theo don hang',
        target_actor_user_id,
        jsonb_build_object(
          'orderId', target_order_id,
          'allocationMode', 'fefo',
          'allocationIndex', allocation_record."allocationIndex",
          'syncMode', 'atomic_accept'
        ),
        allocation_record."branchId",
        allocation_record."locationId",
        allocation_record."batchId"
      );
    end loop;
  end if;

  update public.orders
  set
    status = 'ordering',
    accepted_at = coalesce(accepted_at, now()),
    service_due_at = coalesce(target_service_due_at, service_due_at),
    delivery_status = coalesce(target_delivery_status, delivery_status),
    delivery_tracking_updated_at = case
      when target_delivery_status is not null and target_delivery_status is distinct from delivery_status then now()
      else delivery_tracking_updated_at
    end,
    updated_at = now()
  where id = target_order_id
    and restaurant_id = target_restaurant_id
    and status in ('pending', 'ordering')
  returning * into updated_order;

  if not found then
    raise exception 'Order status changed before inventory acceptance';
  end if;

  return updated_order;
end;
$$;

revoke all on function public.accept_order_with_inventory_deduction(
  uuid, uuid, uuid, timestamptz, text, jsonb
) from public, anon;
grant execute on function public.accept_order_with_inventory_deduction(
  uuid, uuid, uuid, timestamptz, text, jsonb
) to authenticated, service_role;

create or replace function public.cancel_order_with_inventory_rollback(
  target_restaurant_id uuid,
  target_order_id uuid,
  target_actor_user_id uuid default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_record public.orders;
  updated_order public.orders;
  deduction_record record;
  deduction_count integer := 0;
  rollback_count integer := 0;
  mismatch_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and target_restaurant_id is distinct from app_private.current_restaurant_id() then
    raise exception 'Inventory restaurant scope mismatch';
  end if;

  select *
  into order_record
  from public.orders
  where id = target_order_id
    and restaurant_id = target_restaurant_id
  for update;

  if not found then
    raise exception 'Order not found for inventory cancellation';
  end if;

  if order_record.status::text = 'paid'
    or order_record.payment_status = 'paid'
    or order_record.payment_status = 'waiting_confirm'
    or order_record.paid_at is not null then
    raise exception 'Order status changed before inventory cancellation';
  end if;

  if order_record.status::text <> 'cancelled'
    and order_record.status::text not in ('pending', 'ordering', 'completed', 'waiting_payment') then
    raise exception 'Order status changed before inventory cancellation';
  end if;

  select count(*)::integer
  into deduction_count
  from public.inventory_movements
  where restaurant_id = target_restaurant_id
    and source_type = 'order'
    and source_id = target_order_id
    and movement_type = 'deduct_sale';

  select count(*)::integer
  into rollback_count
  from public.inventory_movements
  where restaurant_id = target_restaurant_id
    and source_type = 'order'
    and source_id = target_order_id
    and movement_type = 'rollback';

  if rollback_count > 0 then
    with deductions as (
      select
        ingredient_id,
        branch_id,
        location_id,
        batch_id,
        round(sum(abs(quantity_delta))::numeric, 3) as quantity
      from public.inventory_movements
      where restaurant_id = target_restaurant_id
        and source_type = 'order'
        and source_id = target_order_id
        and movement_type = 'deduct_sale'
      group by ingredient_id, branch_id, location_id, batch_id
    ),
    rollbacks as (
      select
        ingredient_id,
        branch_id,
        location_id,
        batch_id,
        round(sum(abs(quantity_delta))::numeric, 3) as quantity
      from public.inventory_movements
      where restaurant_id = target_restaurant_id
        and source_type = 'order'
        and source_id = target_order_id
        and movement_type = 'rollback'
      group by ingredient_id, branch_id, location_id, batch_id
    )
    select count(*)::integer
    into mismatch_count
    from deductions d
    full join rollbacks r
      on d.ingredient_id = r.ingredient_id
      and d.branch_id is not distinct from r.branch_id
      and d.location_id is not distinct from r.location_id
      and d.batch_id is not distinct from r.batch_id
    where d.ingredient_id is null
      or r.ingredient_id is null
      or d.quantity <> r.quantity;

    if mismatch_count > 0 or rollback_count <> deduction_count then
      raise exception 'partial order inventory rollback detected';
    end if;
  else
    for deduction_record in
      select
        ingredient_id,
        branch_id,
        location_id,
        batch_id,
        quantity_delta,
        unit_cost,
        created_at
      from public.inventory_movements
      where restaurant_id = target_restaurant_id
        and source_type = 'order'
        and source_id = target_order_id
        and movement_type = 'deduct_sale'
      order by created_at
    loop
      perform public.apply_order_inventory_movement_atomic(
        target_restaurant_id,
        deduction_record.ingredient_id,
        'rollback',
        abs(round(deduction_record.quantity_delta::numeric, 3)),
        deduction_record.unit_cost,
        target_order_id,
        'Hoan kho do huy don hang',
        target_actor_user_id,
        jsonb_build_object(
          'orderId', target_order_id,
          'allocationMode', 'fefo',
          'restoredBatchId', deduction_record.batch_id,
          'restoredLocationId', deduction_record.location_id,
          'syncMode', 'atomic_cancel'
        ),
        deduction_record.branch_id,
        deduction_record.location_id,
        deduction_record.batch_id
      );
    end loop;
  end if;

  if order_record.status::text = 'cancelled' then
    return order_record;
  end if;

  update public.orders
  set
    status = 'cancelled',
    payment_status = case
      when payment_method is not null or payment_status = 'waiting_payment' then 'failed'
      else coalesce(payment_status, 'unpaid')
    end,
    delivery_status = case
      when fulfillment_type = 'DELIVERY' then 'rejected'
      else coalesce(delivery_status, 'none')
    end,
    updated_at = now()
  where id = target_order_id
    and restaurant_id = target_restaurant_id
    and status in ('pending', 'ordering', 'completed', 'waiting_payment')
    and payment_status not in ('paid', 'waiting_confirm')
    and paid_at is null
  returning * into updated_order;

  if not found then
    raise exception 'Order status changed before inventory cancellation';
  end if;

  return updated_order;
end;
$$;

revoke all on function public.cancel_order_with_inventory_rollback(
  uuid, uuid, uuid
) from public, anon;
grant execute on function public.cancel_order_with_inventory_rollback(
  uuid, uuid, uuid
) to authenticated, service_role;
