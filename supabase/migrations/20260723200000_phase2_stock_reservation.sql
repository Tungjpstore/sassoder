-- Phase 2: prepaid order stock reservation.
--
-- Reservations hold stock without changing physical on-hand quantities. All
-- mutations lock the same tenant/branch/location/ingredient/batch resources,
-- allocate FEFO, and are safe to retry after a client timeout.

create table if not exists public.order_stock_reservations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null,
  branch_id uuid,
  location_id uuid,
  ingredient_id uuid not null,
  batch_id uuid,
  quantity numeric(14, 3) not null,
  status text not null default 'reserved',
  operation text not null default 'reserve',
  idempotency_key text not null,
  actor_user_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  released_at timestamptz,
  consumed_at timestamptz,
  constraint order_stock_reservations_quantity_positive check (quantity > 0),
  constraint order_stock_reservations_status_check check (status in ('reserved', 'consumed', 'released')),
  constraint order_stock_reservations_operation_check check (operation in ('reserve', 'consume', 'release')),
  constraint order_stock_reservations_idempotency_key_check check (length(trim(idempotency_key)) between 8 and 200),
  constraint order_stock_reservations_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint order_stock_reservations_order_scope_fkey foreign key (restaurant_id, order_id)
    references public.orders (restaurant_id, id) on delete cascade,
  constraint order_stock_reservations_branch_scope_fkey foreign key (restaurant_id, branch_id)
    references public.store_branches (restaurant_id, id) on delete restrict,
  constraint order_stock_reservations_location_scope_fkey foreign key (restaurant_id, location_id)
    references public.inventory_locations (restaurant_id, id) on delete restrict,
  constraint order_stock_reservations_ingredient_scope_fkey foreign key (restaurant_id, ingredient_id)
    references public.ingredients (restaurant_id, id) on delete restrict,
  constraint order_stock_reservations_batch_scope_fkey foreign key (restaurant_id, batch_id, ingredient_id)
    references public.inventory_batches (restaurant_id, id, ingredient_id) on delete restrict,
  constraint order_stock_reservations_actor_tenant_fkey foreign key (restaurant_id, actor_user_id)
    references public.users (restaurant_id, id) on delete set null (actor_user_id)
);

create index if not exists order_stock_reservations_order_idx
  on public.order_stock_reservations (restaurant_id, order_id, status, created_at);

create index if not exists order_stock_reservations_stock_idx
  on public.order_stock_reservations (restaurant_id, branch_id, location_id, ingredient_id, batch_id, status);

