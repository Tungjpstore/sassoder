-- Idempotent, auditable transaction boundaries for procurement and warehouse commits.

create table if not exists public.inventory_transaction_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  operation text not null,
  idempotency_key text not null,
  request_fingerprint text not null,
  actor_user_id uuid,
  response_payload jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint inventory_transaction_requests_operation_check check (
    operation in (
      'receive_purchase_order',
      'apply_inventory_count',
      'create_branch_transfer',
      'process_branch_transfer'
    )
  ),
  constraint inventory_transaction_requests_key_format check (
    idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$'
  ),
  constraint inventory_transaction_requests_fingerprint_format check (
    request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  constraint inventory_transaction_requests_response_object check (
    response_payload is null or jsonb_typeof(response_payload) = 'object'
  ),
  constraint inventory_transaction_requests_actor_tenant_fkey
    foreign key (restaurant_id, actor_user_id)
    references public.users (restaurant_id, id)
    on delete set null (actor_user_id),
  unique (restaurant_id, operation, idempotency_key)
);

create index if not exists inventory_transaction_requests_created_idx
  on public.inventory_transaction_requests (restaurant_id, created_at desc);

alter table public.inventory_transaction_requests enable row level security;
revoke all on table public.inventory_transaction_requests from public, anon, authenticated;
grant select, insert, update on table public.inventory_transaction_requests to service_role;

