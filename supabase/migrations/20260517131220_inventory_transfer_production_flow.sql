-- Production transfer workflow: request -> approve -> dispatch -> receive.
-- Dispatch owns transfer_out; receive owns transfer_in so central kitchen stock is auditable in transit.

alter table public.branch_transfers
  drop constraint if exists branch_transfers_different_branch;

alter table public.branch_transfers
  add constraint branch_transfers_different_location check (
    from_location_id is null
    or to_location_id is null
    or from_location_id <> to_location_id
  );

create index if not exists branch_transfer_lines_dispatch_idx
  on public.branch_transfer_lines (restaurant_id, transfer_id, ingredient_id, batch_id);

create index if not exists inventory_movements_transfer_lookup_idx
  on public.inventory_movements (restaurant_id, transfer_id, movement_type, created_at desc)
  where source_type = 'transfer' and transfer_id is not null;

drop function if exists public.create_branch_transfer(uuid, uuid, uuid, text, uuid, jsonb);

create or replace function public.create_branch_transfer(
  target_restaurant_id uuid,
  target_from_location_id uuid,
  target_to_location_id uuid,
  target_note text default null,
  target_actor_user_id uuid default auth.uid(),
  target_lines jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  transfer_record public.branch_transfers;
  from_location_record record;
  to_location_record record;
  line_item jsonb;
  line_ingredient_id uuid;
  line_batch_id uuid;
  ingredient_record record;
  source_unit text;
  stock_unit text;
  conversion_factor numeric(18, 8);
  requested_quantity numeric(14, 3);
  stock_quantity numeric(14, 3);
  inserted_line_count integer := 0;
  total_quantity numeric(14, 3) := 0;
  generated_transfer_number text;
begin
  if target_restaurant_id is distinct from app_private.current_restaurant_id() then
    raise exception 'Branch transfer restaurant scope mismatch';
  end if;

  if target_from_location_id is null or target_to_location_id is null or target_from_location_id = target_to_location_id then
    raise exception 'Branch transfer requires two different locations';
  end if;

  if target_lines is null
    or jsonb_typeof(target_lines) <> 'array'
    or jsonb_array_length(target_lines) = 0
    or jsonb_array_length(target_lines) > 100
  then
    raise exception 'Branch transfer requires between 1 and 100 lines';
  end if;

  select id, branch_id, name
  into from_location_record
  from public.inventory_locations
  where id = target_from_location_id
    and restaurant_id = target_restaurant_id
    and is_active = true;

  if from_location_record.id is null then
    raise exception 'Transfer source location is missing';
  end if;

  select id, branch_id, name
  into to_location_record
  from public.inventory_locations
  where id = target_to_location_id
    and restaurant_id = target_restaurant_id
    and is_active = true;

  if to_location_record.id is null then
    raise exception 'Transfer destination location is missing';
  end if;

  generated_transfer_number :=
    'TR-' ||
    to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYYMMDD-HH24MISS') ||
    '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.branch_transfers (
    restaurant_id,
    from_branch_id,
    to_branch_id,
    from_location_id,
    to_location_id,
    transfer_number,
    status,
    requested_by_user_id,
    note,
    metadata
  )
  values (
    target_restaurant_id,
    from_location_record.branch_id,
    to_location_record.branch_id,
    target_from_location_id,
    target_to_location_id,
    generated_transfer_number,
    'requested',
    target_actor_user_id,
    nullif(trim(coalesce(target_note, '')), ''),
    jsonb_build_object(
      'createdFrom', 'inventory_workspace',
      'mode', 'approval_transfer',
      'fromLocationName', from_location_record.name,
      'toLocationName', to_location_record.name
    )
  )
  returning * into transfer_record;

  for line_item in
    select value
    from jsonb_array_elements(target_lines)
  loop
    line_ingredient_id := nullif(line_item ->> 'ingredientId', '')::uuid;
    line_batch_id := nullif(line_item ->> 'batchId', '')::uuid;
    requested_quantity := round((line_item ->> 'quantity')::numeric, 3);

    if line_ingredient_id is null then
      raise exception 'Transfer ingredient is required';
    end if;

    if requested_quantity <= 0 then
      raise exception 'Transfer quantity must be positive';
    end if;

    select id, unit, base_unit
    into ingredient_record
    from public.ingredients
    where id = line_ingredient_id
      and restaurant_id = target_restaurant_id
      and is_active = true;

    if ingredient_record.id is null then
      raise exception 'Transfer ingredient is missing';
    end if;

    if line_batch_id is not null and not exists (
      select 1
      from public.inventory_batches
      where id = line_batch_id
        and restaurant_id = target_restaurant_id
        and ingredient_id = line_ingredient_id
        and status = 'active'
        and remaining_quantity > 0
    ) then
      raise exception 'Transfer batch is missing or unavailable';
    end if;

    stock_unit := coalesce(ingredient_record.base_unit, ingredient_record.unit);
    source_unit := coalesce(nullif(trim(line_item ->> 'unit'), ''), stock_unit);
    conversion_factor := 1;

    if source_unit <> stock_unit then
      select factor
      into conversion_factor
      from public.ingredient_unit_conversions
      where restaurant_id = target_restaurant_id
        and ingredient_id = line_ingredient_id
        and from_unit = source_unit
        and to_unit = stock_unit
      limit 1;

      if conversion_factor is null then
        raise exception 'Missing unit conversion from % to %', source_unit, stock_unit;
      end if;
    end if;

    stock_quantity := round((requested_quantity * conversion_factor)::numeric, 3);

    insert into public.branch_transfer_lines (
      restaurant_id,
      transfer_id,
      ingredient_id,
      batch_id,
      unit,
      requested_quantity,
      note,
      metadata
    )
    values (
      target_restaurant_id,
      transfer_record.id,
      line_ingredient_id,
      line_batch_id,
      stock_unit,
      stock_quantity,
      nullif(trim(coalesce(line_item ->> 'note', '')), ''),
      jsonb_build_object(
        'requestedQuantity', requested_quantity,
        'requestedUnit', source_unit,
        'stockUnit', stock_unit,
        'conversionFactor', conversion_factor
      )
    );

    inserted_line_count := inserted_line_count + 1;
    total_quantity := total_quantity + stock_quantity;
  end loop;

  update public.branch_transfers
  set
    metadata = metadata || jsonb_build_object(
      'lineCount', inserted_line_count,
      'totalQuantity', total_quantity,
      'workflow', jsonb_build_array('requested')
    ),
    updated_at = now()
  where id = transfer_record.id
    and restaurant_id = target_restaurant_id;

  return jsonb_build_object(
    'transferId', transfer_record.id,
    'transferNumber', transfer_record.transfer_number,
    'status', 'requested',
    'lineCount', inserted_line_count,
    'totalQuantity', total_quantity
  );