create unique index if not exists order_stock_reservations_active_stock_key
  on public.order_stock_reservations (
    restaurant_id,
    order_id,
    ingredient_id,
    coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(batch_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status = 'reserved';

create index if not exists order_stock_reservations_idempotency_key
  on public.order_stock_reservations (restaurant_id, order_id, operation, idempotency_key);

create table if not exists public.order_stock_reservation_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null,
  operation text not null,
  idempotency_key text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_stock_reservation_requests_operation_check check (operation in ('reserve', 'consume', 'release')),
  constraint order_stock_reservation_requests_key_check check (length(trim(idempotency_key)) between 8 and 200),
  constraint order_stock_reservation_requests_result_object check (jsonb_typeof(result) = 'object'),
  constraint order_stock_reservation_requests_order_scope_fkey foreign key (restaurant_id, order_id)
    references public.orders (restaurant_id, id) on delete cascade,
  constraint order_stock_reservation_requests_unique unique (restaurant_id, order_id, operation, idempotency_key)
);

create index if not exists order_stock_reservation_requests_order_idx
  on public.order_stock_reservation_requests (restaurant_id, order_id, operation, created_at);

alter table public.order_stock_reservations enable row level security;
alter table public.order_stock_reservation_requests enable row level security;

drop policy if exists "authenticated can read own stock reservations" on public.order_stock_reservations;
create policy "authenticated can read own stock reservations"
on public.order_stock_reservations
for select
to authenticated
using (restaurant_id = app_private.current_inventory_restaurant_id());

drop policy if exists "authenticated can read own stock reservation requests" on public.order_stock_reservation_requests;
create policy "authenticated can read own stock reservation requests"
on public.order_stock_reservation_requests
for select
to authenticated
using (restaurant_id = app_private.current_inventory_restaurant_id());

drop trigger if exists order_stock_reservations_set_updated_at on public.order_stock_reservations;
create trigger order_stock_reservations_set_updated_at
before update on public.order_stock_reservations
for each row execute function public.set_updated_at();

drop trigger if exists order_stock_reservation_requests_set_updated_at on public.order_stock_reservation_requests;
create trigger order_stock_reservation_requests_set_updated_at
before update on public.order_stock_reservation_requests
for each row execute function public.set_updated_at();

-- Movement type is intentionally distinct from normal sale deduction. A
-- consumed reservation may span multiple batches, while the legacy sale index
-- only permits one row per ingredient/order pair.
alter table public.inventory_movements
  drop constraint if exists inventory_movements_type_check,
  add constraint inventory_movements_type_check check (
    movement_type in (
      'receive', 'deduct_sale', 'adjust_increase', 'adjust_decrease', 'waste',
      'rollback', 'transfer_in', 'transfer_out', 'expired', 'internal_use',
      'supplier_return', 'reserve', 'release_reserve', 'consume_reserve'
    )
  );

create or replace function public.reserve_order_stock(
  target_restaurant_id uuid,
  target_order_id uuid,
  target_idempotency_key text,
  target_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  order_record record;
  demand_record record;
  stock_record record;
  reservation_record public.order_stock_reservations;
  requested_quantity numeric(14, 3);
  remaining_quantity numeric(14, 3);
  allocation_quantity numeric(14, 3);
  available_quantity numeric(14, 3);
  recipe_item_count integer;
  covered_item_count integer;
  existing_count integer;
  existing_request_result jsonb;
  reservation_result jsonb;
begin
  if length(trim(coalesce(target_idempotency_key, ''))) not between 8 and 200 then
    raise exception 'INVALID_STOCK_RESERVATION_IDEMPOTENCY_KEY';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and target_restaurant_id is distinct from app_private.current_inventory_restaurant_id() then
    raise exception 'STOCK_RESERVATION_TENANT_SCOPE_MISMATCH';
  end if;

  select request.result
  into existing_request_result
  from public.order_stock_reservation_requests request
  where request.restaurant_id = target_restaurant_id
    and request.order_id = target_order_id
    and request.operation = 'reserve'
    and request.idempotency_key = target_idempotency_key;

  if found then
    return existing_request_result;
  end if;

  select o.id, o.restaurant_id, o.branch_id, o.status::text as status,
         o.payment_method::text as payment_method, o.payment_status::text as payment_status
  into order_record
  from public.orders o
  where o.id = target_order_id
    and o.restaurant_id = target_restaurant_id
  for update;

  if not found then
    raise exception 'STOCK_RESERVATION_ORDER_NOT_FOUND';
  end if;

  if order_record.status in ('cancelled') or order_record.payment_status in ('refunded', 'failed') then
    raise exception 'STOCK_RESERVATION_ORDER_NOT_ELIGIBLE';
  end if;

  if order_record.payment_method is distinct from 'QR' then
    raise exception 'STOCK_RESERVATION_PREPAID_ONLY';
  end if;
  if order_record.payment_status is distinct from 'waiting_payment' then
    raise exception 'STOCK_RESERVATION_PAYMENT_STATE_NOT_ELIGIBLE';
  end if;

  select count(distinct oi.menu_item_id)::integer,
         count(distinct case when recipe.menu_item_id is not null then oi.menu_item_id end)::integer
  into recipe_item_count, covered_item_count
  from public.order_items oi
  left join public.menu_item_recipes recipe
    on recipe.restaurant_id = target_restaurant_id
   and recipe.menu_item_id = oi.menu_item_id
  where oi.order_id = target_order_id;

  if recipe_item_count = 0 or covered_item_count <> recipe_item_count then
    raise exception 'STOCK_RESERVATION_RECIPE_MISSING';
  end if;

  select count(*)::integer
  into existing_count
  from public.order_stock_reservations
  where restaurant_id = target_restaurant_id
    and order_id = target_order_id
    and status = 'reserved';

  if existing_count > 0 then
    reservation_result := jsonb_build_object(
      'orderId', target_order_id,
      'status', 'reserved',
      'idempotencyKey', target_idempotency_key,
      'idempotent', true,
      'reservations', coalesce((
        select jsonb_agg(to_jsonb(r) order by r.ingredient_id, r.batch_id, r.id)
        from public.order_stock_reservations r
        where r.restaurant_id = target_restaurant_id
          and r.order_id = target_order_id
          and r.status = 'reserved'
      ), '[]'::jsonb)
    );
    insert into public.order_stock_reservation_requests (
      restaurant_id, order_id, operation, idempotency_key, result
    )
    values (target_restaurant_id, target_order_id, 'reserve', target_idempotency_key, reservation_result)
    on conflict (restaurant_id, order_id, operation, idempotency_key)
    do update set updated_at = public.order_stock_reservation_requests.updated_at
    returning result into reservation_result;
    return reservation_result;
  end if;

  -- Lock every candidate balance in deterministic tuple order before FEFO
  -- allocation, preventing two orders from reserving the same balance.
  perform 1
  from public.stock_balances sb
  where sb.restaurant_id = target_restaurant_id
    and sb.branch_id is not distinct from order_record.branch_id
    and sb.on_hand_quantity > sb.reserved_quantity
    and sb.ingredient_id in (
      select recipe.ingredient_id
      from public.order_items oi
      join public.menu_item_recipes recipe
        on recipe.restaurant_id = target_restaurant_id
       and recipe.menu_item_id = oi.menu_item_id
      where oi.order_id = target_order_id
    )
  order by sb.ingredient_id, sb.branch_id nulls first, sb.location_id nulls first, sb.batch_id nulls first, sb.id
  for update;

  for demand_record in
    select recipe.ingredient_id,
           round(sum(oi.quantity * recipe.quantity_per_item * (1 + recipe.waste_percent / 100.0))::numeric, 3) as quantity
    from public.order_items oi
    join public.menu_item_recipes recipe
      on recipe.restaurant_id = target_restaurant_id
     and recipe.menu_item_id = oi.menu_item_id
    where oi.order_id = target_order_id
    group by recipe.ingredient_id
    order by recipe.ingredient_id
  loop
    requested_quantity := round(demand_record.quantity::numeric, 3);
    remaining_quantity := requested_quantity;

    for stock_record in
      select sb.id, sb.ingredient_id, sb.branch_id, sb.location_id, sb.batch_id,
             sb.on_hand_quantity, sb.reserved_quantity,
             ib.expiration_date, ib.received_at, ib.created_at
      from public.stock_balances sb
      left join public.inventory_batches ib
        on ib.id = sb.batch_id
       and ib.restaurant_id = sb.restaurant_id
       and ib.ingredient_id = sb.ingredient_id
      where sb.restaurant_id = target_restaurant_id
        and sb.ingredient_id = demand_record.ingredient_id
        and sb.branch_id is not distinct from order_record.branch_id
        and sb.on_hand_quantity > sb.reserved_quantity
        and (ib.id is null or ib.status = 'active')
        and (ib.expiration_date is null or ib.expiration_date >= current_date)
      order by ib.expiration_date nulls last, ib.received_at nulls last, ib.created_at nulls last,
               sb.location_id nulls first, sb.batch_id nulls first, sb.id
    loop
      exit when remaining_quantity <= 0;
      available_quantity := round((stock_record.on_hand_quantity - stock_record.reserved_quantity)::numeric, 3);
      allocation_quantity := least(remaining_quantity, available_quantity);
      if allocation_quantity <= 0 then
        continue;
      end if;

      update public.stock_balances
      set reserved_quantity = reserved_quantity + allocation_quantity,
          updated_at = now()
      where id = stock_record.id
        and restaurant_id = target_restaurant_id
        and on_hand_quantity >= reserved_quantity + allocation_quantity;

      if not found then
        raise exception 'STOCK_RESERVATION_CONCURRENCY_CONFLICT';
      end if;

      insert into public.order_stock_reservations (
        restaurant_id, order_id, branch_id, location_id, ingredient_id, batch_id,
        quantity, status, operation, idempotency_key, actor_user_id, metadata
      )
      values (
        target_restaurant_id, target_order_id, stock_record.branch_id, stock_record.location_id,
        stock_record.ingredient_id, stock_record.batch_id, allocation_quantity, 'reserved', 'reserve',
        target_idempotency_key, target_actor_user_id,
        jsonb_build_object('source', 'prepaid_order', 'allocationMode', 'fefo')
      )
      returning * into reservation_record;

      insert into public.inventory_movements (
        restaurant_id, ingredient_id, branch_id, location_id, batch_id, movement_type,
        quantity_delta, source_type, source_id, reason, actor_user_id, metadata
      )
      values (
        target_restaurant_id, stock_record.ingredient_id, stock_record.branch_id, stock_record.location_id,
        stock_record.batch_id, 'reserve', allocation_quantity, 'order', target_order_id,
        'Giu cho ton kho cho don prepaid', target_actor_user_id,
        jsonb_build_object('reservationId', reservation_record.id, 'idempotencyKey', target_idempotency_key)
      );

      remaining_quantity := round((remaining_quantity - allocation_quantity)::numeric, 3);
    end loop;

    if remaining_quantity > 0 then
      raise exception 'STOCK_RESERVATION_SHORTAGE:%:%', demand_record.ingredient_id, remaining_quantity;
    end if;
  end loop;

  select jsonb_build_object(
    'orderId', target_order_id,
    'status', 'reserved',
    'idempotencyKey', target_idempotency_key,
    'idempotent', false,
    'reservations', coalesce(jsonb_agg(to_jsonb(r) order by r.ingredient_id, r.batch_id, r.id), '[]'::jsonb)
  )
  into reservation_result
  from public.order_stock_reservations r
  where r.restaurant_id = target_restaurant_id
    and r.order_id = target_order_id
    and r.status = 'reserved';

  insert into public.order_stock_reservation_requests (
    restaurant_id, order_id, operation, idempotency_key, result
  )
  values (target_restaurant_id, target_order_id, 'reserve', target_idempotency_key, reservation_result)
  on conflict (restaurant_id, order_id, operation, idempotency_key)
  do update set updated_at = public.order_stock_reservation_requests.updated_at
  returning result into reservation_result;

  return reservation_result;
end;
$$;

create or replace function public.consume_order_stock(
  target_restaurant_id uuid,
  target_order_id uuid,
  target_idempotency_key text,
  target_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  order_record record;
  reservation_record record;
  consumed_count integer := 0;
  existing_request_result jsonb;
  consume_result jsonb;
begin
  if length(trim(coalesce(target_idempotency_key, ''))) not between 8 and 200 then
    raise exception 'INVALID_STOCK_CONSUME_IDEMPOTENCY_KEY';
  end if;
  if coalesce(auth.role(), '') <> 'service_role'
    and target_restaurant_id is distinct from app_private.current_inventory_restaurant_id() then
    raise exception 'STOCK_RESERVATION_TENANT_SCOPE_MISMATCH';
  end if;

  select request.result
  into existing_request_result
  from public.order_stock_reservation_requests request
  where request.restaurant_id = target_restaurant_id
    and request.order_id = target_order_id
    and request.operation = 'consume'
    and request.idempotency_key = target_idempotency_key;
  if found then return existing_request_result; end if;

  select o.id, o.restaurant_id, o.status::text as status, o.payment_status::text as payment_status
  into order_record
  from public.orders o
  where o.id = target_order_id and o.restaurant_id = target_restaurant_id
  for update;
  if not found then raise exception 'STOCK_RESERVATION_ORDER_NOT_FOUND'; end if;
  if order_record.status = 'cancelled' or order_record.payment_status in ('refunded', 'failed') then
    raise exception 'STOCK_CONSUME_ORDER_NOT_ELIGIBLE';
  end if;
  if order_record.payment_status is distinct from 'paid' then
    raise exception 'STOCK_CONSUME_PAYMENT_NOT_CONFIRMED';
  end if;

  for reservation_record in
    select r.*
    from public.order_stock_reservations r
    where r.restaurant_id = target_restaurant_id
      and r.order_id = target_order_id
      and r.status = 'reserved'
    order by r.ingredient_id, r.branch_id nulls first, r.location_id nulls first, r.batch_id nulls first, r.id
    for update
  loop
    update public.stock_balances
    set on_hand_quantity = on_hand_quantity - reservation_record.quantity,
        reserved_quantity = reserved_quantity - reservation_record.quantity,
        updated_at = now()
    where restaurant_id = target_restaurant_id
      and ingredient_id = reservation_record.ingredient_id
      and branch_id is not distinct from reservation_record.branch_id
      and location_id is not distinct from reservation_record.location_id
      and batch_id is not distinct from reservation_record.batch_id
      and on_hand_quantity >= reservation_record.quantity
      and reserved_quantity >= reservation_record.quantity;
    if not found then raise exception 'STOCK_CONSUME_BALANCE_CONFLICT'; end if;

    update public.ingredients
    set on_hand_quantity = on_hand_quantity - reservation_record.quantity,
        updated_at = now()
    where id = reservation_record.ingredient_id
      and restaurant_id = target_restaurant_id
      and on_hand_quantity >= reservation_record.quantity;
    if not found then raise exception 'STOCK_CONSUME_INGREDIENT_CONFLICT'; end if;

    if reservation_record.batch_id is not null then
      update public.inventory_batches
      set remaining_quantity = remaining_quantity - reservation_record.quantity,
          status = case when remaining_quantity - reservation_record.quantity <= 0 then 'depleted' else status end,
          updated_at = now()
      where id = reservation_record.batch_id
        and restaurant_id = target_restaurant_id
        and ingredient_id = reservation_record.ingredient_id
        and remaining_quantity >= reservation_record.quantity;
      if not found then raise exception 'STOCK_CONSUME_BATCH_CONFLICT'; end if;
    end if;

    update public.order_stock_reservations
    set status = 'consumed', consumed_at = now(), updated_at = now(),
        actor_user_id = target_actor_user_id
    where id = reservation_record.id;

    insert into public.inventory_movements (
      restaurant_id, ingredient_id, branch_id, location_id, batch_id, movement_type,
      quantity_delta, source_type, source_id, reason, actor_user_id, metadata
    )
    values (
      target_restaurant_id, reservation_record.ingredient_id, reservation_record.branch_id,
      reservation_record.location_id, reservation_record.batch_id, 'consume_reserve',
      -reservation_record.quantity, 'order', target_order_id, 'Tieu thu hang da giu cho',
      target_actor_user_id,
      jsonb_build_object('reservationId', reservation_record.id, 'idempotencyKey', target_idempotency_key)
    );
    consumed_count := consumed_count + 1;
  end loop;

  consume_result := jsonb_build_object(
    'orderId', target_order_id,
    'status', case when consumed_count > 0 then 'consumed' else 'already_consumed' end,
    'idempotencyKey', target_idempotency_key,
    'idempotent', consumed_count = 0,
    'consumedCount', consumed_count,
    'reservations', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.ingredient_id, r.batch_id, r.id)
      from public.order_stock_reservations r
      where r.restaurant_id = target_restaurant_id and r.order_id = target_order_id
    ), '[]'::jsonb)
  );

  insert into public.order_stock_reservation_requests (
    restaurant_id, order_id, operation, idempotency_key, result
  )
  values (target_restaurant_id, target_order_id, 'consume', target_idempotency_key, consume_result)
  on conflict (restaurant_id, order_id, operation, idempotency_key)
  do update set updated_at = public.order_stock_reservation_requests.updated_at
  returning result into consume_result;

  return consume_result;
