-- Phase 2 fix-forward: make prepaid reservation retries stable and keep the
-- legacy ingredient aggregate in sync when reserved stock is consumed.

create or replace function public.reserve_order_inventory(
  target_restaurant_id uuid,
  target_order_id uuid,
  target_actor_user_id uuid default null,
  target_allocations jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  order_record public.orders;
  allocation_record record;
  existing public.inventory_reservations;
  balance_record public.stock_balances;
  effective_branch_id uuid;
  v_allocation_key text;
  reserved_count integer := 0;
  total_quantity numeric(14, 3) := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Inventory reservation requires service role';
  end if;
  if jsonb_typeof(coalesce(target_allocations, '[]'::jsonb)) <> 'array' then
    raise exception 'Inventory allocations must be a JSON array';
  end if;

  select * into order_record
  from public.orders
  where id = target_order_id and restaurant_id = target_restaurant_id
  for update;
  if not found then raise exception 'Order not found for inventory reservation'; end if;
  if order_record.status::text not in ('waiting_payment', 'waiting_confirm', 'paid')
     and order_record.payment_status not in ('waiting_payment', 'waiting_confirm', 'paid') then
    raise exception 'Order is not eligible for inventory reservation';
  end if;

  -- Replays return the original allocation set. Recomputing FEFO after the
  -- first reservation can otherwise select a second batch and double reserve.
  if exists (
    select 1 from public.inventory_reservations
    where restaurant_id = target_restaurant_id
      and order_id = target_order_id
      and status in ('reserved', 'consumed')
  ) then
    select count(*)::integer, coalesce(sum(quantity), 0)
    into reserved_count, total_quantity
    from public.inventory_reservations
    where restaurant_id = target_restaurant_id
      and order_id = target_order_id
      and status in ('reserved', 'consumed');
    return jsonb_build_object('status', 'reserved', 'reservationCount', reserved_count, 'quantity', total_quantity);
  end if;

  if exists (
    select 1 from public.inventory_reservations
    where restaurant_id = target_restaurant_id
      and order_id = target_order_id
      and status = 'released'
  ) then
    raise exception 'Inventory reservation was already released';
  end if;

  for allocation_record in
    select * from jsonb_to_recordset(coalesce(target_allocations, '[]'::jsonb)) as allocation(
      "ingredientId" uuid, quantity numeric, "unitCost" integer,
      "branchId" uuid, "locationId" uuid, "batchId" uuid, "allocationIndex" integer
    )
    order by "ingredientId", "branchId", "locationId", "batchId", "allocationIndex"
  loop
    if allocation_record.quantity is null or allocation_record.quantity <= 0 then
      raise exception 'Inventory reservation quantity must be positive';
    end if;
    effective_branch_id := allocation_record."branchId";
    if effective_branch_id is not null and not exists (
      select 1 from public.store_branches
      where id = effective_branch_id and restaurant_id = target_restaurant_id
    ) then
      raise exception 'Inventory reservation branch is outside restaurant scope';
    end if;
    if allocation_record."locationId" is not null and not exists (
      select 1 from public.inventory_locations l
      where l.id = allocation_record."locationId"
        and l.restaurant_id = target_restaurant_id
        and l.branch_id is not distinct from effective_branch_id
    ) then
      raise exception 'Inventory reservation location does not match branch';
    end if;
    if allocation_record."batchId" is not null and not exists (
      select 1 from public.inventory_batches b
      where b.id = allocation_record."batchId"
        and b.restaurant_id = target_restaurant_id
        and b.ingredient_id = allocation_record."ingredientId"
    ) then
      raise exception 'Inventory reservation batch is outside ingredient scope';
    end if;

    v_allocation_key := md5(concat_ws(':', allocation_record."ingredientId", coalesce(effective_branch_id::text, 'global'), coalesce(allocation_record."locationId"::text, 'global'), coalesce(allocation_record."batchId"::text, 'no-batch'), coalesce(allocation_record."allocationIndex"::text, '0')));
    select * into existing from public.inventory_reservations
    where inventory_reservations.restaurant_id = target_restaurant_id
      and inventory_reservations.order_id = target_order_id
      and inventory_reservations.allocation_key = v_allocation_key
    for update;
    if found and existing.status in ('reserved', 'consumed') then
      reserved_count := reserved_count + 1;
      total_quantity := total_quantity + existing.quantity;
      continue;
    end if;
    if found and existing.status = 'released' then
      raise exception 'Inventory reservation was already released';
    end if;

    select * into balance_record
    from public.stock_balances
    where restaurant_id = target_restaurant_id
      and ingredient_id = allocation_record."ingredientId"
      and branch_id is not distinct from effective_branch_id
      and location_id is not distinct from allocation_record."locationId"
      and batch_id is not distinct from allocation_record."batchId"
    for update;
    if not found or balance_record.on_hand_quantity - balance_record.reserved_quantity < round(allocation_record.quantity::numeric, 3) then
      raise exception 'Inventory stock is insufficient for prepaid order';
    end if;

    update public.stock_balances
    set reserved_quantity = reserved_quantity + round(allocation_record.quantity::numeric, 3), updated_at = now()
    where id = balance_record.id;

    insert into public.inventory_movements (
      restaurant_id, ingredient_id, branch_id, location_id, batch_id,
      movement_type, quantity_delta, unit_cost, source_type, source_id,
      reason, actor_user_id, metadata
    ) values (
      target_restaurant_id, allocation_record."ingredientId", effective_branch_id,
      allocation_record."locationId", allocation_record."batchId", 'reserve',
      round(allocation_record.quantity::numeric, 3), allocation_record."unitCost", 'order',
      target_order_id, 'Reserve prepaid order stock', target_actor_user_id,
      jsonb_build_object('allocationKey', v_allocation_key, 'allocationIndex', allocation_record."allocationIndex")
    ) on conflict do nothing;

    if existing.id is not null then
      update public.inventory_reservations
      set status = 'reserved', quantity = round(allocation_record.quantity::numeric, 3),
          unit_cost = allocation_record."unitCost", reserved_at = now(), released_at = null,
          actor_user_id = target_actor_user_id, metadata = jsonb_build_object('allocationIndex', allocation_record."allocationIndex")
      where id = existing.id;
    else
      insert into public.inventory_reservations (
        restaurant_id, order_id, ingredient_id, branch_id, location_id, batch_id,
        allocation_key, quantity, unit_cost, actor_user_id, metadata
      ) values (
        target_restaurant_id, target_order_id, allocation_record."ingredientId", effective_branch_id,
        allocation_record."locationId", allocation_record."batchId", v_allocation_key,
        round(allocation_record.quantity::numeric, 3), allocation_record."unitCost", target_actor_user_id,
        jsonb_build_object('allocationIndex', allocation_record."allocationIndex")
      );
    end if;
    reserved_count := reserved_count + 1;
    total_quantity := total_quantity + round(allocation_record.quantity::numeric, 3);
  end loop;

  return jsonb_build_object('status', 'reserved', 'reservationCount', reserved_count, 'quantity', total_quantity);
end;
$$;

create or replace function public.consume_order_inventory(
  target_restaurant_id uuid,
  target_order_id uuid,
  target_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation_record public.inventory_reservations;
  consumed_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Inventory consume requires service role'; end if;
  for reservation_record in
    select * from public.inventory_reservations
    where restaurant_id = target_restaurant_id and order_id = target_order_id and status = 'reserved'
    order by ingredient_id, branch_id, location_id, batch_id
    for update
  loop
    update public.ingredients
    set on_hand_quantity = on_hand_quantity - reservation_record.quantity, updated_at = now()
    where id = reservation_record.ingredient_id
      and restaurant_id = target_restaurant_id
      and on_hand_quantity >= reservation_record.quantity;
    if not found then raise exception 'Ingredient reservation cannot be consumed safely'; end if;

    update public.stock_balances
    set on_hand_quantity = on_hand_quantity - reservation_record.quantity,
        reserved_quantity = reserved_quantity - reservation_record.quantity,
        updated_at = now()
    where restaurant_id = target_restaurant_id and ingredient_id = reservation_record.ingredient_id
      and branch_id is not distinct from reservation_record.branch_id
      and location_id is not distinct from reservation_record.location_id
      and batch_id is not distinct from reservation_record.batch_id
      and on_hand_quantity >= reservation_record.quantity
      and reserved_quantity >= reservation_record.quantity;
    if not found then raise exception 'Inventory reservation cannot be consumed safely'; end if;
    if reservation_record.batch_id is not null then
      update public.inventory_batches
      set remaining_quantity = remaining_quantity - reservation_record.quantity,
          status = case when remaining_quantity - reservation_record.quantity <= 0 then 'depleted' else status end,
          updated_at = now()
      where id = reservation_record.batch_id and restaurant_id = target_restaurant_id
        and ingredient_id = reservation_record.ingredient_id
        and remaining_quantity >= reservation_record.quantity;
      if not found then raise exception 'Inventory batch reservation cannot be consumed safely'; end if;
    end if;
    insert into public.inventory_movements (
      restaurant_id, ingredient_id, branch_id, location_id, batch_id, movement_type,
      quantity_delta, unit_cost, source_type, source_id, reason, actor_user_id
    ) values (
      target_restaurant_id, reservation_record.ingredient_id, reservation_record.branch_id,
      reservation_record.location_id, reservation_record.batch_id, 'deduct_sale',
      -reservation_record.quantity, reservation_record.unit_cost, 'order', target_order_id,
      'Consume prepaid order stock on acceptance', target_actor_user_id
    ) on conflict do nothing;
    update public.inventory_reservations
    set status = 'consumed', consumed_at = now(), actor_user_id = target_actor_user_id
    where id = reservation_record.id;
    consumed_count := consumed_count + 1;
  end loop;
  return jsonb_build_object('status', 'consumed', 'reservationCount', consumed_count);
end;
$$;

revoke all on function public.reserve_order_inventory(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.consume_order_inventory(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_order_inventory(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.consume_order_inventory(uuid, uuid, uuid) to service_role;

notify pgrst, 'reload schema';