create or replace function public.receive_purchase_order_atomic(
  p_restaurant_id uuid,
  p_purchase_order_id uuid,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_actor_user_id uuid,
  p_received_at timestamptz default now(),
  p_lines jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.inventory_transaction_requests;
  v_purchase_order public.purchase_orders;
  v_location_branch_id uuid;
  v_line record;
  v_response jsonb;
  v_movement_line_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'INVENTORY_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if app_private.current_restaurant_id() is distinct from p_restaurant_id then
    raise exception 'INVENTORY_RESTAURANT_SCOPE_MISMATCH' using errcode = '42501';
  end if;
  if p_actor_user_id is null or not exists (
    select 1 from public.users users
    where users.id = p_actor_user_id and users.restaurant_id = p_restaurant_id
  ) then
    raise exception 'INVENTORY_ACTOR_SCOPE_MISMATCH' using errcode = '42501';
  end if;
  if p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$'
    or p_request_fingerprint !~ '^[0-9a-f]{64}$'
  then
    raise exception 'INVALID_INVENTORY_IDEMPOTENCY_REQUEST' using errcode = '22023';
  end if;
  if p_lines is not null and jsonb_typeof(p_lines) <> 'array' then
    raise exception 'PURCHASE_ORDER_RECEIPT_LINES_INVALID' using errcode = '22023';
  end if;

  insert into public.inventory_transaction_requests (
    restaurant_id, operation, idempotency_key, request_fingerprint, actor_user_id
  )
  values (
    p_restaurant_id, 'receive_purchase_order', p_idempotency_key, p_request_fingerprint, p_actor_user_id
  )
  on conflict (restaurant_id, operation, idempotency_key) do nothing;

  select requests.*
  into v_request
  from public.inventory_transaction_requests requests
  where requests.restaurant_id = p_restaurant_id
    and requests.operation = 'receive_purchase_order'
    and requests.idempotency_key = p_idempotency_key
  for update;

  if v_request.request_fingerprint is distinct from p_request_fingerprint then
    raise exception 'INVENTORY_IDEMPOTENCY_FINGERPRINT_MISMATCH' using errcode = '40001';
  end if;
  if v_request.response_payload is not null then
    return jsonb_set(v_request.response_payload, '{idempotentReplay}', 'true'::jsonb, true);
  end if;

  select purchase_orders.*
  into v_purchase_order
  from public.purchase_orders purchase_orders
  where purchase_orders.id = p_purchase_order_id
    and purchase_orders.restaurant_id = p_restaurant_id
  for update;

  if not found then
    raise exception 'PURCHASE_ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_purchase_order.status in ('cancelled', 'delivered') then
    raise exception 'PURCHASE_ORDER_STATE_CONFLICT' using errcode = '40001';
  end if;

  if v_purchase_order.branch_id is not null and not exists (
    select 1 from public.store_branches branches
    where branches.id = v_purchase_order.branch_id and branches.restaurant_id = p_restaurant_id
  ) then
    raise exception 'PURCHASE_ORDER_BRANCH_SCOPE_MISMATCH' using errcode = '42501';
  end if;

  if v_purchase_order.location_id is not null then
    select locations.branch_id
    into v_location_branch_id
    from public.inventory_locations locations
    where locations.id = v_purchase_order.location_id
      and locations.restaurant_id = p_restaurant_id
      and locations.is_active = true
    for key share;

    if not found or (
      v_purchase_order.branch_id is not null
      and v_location_branch_id is distinct from v_purchase_order.branch_id
    ) then
      raise exception 'PURCHASE_ORDER_BRANCH_SCOPE_MISMATCH' using errcode = '42501';
    end if;
  end if;

  perform purchase_order_lines.id
  from public.purchase_order_lines purchase_order_lines
  where purchase_order_lines.purchase_order_id = p_purchase_order_id
    and purchase_order_lines.restaurant_id = p_restaurant_id
  order by purchase_order_lines.created_at, purchase_order_lines.id
  for update;

  if p_lines is not null and jsonb_array_length(p_lines) > 0 then
    if (
      select count(*) <> count(distinct nullif(items.value ->> 'purchaseOrderLineId', '')::uuid)
      from jsonb_array_elements(p_lines) items
    ) then
      raise exception 'PURCHASE_ORDER_RECEIPT_LINE_DUPLICATED' using errcode = '22023';
    end if;

    for v_line in
      select
        nullif(items.value ->> 'purchaseOrderLineId', '')::uuid as purchase_order_line_id,
        round((items.value ->> 'receivedQuantity')::numeric, 3) as requested_quantity
      from jsonb_array_elements(p_lines) items
    loop
      if v_line.purchase_order_line_id is null or v_line.requested_quantity is null or v_line.requested_quantity <= 0 then
        raise exception 'PURCHASE_ORDER_RECEIPT_LINE_INVALID' using errcode = '22023';
      end if;

      if not exists (
        select 1
        from public.purchase_order_lines purchase_order_lines
        where purchase_order_lines.id = v_line.purchase_order_line_id
          and purchase_order_lines.purchase_order_id = p_purchase_order_id
          and purchase_order_lines.restaurant_id = p_restaurant_id
      ) then
        raise exception 'PURCHASE_ORDER_LINE_SCOPE_MISMATCH' using errcode = '42501';
      end if;
      if exists (
        select 1
        from public.purchase_order_lines purchase_order_lines
        where purchase_order_lines.id = v_line.purchase_order_line_id
          and purchase_order_lines.purchase_order_id = p_purchase_order_id
          and purchase_order_lines.restaurant_id = p_restaurant_id
          and purchase_order_lines.received_quantity + v_line.requested_quantity > purchase_order_lines.order_quantity
      ) then
        raise exception 'PURCHASE_ORDER_OVER_RECEIPT' using errcode = '40001';
      end if;
    end loop;
  end if;

  select public.receive_purchase_order(
    p_restaurant_id,
    p_purchase_order_id,
    p_actor_user_id,
    coalesce(p_received_at, now()),
    p_lines
  ) into v_response;

  update public.inventory_movements movements
  set
    unit_cost = case
      when movements.unit_cost is not null
        and coalesce(nullif(movements.metadata ->> 'conversionFactor', '')::numeric, 1) > 0
      then round(
        movements.unit_cost /
        coalesce(nullif(movements.metadata ->> 'conversionFactor', '')::numeric, 1)
      )::integer
      else movements.unit_cost
    end,
    metadata = movements.metadata || jsonb_build_object(
      'inventoryRequestId', v_request.id,
      'idempotencyKey', p_idempotency_key,
      'requestFingerprint', p_request_fingerprint
    )
  where movements.restaurant_id = p_restaurant_id
    and movements.source_type = 'purchase_order'
    and movements.source_id = p_purchase_order_id
    and movements.created_at >= v_request.created_at
    and movements.metadata ->> 'inventoryRequestId' is null;

  update public.inventory_batches batches
  set
    unit_cost = movements.unit_cost,
    metadata = batches.metadata || jsonb_build_object(
      'inventoryRequestId', v_request.id,
      'idempotencyKey', p_idempotency_key
    ),
    updated_at = now()
  from public.inventory_movements movements
  where movements.batch_id = batches.id
    and movements.restaurant_id = p_restaurant_id
    and movements.source_type = 'purchase_order'
    and movements.source_id = p_purchase_order_id
    and movements.metadata ->> 'inventoryRequestId' = v_request.id::text;

  select count(distinct movements.metadata ->> 'purchaseOrderLineId')
  into v_movement_line_count
  from public.inventory_movements movements
  where movements.restaurant_id = p_restaurant_id
    and movements.source_type = 'purchase_order'
    and movements.source_id = p_purchase_order_id
    and movements.metadata ->> 'inventoryRequestId' = v_request.id::text;

  if v_movement_line_count <> coalesce((v_response ->> 'receivedLines')::integer, -1) then
    raise exception 'PURCHASE_ORDER_LEDGER_MISMATCH' using errcode = '40001';
  end if;

  v_response := v_response || jsonb_build_object('idempotentReplay', false);

  insert into public.audit_logs (
    restaurant_id, actor_user_id, action, entity_type, entity_id, after_data, metadata
  )
  values (
    p_restaurant_id,
    p_actor_user_id,
    'inventory.purchase_order.received_atomic',
    'purchase_order',
    p_purchase_order_id::text,
    v_response,
    jsonb_build_object(
      'inventoryRequestId', v_request.id,
      'idempotencyKey', p_idempotency_key,
      'requestFingerprint', p_request_fingerprint
    )
  );

  insert into public.operational_event_outbox (
    event_id, event_type, restaurant_id, branch_id, tenant_id, source, payload
  )
  values (
    'inventory.purchase_order.received:' || v_request.id::text,
    'inventory.purchase_order.received',
    p_restaurant_id,
    v_purchase_order.branch_id,
    p_restaurant_id::text,
    'receive_purchase_order_atomic',
    jsonb_build_object(
      'type', 'inventory.purchase_order.received',
      'eventId', 'inventory.purchase_order.received:' || v_request.id::text,
      'restaurantId', p_restaurant_id,
      'branchId', v_purchase_order.branch_id,
      'purchaseOrderId', p_purchase_order_id,
      'actorUserId', p_actor_user_id,
      'result', v_response
    )
  );

  update public.inventory_transaction_requests requests
  set response_payload = v_response, completed_at = now()
  where requests.id = v_request.id;

  return v_response;
end;
$$;

create or replace function public.apply_inventory_count_atomic(
  p_restaurant_id uuid,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_title text,
  p_location_id uuid,
  p_note text,
  p_actor_user_id uuid,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.inventory_transaction_requests;
  v_response jsonb;
  v_count_id uuid;
  v_count_branch_id uuid;
  v_movement_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'INVENTORY_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if app_private.current_restaurant_id() is distinct from p_restaurant_id then
    raise exception 'INVENTORY_RESTAURANT_SCOPE_MISMATCH' using errcode = '42501';
  end if;
  if p_actor_user_id is null or not exists (
    select 1 from public.users users
    where users.id = p_actor_user_id and users.restaurant_id = p_restaurant_id
  ) then
    raise exception 'INVENTORY_ACTOR_SCOPE_MISMATCH' using errcode = '42501';
  end if;
  if p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$'
    or p_request_fingerprint !~ '^[0-9a-f]{64}$'
    or p_lines is null
    or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) = 0
  then
    raise exception 'INVALID_INVENTORY_COUNT_REQUEST' using errcode = '22023';
  end if;

  insert into public.inventory_transaction_requests (
    restaurant_id, operation, idempotency_key, request_fingerprint, actor_user_id
  )
  values (
    p_restaurant_id, 'apply_inventory_count', p_idempotency_key, p_request_fingerprint, p_actor_user_id
  )
  on conflict (restaurant_id, operation, idempotency_key) do nothing;

  select requests.*
  into v_request
  from public.inventory_transaction_requests requests
  where requests.restaurant_id = p_restaurant_id
    and requests.operation = 'apply_inventory_count'
    and requests.idempotency_key = p_idempotency_key
  for update;

  if v_request.request_fingerprint is distinct from p_request_fingerprint then
    raise exception 'INVENTORY_IDEMPOTENCY_FINGERPRINT_MISMATCH' using errcode = '40001';
  end if;
  if v_request.response_payload is not null then
    return jsonb_set(v_request.response_payload, '{idempotentReplay}', 'true'::jsonb, true);
  end if;

  if p_location_id is not null and not exists (
    select 1 from public.inventory_locations locations
    where locations.id = p_location_id
      and locations.restaurant_id = p_restaurant_id
      and locations.is_active = true
  ) then
    raise exception 'INVENTORY_COUNT_LOCATION_SCOPE_MISMATCH' using errcode = '42501';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_lines) items
    where nullif(items.value ->> 'locationId', '') is not null
      and not exists (
        select 1 from public.inventory_locations locations
        where locations.id = (items.value ->> 'locationId')::uuid
          and locations.restaurant_id = p_restaurant_id
          and locations.is_active = true
      )
  ) then
    raise exception 'INVENTORY_COUNT_LOCATION_SCOPE_MISMATCH' using errcode = '42501';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_lines) items
    where not exists (
      select 1 from public.ingredients ingredients
      where ingredients.id = (items.value ->> 'ingredientId')::uuid
        and ingredients.restaurant_id = p_restaurant_id
        and ingredients.is_active = true
    )
  ) then
    raise exception 'INVENTORY_COUNT_INGREDIENT_SCOPE_MISMATCH' using errcode = '42501';
  end if;

  perform ingredients.id
  from public.ingredients ingredients
  where ingredients.restaurant_id = p_restaurant_id
    and ingredients.id in (
      select distinct (items.value ->> 'ingredientId')::uuid
      from jsonb_array_elements(p_lines) items
    )
  order by ingredients.id
  for update;

  select public.apply_inventory_count(
    p_restaurant_id,
    p_title,
    p_location_id,
    p_note,
    p_actor_user_id,
    p_lines
  ) into v_response;

  v_count_id := (v_response ->> 'countId')::uuid;
  select counts.branch_id into v_count_branch_id
  from public.inventory_counts counts
  where counts.id = v_count_id and counts.restaurant_id = p_restaurant_id;

  update public.inventory_movements movements
  set metadata = movements.metadata || jsonb_build_object(
    'inventoryRequestId', v_request.id,
    'idempotencyKey', p_idempotency_key,
    'requestFingerprint', p_request_fingerprint
  )
  where movements.restaurant_id = p_restaurant_id
    and movements.source_type = 'count'
    and movements.source_id = v_count_id
    and movements.metadata ->> 'inventoryRequestId' is null;

  select count(*) into v_movement_count
  from public.inventory_movements movements
  where movements.restaurant_id = p_restaurant_id
    and movements.source_type = 'count'
    and movements.source_id = v_count_id
    and movements.metadata ->> 'inventoryRequestId' = v_request.id::text;

  if v_movement_count <> coalesce((v_response ->> 'adjustedLineCount')::integer, -1) then
    raise exception 'INVENTORY_COUNT_LEDGER_MISMATCH' using errcode = '40001';
  end if;

  v_response := v_response || jsonb_build_object('idempotentReplay', false);

  insert into public.audit_logs (
    restaurant_id, actor_user_id, action, entity_type, entity_id, after_data, metadata
  )
  values (
    p_restaurant_id,
    p_actor_user_id,
    'inventory.count.applied_atomic',
    'inventory_count',
    v_count_id::text,
    v_response,
    jsonb_build_object(
      'inventoryRequestId', v_request.id,
      'idempotencyKey', p_idempotency_key,
      'requestFingerprint', p_request_fingerprint
    )
  );

  insert into public.operational_event_outbox (
    event_id, event_type, restaurant_id, branch_id, tenant_id, source, payload
  )
  values (
    'inventory.count.applied:' || v_request.id::text,
    'inventory.count.applied',
    p_restaurant_id,
    v_count_branch_id,
    p_restaurant_id::text,
    'apply_inventory_count_atomic',
    jsonb_build_object(
      'type', 'inventory.count.applied',
      'eventId', 'inventory.count.applied:' || v_request.id::text,
      'restaurantId', p_restaurant_id,
      'branchId', v_count_branch_id,
      'inventoryCountId', v_count_id,
      'actorUserId', p_actor_user_id,
      'result', v_response
    )
  );

  update public.inventory_transaction_requests requests
  set response_payload = v_response, completed_at = now()
  where requests.id = v_request.id;

  return v_response;