end;
$$;

create or replace function public.release_order_stock(
  target_restaurant_id uuid,
  target_order_id uuid,
  target_idempotency_key text,
  target_actor_user_id uuid default null,
  target_reason text default 'order_cancelled'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  order_record record;
  reservation_record record;
  released_count integer := 0;
  existing_request_result jsonb;
  release_result jsonb;
begin
  if length(trim(coalesce(target_idempotency_key, ''))) not between 8 and 200 then
    raise exception 'INVALID_STOCK_RELEASE_IDEMPOTENCY_KEY';
  end if;
  if coalesce(auth.role(), '') <> 'service_role'
    and target_restaurant_id is distinct from app_private.current_inventory_restaurant_id() then
    raise exception 'STOCK_RESERVATION_TENANT_SCOPE_MISMATCH';
  end if;

  select request.result
  into existing_request_result
  from public.order_stock_reservation_requests request
  where request.restaurant_id = target_restaurant_id
    and request.order_id = target_order_id
    and request.operation = 'release'
    and request.idempotency_key = target_idempotency_key;
  if found then return existing_request_result; end if;

  select o.id, o.restaurant_id, o.status::text as status
  into order_record
  from public.orders o
  where o.id = target_order_id and o.restaurant_id = target_restaurant_id
  for update;
  if not found then raise exception 'STOCK_RESERVATION_ORDER_NOT_FOUND'; end if;

  for reservation_record in
    select r.*
    from public.order_stock_reservations r
    where r.restaurant_id = target_restaurant_id
      and r.order_id = target_order_id
      and r.status = 'reserved'
    order by r.ingredient_id, r.branch_id nulls first, r.location_id nulls first, r.batch_id nulls first, r.id
    for update
  loop
    update public.stock_balances
    set reserved_quantity = reserved_quantity - reservation_record.quantity,
        updated_at = now()
    where restaurant_id = target_restaurant_id
      and ingredient_id = reservation_record.ingredient_id
      and branch_id is not distinct from reservation_record.branch_id
      and location_id is not distinct from reservation_record.location_id
      and batch_id is not distinct from reservation_record.batch_id
      and reserved_quantity >= reservation_record.quantity;
    if not found then raise exception 'STOCK_RELEASE_BALANCE_CONFLICT'; end if;

    update public.order_stock_reservations
    set status = 'released', released_at = now(), updated_at = now(),
        actor_user_id = target_actor_user_id,
        metadata = metadata || jsonb_build_object('releaseReason', target_reason)
    where id = reservation_record.id;

    insert into public.inventory_movements (
      restaurant_id, ingredient_id, branch_id, location_id, batch_id, movement_type,
      quantity_delta, source_type, source_id, reason, actor_user_id, metadata
    )
    values (
      target_restaurant_id, reservation_record.ingredient_id, reservation_record.branch_id,
      reservation_record.location_id, reservation_record.batch_id, 'release_reserve',
      reservation_record.quantity, 'order', target_order_id, coalesce(target_reason, 'order_cancelled'),
      target_actor_user_id,
      jsonb_build_object('reservationId', reservation_record.id, 'idempotencyKey', target_idempotency_key)
    );
    released_count := released_count + 1;
  end loop;

  release_result := jsonb_build_object(
    'orderId', target_order_id,
    'status', case when released_count > 0 then 'released' else 'already_released' end,
    'idempotencyKey', target_idempotency_key,
    'idempotent', released_count = 0,
    'releasedCount', released_count,
    'reservations', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.ingredient_id, r.batch_id, r.id)
      from public.order_stock_reservations r
      where r.restaurant_id = target_restaurant_id and r.order_id = target_order_id
    ), '[]'::jsonb)
  );

  insert into public.order_stock_reservation_requests (
    restaurant_id, order_id, operation, idempotency_key, result
  )
  values (target_restaurant_id, target_order_id, 'release', target_idempotency_key, release_result)
  on conflict (restaurant_id, order_id, operation, idempotency_key)
  do update set updated_at = public.order_stock_reservation_requests.updated_at
  returning result into release_result;

  return release_result;