end;
$$;

revoke all on function public.create_branch_transfer(uuid, uuid, uuid, text, uuid, jsonb) from public;
grant execute on function public.create_branch_transfer(uuid, uuid, uuid, text, uuid, jsonb) to authenticated, service_role;

drop function if exists public.process_branch_transfer(uuid, uuid, text, uuid, text);
drop function if exists public.process_branch_transfer(uuid, uuid, text, uuid, text, jsonb);

create or replace function public.process_branch_transfer(
  target_restaurant_id uuid,
  target_transfer_id uuid,
  target_action text,
  target_actor_user_id uuid default auth.uid(),
  target_note text default null,
  target_lines jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  transfer_record public.branch_transfers;
  from_location_record record;
  to_location_record record;
  line_record record;
  movement_count integer := 0;
  line_count integer := 0;
  total_quantity numeric(14, 3) := 0;
  received_delta numeric(14, 3) := 0;
  total_dispatched_quantity numeric(14, 3) := 0;
  total_received_quantity numeric(14, 3) := 0;
  receive_line jsonb;
  next_status text;
begin
  if target_restaurant_id is distinct from app_private.current_restaurant_id() then
    raise exception 'Branch transfer restaurant scope mismatch';
  end if;

  if target_action not in ('approve', 'dispatch', 'receive', 'cancel') then
    raise exception 'Unsupported transfer action %', target_action;
  end if;

  if target_lines is not null and jsonb_typeof(target_lines) <> 'array' then
    raise exception 'Transfer action lines must be an array';
  end if;

  select *
  into transfer_record
  from public.branch_transfers
  where id = target_transfer_id
    and restaurant_id = target_restaurant_id
  for update;

  if transfer_record.id is null then
    raise exception 'Branch transfer is missing';
  end if;

  if transfer_record.status in ('received', 'cancelled') then
    return jsonb_build_object(
      'transferId', transfer_record.id,
      'transferNumber', transfer_record.transfer_number,
      'status', transfer_record.status,
      'movementCount', 0,
      'skippedReason', 'already_closed'
    );
  end if;

  select id, branch_id, name
  into from_location_record
  from public.inventory_locations
  where id = transfer_record.from_location_id
    and restaurant_id = target_restaurant_id
    and is_active = true;

  select id, branch_id, name
  into to_location_record
  from public.inventory_locations
  where id = transfer_record.to_location_id
    and restaurant_id = target_restaurant_id
    and is_active = true;

  if from_location_record.id is null or to_location_record.id is null then
    raise exception 'Transfer locations are missing';
  end if;

  if target_action = 'approve' then
    if transfer_record.status not in ('draft', 'requested') then
      raise exception 'Only draft or requested transfers can be approved';
    end if;

    update public.branch_transfers
    set
      status = 'approved',
      approved_by_user_id = target_actor_user_id,
      note = coalesce(nullif(trim(coalesce(target_note, '')), ''), note),
      metadata = metadata || jsonb_build_object('workflow', coalesce(metadata -> 'workflow', '[]'::jsonb) || jsonb_build_array('approved')),
      updated_at = now()
    where id = transfer_record.id
      and restaurant_id = target_restaurant_id
    returning status into next_status;

    return jsonb_build_object(
      'transferId', transfer_record.id,
      'transferNumber', transfer_record.transfer_number,
      'status', next_status,
      'movementCount', 0
    );
  end if;

  if target_action = 'cancel' then
    if transfer_record.status not in ('draft', 'requested', 'approved') then
      raise exception 'Only draft, requested or approved transfers can be cancelled';
    end if;

    update public.branch_transfers
    set
      status = 'cancelled',
      cancelled_at = now(),
      note = coalesce(nullif(trim(coalesce(target_note, '')), ''), note),
      metadata = metadata || jsonb_build_object('workflow', coalesce(metadata -> 'workflow', '[]'::jsonb) || jsonb_build_array('cancelled')),
      updated_at = now()
    where id = transfer_record.id
      and restaurant_id = target_restaurant_id
    returning status into next_status;

    return jsonb_build_object(
      'transferId', transfer_record.id,
      'transferNumber', transfer_record.transfer_number,
      'status', next_status,
      'movementCount', 0
    );
  end if;

  if target_action = 'dispatch' then
    if transfer_record.status <> 'approved' then
      raise exception 'Only approved transfers can be dispatched';
    end if;

    for line_record in
      select *
      from public.branch_transfer_lines
      where transfer_id = transfer_record.id
        and restaurant_id = target_restaurant_id
      order by created_at, id
      for update
    loop
      if line_record.dispatched_quantity <= 0 then
        perform public.apply_inventory_movement(
          target_restaurant_id,
          line_record.ingredient_id,
          'transfer_out',
          -abs(line_record.requested_quantity),
          null,
          'transfer',
          transfer_record.id,
          'Xuat dieu chuyen ' || transfer_record.transfer_number || ' tu ' || from_location_record.name,
          target_actor_user_id,
          jsonb_build_object(
            'transferId', transfer_record.id,
            'transferLineId', line_record.id,
            'transferAction', 'dispatch',
            'fromLocationId', transfer_record.from_location_id,
            'toLocationId', transfer_record.to_location_id
          ),
          from_location_record.branch_id,
          transfer_record.from_location_id,
          line_record.batch_id,
          null,
          transfer_record.id
        );

        update public.branch_transfer_lines
        set
          dispatched_quantity = requested_quantity,
          updated_at = now()
        where id = line_record.id
          and restaurant_id = target_restaurant_id;

        movement_count := movement_count + 1;
      end if;

      line_count := line_count + 1;
      total_quantity := total_quantity + line_record.requested_quantity;
    end loop;

    update public.branch_transfers
    set
      status = 'dispatched',
      dispatched_at = now(),
      note = coalesce(nullif(trim(coalesce(target_note, '')), ''), note),
      metadata = metadata || jsonb_build_object(
        'lineCount', line_count,
        'totalQuantity', total_quantity,
        'workflow', coalesce(metadata -> 'workflow', '[]'::jsonb) || jsonb_build_array('dispatched')
      ),
      updated_at = now()
    where id = transfer_record.id
      and restaurant_id = target_restaurant_id
    returning status into next_status;

    return jsonb_build_object(
      'transferId', transfer_record.id,
      'transferNumber', transfer_record.transfer_number,
      'status', next_status,
      'movementCount', movement_count,
      'lineCount', line_count,
      'totalQuantity', total_quantity
    );
  end if;

  if target_action = 'receive' then
    if transfer_record.status <> 'dispatched' then
      raise exception 'Only dispatched transfers can be received';
    end if;

    for line_record in
      select *
      from public.branch_transfer_lines
      where transfer_id = transfer_record.id
        and restaurant_id = target_restaurant_id
      order by created_at, id
      for update
    loop
      received_delta := 0;

      if line_record.dispatched_quantity <= 0 then
        raise exception 'Transfer line has not been dispatched';
      end if;

      if line_record.received_quantity < line_record.dispatched_quantity then
        receive_line := null;
        if target_lines is not null then
          select value
          into receive_line
          from jsonb_array_elements(target_lines)
          where value ->> 'lineId' = line_record.id::text
          limit 1;
        end if;

        received_delta := case
          when target_lines is null then line_record.dispatched_quantity - line_record.received_quantity
          when receive_line is null then 0
          else round(greatest(0, (receive_line ->> 'receivedQuantity')::numeric)::numeric, 3)
        end;

        if received_delta > line_record.dispatched_quantity - line_record.received_quantity then
          raise exception 'Received quantity exceeds dispatched quantity';
        end if;

        if received_delta <= 0 then
          line_count := line_count + 1;
          total_quantity := total_quantity + line_record.dispatched_quantity;
          total_dispatched_quantity := total_dispatched_quantity + line_record.dispatched_quantity;
          total_received_quantity := total_received_quantity + line_record.received_quantity;
          continue;
        end if;

        perform public.apply_inventory_movement(
          target_restaurant_id,
          line_record.ingredient_id,
          'transfer_in',
          abs(received_delta),
          null,
          'transfer',
          transfer_record.id,
          'Nhan dieu chuyen ' || transfer_record.transfer_number || ' tai ' || to_location_record.name,
          target_actor_user_id,
          jsonb_build_object(
            'transferId', transfer_record.id,
            'transferLineId', line_record.id,
            'transferAction', 'receive',
            'partialReceive', target_lines is not null,
            'receivedDelta', received_delta,
            'fromLocationId', transfer_record.from_location_id,
            'toLocationId', transfer_record.to_location_id
          ),
          to_location_record.branch_id,
          transfer_record.to_location_id,
          line_record.batch_id,
          null,
          transfer_record.id
        );

        update public.branch_transfer_lines
        set
          received_quantity = received_quantity + received_delta,
          note = coalesce(nullif(trim(coalesce(receive_line ->> 'note', '')), ''), note),
          metadata = metadata || jsonb_build_object(
            'lastReceivedQuantity', received_delta,
            'lastReceivedAt', now(),
            'varianceQuantity', greatest(0, dispatched_quantity - (received_quantity + received_delta))
          ),
          updated_at = now()
        where id = line_record.id
          and restaurant_id = target_restaurant_id;

        movement_count := movement_count + 1;
      end if;

      line_count := line_count + 1;
      total_quantity := total_quantity + line_record.dispatched_quantity;
      total_dispatched_quantity := total_dispatched_quantity + line_record.dispatched_quantity;
      total_received_quantity := total_received_quantity + least(line_record.dispatched_quantity, line_record.received_quantity + received_delta);
    end loop;

    next_status := case
      when total_dispatched_quantity > 0 and total_received_quantity >= total_dispatched_quantity then 'received'
      else 'dispatched'
    end;

    update public.branch_transfers
    set
      status = next_status,
      received_at = case when next_status = 'received' then now() else received_at end,
      note = coalesce(nullif(trim(coalesce(target_note, '')), ''), note),
      metadata = metadata || jsonb_build_object(
        'lineCount', line_count,
        'totalQuantity', total_quantity,
        'dispatchedQuantity', total_dispatched_quantity,
        'receivedQuantity', total_received_quantity,
        'varianceQuantity', greatest(0, total_dispatched_quantity - total_received_quantity),
        'workflow', coalesce(metadata -> 'workflow', '[]'::jsonb) || jsonb_build_array(case when next_status = 'received' then 'received' else 'partial_received' end)
      ),
      updated_at = now()
    where id = transfer_record.id
      and restaurant_id = target_restaurant_id
    returning status into next_status;

    return jsonb_build_object(
      'transferId', transfer_record.id,
      'transferNumber', transfer_record.transfer_number,
      'status', next_status,
      'movementCount', movement_count,
      'lineCount', line_count,
      'totalQuantity', total_quantity,
      'receivedQuantity', total_received_quantity,
      'varianceQuantity', greatest(0, total_dispatched_quantity - total_received_quantity)
    );
  end if;

  raise exception 'Unsupported transfer action %', target_action;
end;
$$;

revoke all on function public.process_branch_transfer(uuid, uuid, text, uuid, text, jsonb) from public;
grant execute on function public.process_branch_transfer(uuid, uuid, text, uuid, text, jsonb) to authenticated, service_role;