end;
$$;

create or replace function public.create_branch_transfer_atomic(
  p_restaurant_id uuid,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_note text,
  p_actor_user_id uuid,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.inventory_transaction_requests;
  v_from_branch_id uuid;
  v_to_branch_id uuid;
  v_response jsonb;
  v_transfer_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'INVENTORY_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if app_private.current_restaurant_id() is distinct from p_restaurant_id then
    raise exception 'INVENTORY_RESTAURANT_SCOPE_MISMATCH' using errcode = '42501';
  end if;
  if p_actor_user_id is null or not exists (
    select 1 from public.users users
    where users.id = p_actor_user_id and users.restaurant_id = p_restaurant_id
  ) then
    raise exception 'INVENTORY_ACTOR_SCOPE_MISMATCH' using errcode = '42501';
  end if;
  if p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$'
    or p_request_fingerprint !~ '^[0-9a-f]{64}$'
    or p_from_location_id is null
    or p_to_location_id is null
    or p_from_location_id = p_to_location_id
    or p_lines is null
    or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) = 0
  then
    raise exception 'INVALID_BRANCH_TRANSFER_REQUEST' using errcode = '22023';
  end if;

  insert into public.inventory_transaction_requests (
    restaurant_id, operation, idempotency_key, request_fingerprint, actor_user_id
  )
  values (
    p_restaurant_id, 'create_branch_transfer', p_idempotency_key, p_request_fingerprint, p_actor_user_id
  )
  on conflict (restaurant_id, operation, idempotency_key) do nothing;

  select requests.*
  into v_request
  from public.inventory_transaction_requests requests
  where requests.restaurant_id = p_restaurant_id
    and requests.operation = 'create_branch_transfer'
    and requests.idempotency_key = p_idempotency_key
  for update;

  if v_request.request_fingerprint is distinct from p_request_fingerprint then
    raise exception 'INVENTORY_IDEMPOTENCY_FINGERPRINT_MISMATCH' using errcode = '40001';
  end if;
  if v_request.response_payload is not null then
    return jsonb_set(v_request.response_payload, '{idempotentReplay}', 'true'::jsonb, true);
  end if;

  perform locations.id
  from public.inventory_locations locations
  where locations.id in (p_from_location_id, p_to_location_id)
    and locations.restaurant_id = p_restaurant_id
    and locations.is_active = true
  order by locations.id
  for update;

  select locations.branch_id into v_from_branch_id
  from public.inventory_locations locations
  where locations.id = p_from_location_id and locations.restaurant_id = p_restaurant_id;
  if not found then
    raise exception 'TRANSFER_LOCATION_SCOPE_MISMATCH' using errcode = '42501';
  end if;

  select locations.branch_id into v_to_branch_id
  from public.inventory_locations locations
  where locations.id = p_to_location_id and locations.restaurant_id = p_restaurant_id;
  if not found then
    raise exception 'TRANSFER_LOCATION_SCOPE_MISMATCH' using errcode = '42501';
  end if;

  if (v_from_branch_id is not null and not exists (
      select 1 from public.store_branches branches
      where branches.id = v_from_branch_id and branches.restaurant_id = p_restaurant_id
    )) or (v_to_branch_id is not null and not exists (
      select 1 from public.store_branches branches
      where branches.id = v_to_branch_id and branches.restaurant_id = p_restaurant_id
    ))
  then
    raise exception 'TRANSFER_BRANCH_SCOPE_MISMATCH' using errcode = '42501';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_lines) items
    where not exists (
      select 1 from public.ingredients ingredients
      where ingredients.id = (items.value ->> 'ingredientId')::uuid
        and ingredients.restaurant_id = p_restaurant_id
        and ingredients.is_active = true
    )
  ) then
    raise exception 'TRANSFER_INGREDIENT_SCOPE_MISMATCH' using errcode = '42501';
  end if;

  perform ingredients.id
  from public.ingredients ingredients
  where ingredients.restaurant_id = p_restaurant_id
    and ingredients.id in (
      select distinct (items.value ->> 'ingredientId')::uuid
      from jsonb_array_elements(p_lines) items
    )
  order by ingredients.id
  for update;

  select public.create_branch_transfer(
    p_restaurant_id,
    p_from_location_id,
    p_to_location_id,
    p_note,
    p_actor_user_id,
    p_lines
  ) into v_response;

  v_transfer_id := (v_response ->> 'transferId')::uuid;
  v_response := v_response || jsonb_build_object('idempotentReplay', false);

  update public.branch_transfers transfers
  set metadata = transfers.metadata || jsonb_build_object(
    'inventoryRequestId', v_request.id,
    'idempotencyKey', p_idempotency_key,
    'requestFingerprint', p_request_fingerprint
  )
  where transfers.id = v_transfer_id and transfers.restaurant_id = p_restaurant_id;

  insert into public.audit_logs (
    restaurant_id, actor_user_id, action, entity_type, entity_id, after_data, metadata
  )
  values (
    p_restaurant_id,
    p_actor_user_id,
    'inventory.transfer.created_atomic',
    'branch_transfer',
    v_transfer_id::text,
    v_response,
    jsonb_build_object(
      'inventoryRequestId', v_request.id,
      'idempotencyKey', p_idempotency_key,
      'requestFingerprint', p_request_fingerprint
    )
  );

  update public.inventory_transaction_requests requests
  set response_payload = v_response, completed_at = now()
  where requests.id = v_request.id;

  return v_response;