end;
$$;

revoke all on function public.reserve_order_stock(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.consume_order_stock(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.release_order_stock(uuid, uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_order_stock(uuid, uuid, text, uuid) to service_role;
grant execute on function public.consume_order_stock(uuid, uuid, text, uuid) to service_role;
grant execute on function public.release_order_stock(uuid, uuid, text, uuid, text) to service_role;

-- Wire the reservation lifecycle into the order state machine. The insert
-- trigger is deferred so all order items exist before FEFO allocation runs;
-- payment/cancellation transitions consume or release in the same transaction.
create or replace function public.sync_order_stock_reservation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT'
    and new.payment_method = 'QR'
    and new.payment_status = 'waiting_payment'
  then
    perform public.reserve_order_stock(
      new.restaurant_id,
      new.id,
      'reserve:' || md5(new.restaurant_id::text || ':' || new.id::text),
      null
    );
  elsif tg_op = 'UPDATE'
    and new.payment_method = 'QR'
    and old.payment_status is distinct from 'waiting_payment'
    and new.payment_status = 'waiting_payment'
  then
    -- Dine-in bills enter the prepaid state during checkout, after the order
    -- row already exists; reserve stock at that transition as well.
    perform public.reserve_order_stock(
      new.restaurant_id,
      new.id,
      'reserve:' || md5(new.restaurant_id::text || ':' || new.id::text),
      null
    );
  elsif tg_op = 'UPDATE'
    and new.payment_method = 'QR'
    and old.payment_status is distinct from 'paid'
    and new.payment_status = 'paid'
    and exists (
      select 1
      from public.order_stock_reservations reservations
      where reservations.restaurant_id = new.restaurant_id
        and reservations.order_id = new.id
        and reservations.status = 'reserved'
    )
  then
    perform public.consume_order_stock(
      new.restaurant_id,
      new.id,
      'consume:' || md5(new.restaurant_id::text || ':' || new.id::text || ':paid'),
      null
    );
  elsif tg_op = 'UPDATE'
    and new.payment_method = 'QR'
    and old.status is distinct from 'cancelled'
    and new.status = 'cancelled'
  then
    perform public.release_order_stock(
      new.restaurant_id,
      new.id,
      'release:' || md5(new.restaurant_id::text || ':' || new.id::text || ':cancelled'),
      null,
      'order_cancelled'
    );
  end if;

  return new;
end;
$$;

revoke all on function public.sync_order_stock_reservation() from public, anon, authenticated;

drop trigger if exists orders_sync_stock_reservation_on_insert on public.orders;
create constraint trigger orders_sync_stock_reservation_on_insert
after insert on public.orders
deferrable initially deferred
for each row execute function public.sync_order_stock_reservation();

drop trigger if exists orders_sync_stock_reservation_on_update on public.orders;
create trigger orders_sync_stock_reservation_on_update
after update of payment_status, status on public.orders
for each row execute function public.sync_order_stock_reservation();