end;
$$;

create or replace function public.process_branch_transfer_atomic(
  p_restaurant_id uuid,
  p_transfer_id uuid,
  p_action text,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_actor_user_id uuid,
  p_note text default null,
  p_lines jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.inventory_transaction_requests;
  v_transfer public.branch_transfers;
  v_response jsonb;
  v_movement_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'INVENTORY_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if app_private.current_restaurant_id() is distinct from p_restaurant_id then
    raise exception 'INVENTORY_RESTAURANT_SCOPE_MISMATCH' using errcode = '42501';
  end if;
  if p_actor_user_id is null or not exists (
    select 1 from public.users users
    where users.id = p_actor_user_id and users.restaurant_id = p_restaurant_id
  ) then
    raise exception 'INVENTORY_ACTOR_SCOPE_MISMATCH' using errcode = '42501';
  end if;
  if p_action not in ('approve', 'dispatch', 'receive', 'cancel')
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$'
    or p_request_fingerprint !~ '^[0-9a-f]{64}$'
    or (p_lines is not null and jsonb_typeof(p_lines) <> 'array')
  then
    raise exception 'INVALID_TRANSFER_PROCESS_REQUEST' using errcode = '22023';
  end if;

  insert into public.inventory_transaction_requests (
    restaurant_id, operation, idempotency_key, request_fingerprint, actor_user_id
  )
  values (
    p_restaurant_id, 'process_branch_transfer', p_idempotency_key, p_request_fingerprint, p_actor_user_id
  )
  on conflict (restaurant_id, operation, idempotency_key) do nothing;

  select requests.*
  into v_request
  from public.inventory_transaction_requests requests
  where requests.restaurant_id = p_restaurant_id
    and requests.operation = 'process_branch_transfer'
    and requests.idempotency_key = p_idempotency_key
  for update;

  if v_request.request_fingerprint is distinct from p_request_fingerprint then
    raise exception 'INVENTORY_IDEMPOTENCY_FINGERPRINT_MISMATCH' using errcode = '40001';
  end if;
  if v_request.response_payload is not null then
    return jsonb_set(v_request.response_payload, '{idempotentReplay}', 'true'::jsonb, true);
  end if;

  select transfers.*
  into v_transfer
  from public.branch_transfers transfers
  where transfers.id = p_transfer_id
    and transfers.restaurant_id = p_restaurant_id
  for update;

  if not found then
    raise exception 'TRANSFER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.inventory_locations locations
    where locations.id = v_transfer.from_location_id and locations.restaurant_id = p_restaurant_id
  ) or not exists (
    select 1 from public.inventory_locations locations
    where locations.id = v_transfer.to_location_id and locations.restaurant_id = p_restaurant_id
  ) then
    raise exception 'TRANSFER_BRANCH_SCOPE_MISMATCH' using errcode = '42501';
  end if;

  perform transfer_lines.id
  from public.branch_transfer_lines transfer_lines
  where transfer_lines.transfer_id = p_transfer_id
    and transfer_lines.restaurant_id = p_restaurant_id
  order by transfer_lines.created_at, transfer_lines.id
  for update;

  select public.process_branch_transfer(
    p_restaurant_id,
    p_transfer_id,
    p_action,
    p_actor_user_id,
    p_note,
    p_lines
  ) into v_response;

  update public.inventory_movements movements
  set metadata = movements.metadata || jsonb_build_object(
    'inventoryRequestId', v_request.id,
    'idempotencyKey', p_idempotency_key,
    'requestFingerprint', p_request_fingerprint
  )
  where movements.restaurant_id = p_restaurant_id
    and movements.source_type = 'transfer'
    and movements.transfer_id = p_transfer_id
    and movements.metadata ->> 'transferAction' = p_action
    and movements.created_at >= v_request.created_at
    and movements.metadata ->> 'inventoryRequestId' is null;

  select count(*) into v_movement_count
  from public.inventory_movements movements
  where movements.restaurant_id = p_restaurant_id
    and movements.source_type = 'transfer'
    and movements.transfer_id = p_transfer_id
    and movements.metadata ->> 'transferAction' = p_action
    and movements.metadata ->> 'inventoryRequestId' = v_request.id::text;

  if p_action in ('dispatch', 'receive')
    and v_movement_count <> coalesce((v_response ->> 'movementCount')::integer, -1)
  then
    raise exception 'TRANSFER_LEDGER_MISMATCH' using errcode = '40001';
  end if;

  v_response := v_response || jsonb_build_object('idempotentReplay', false);

  insert into public.audit_logs (
    restaurant_id, actor_user_id, action, entity_type, entity_id, after_data, metadata
  )
  values (
    p_restaurant_id,
    p_actor_user_id,
    'inventory.transfer.' || p_action || '_atomic',
    'branch_transfer',
    p_transfer_id::text,
    v_response,
    jsonb_build_object(
      'inventoryRequestId', v_request.id,
      'idempotencyKey', p_idempotency_key,
      'requestFingerprint', p_request_fingerprint
    )
  );

  update public.inventory_transaction_requests requests
  set response_payload = v_response, completed_at = now()
  where requests.id = v_request.id;

  return v_response;
end;
$$;

revoke all on function public.receive_purchase_order_atomic(uuid, uuid, text, text, uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.receive_purchase_order_atomic(uuid, uuid, text, text, uuid, timestamptz, jsonb) to service_role;

revoke all on function public.apply_inventory_count_atomic(uuid, text, text, text, uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.apply_inventory_count_atomic(uuid, text, text, text, uuid, text, uuid, jsonb) to service_role;

revoke all on function public.create_branch_transfer_atomic(uuid, text, text, uuid, uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_branch_transfer_atomic(uuid, text, text, uuid, uuid, text, uuid, jsonb) to service_role;

revoke all on function public.process_branch_transfer_atomic(uuid, uuid, text, text, text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.process_branch_transfer_atomic(uuid, uuid, text, text, text, uuid, text, jsonb) to service_role;
