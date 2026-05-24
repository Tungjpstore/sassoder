-- Inventory workflows v3.
-- Adds atomic inventory count and direct transfer operations for F&B warehouse work.

alter table public.inventory_counts
  add column if not exists branch_id uuid references public.store_branches(id) on delete set null,
  add column if not exists location_id uuid references public.inventory_locations(id) on delete set null,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.inventory_counts
  drop constraint if exists inventory_counts_metadata_object,
  add constraint inventory_counts_metadata_object check (jsonb_typeof(metadata) = 'object');

alter table public.inventory_count_lines
  add column if not exists branch_id uuid references public.store_branches(id) on delete set null,
  add column if not exists location_id uuid references public.inventory_locations(id) on delete set null,
  add column if not exists batch_id uuid references public.inventory_batches(id) on delete set null,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.inventory_count_lines
  drop constraint if exists inventory_count_lines_metadata_object,
  add constraint inventory_count_lines_metadata_object check (jsonb_typeof(metadata) = 'object');

create index if not exists inventory_counts_restaurant_location_idx
  on public.inventory_counts (restaurant_id, location_id, status, created_at desc)
  where location_id is not null;

create index if not exists inventory_count_lines_location_idx
  on public.inventory_count_lines (restaurant_id, location_id, ingredient_id)
  where location_id is not null;

drop function if exists public.apply_inventory_count(uuid, text, uuid, text, uuid, jsonb);

create or replace function public.apply_inventory_count(
  target_restaurant_id uuid,
  target_title text default 'Kiem ke kho',
  target_location_id uuid default null,
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
  created_count public.inventory_counts;
  selected_location_id uuid;
  selected_branch_id uuid;
  selected_location_is_primary boolean := false;
  line_item jsonb;
  line_ingredient_id uuid;
  line_location_id uuid;
  line_branch_id uuid;
  line_location_is_primary boolean;
  line_batch_id uuid;
  ingredient_record record;
  counted_quantity numeric(14, 3);
  expected_quantity numeric(14, 3);
  variance_quantity numeric(14, 3);
  inserted_line_count integer := 0;
  adjusted_line_count integer := 0;
  total_abs_variance numeric(14, 3) := 0;
  total_variance_value integer := 0;
begin
  if target_restaurant_id is distinct from app_private.current_restaurant_id() then
    raise exception 'Inventory count restaurant scope mismatch';
  end if;

  if target_lines is null
    or jsonb_typeof(target_lines) <> 'array'
    or jsonb_array_length(target_lines) = 0
    or jsonb_array_length(target_lines) > 300
  then
    raise exception 'Inventory count requires between 1 and 300 lines';
  end if;

  if target_location_id is null then
    select id, branch_id, is_primary
    into selected_location_id, selected_branch_id, selected_location_is_primary
    from public.inventory_locations
    where restaurant_id = target_restaurant_id
      and is_primary = true
      and is_active = true
    order by branch_id nulls last, sort_order, created_at
    limit 1;
  else
    select id, branch_id, is_primary
    into selected_location_id, selected_branch_id, selected_location_is_primary
    from public.inventory_locations
    where id = target_location_id
      and restaurant_id = target_restaurant_id
      and is_active = true;

    if selected_location_id is null then
      raise exception 'Inventory count location is missing';
    end if;
  end if;

  insert into public.inventory_counts (
    restaurant_id,
    branch_id,
    location_id,
    status,
    title,
    started_at,
    submitted_at,
    applied_at,
    actor_user_id,
    note,
    metadata
  )
  values (
    target_restaurant_id,
    selected_branch_id,
    selected_location_id,
    'applied',
    coalesce(left(nullif(trim(coalesce(target_title, '')), ''), 160), 'Kiem ke kho'),
    now(),
    now(),
    now(),
    target_actor_user_id,
    nullif(trim(coalesce(target_note, '')), ''),
    jsonb_build_object('createdFrom', 'inventory_workspace', 'mode', 'quick_apply')
  )
  returning * into created_count;

  for line_item in
    select value
    from jsonb_array_elements(target_lines)
  loop
    line_ingredient_id := nullif(line_item ->> 'ingredientId', '')::uuid;
    line_location_id := coalesce(nullif(line_item ->> 'locationId', '')::uuid, selected_location_id);
    line_branch_id := selected_branch_id;
    line_location_is_primary := selected_location_is_primary;
    line_batch_id := nullif(line_item ->> 'batchId', '')::uuid;
    counted_quantity := round((line_item ->> 'countedQuantity')::numeric, 3);

    if line_ingredient_id is null then
      raise exception 'Inventory count ingredient is required';
    end if;

    if counted_quantity < 0 then
      raise exception 'Inventory count quantity cannot be negative';
    end if;

    if line_location_id is not null then
      select branch_id, is_primary
      into line_branch_id, line_location_is_primary
      from public.inventory_locations
      where id = line_location_id
        and restaurant_id = target_restaurant_id
        and is_active = true;

      if not found then
        raise exception 'Inventory count line location is missing';
      end if;
    end if;

    select id, unit, base_unit, on_hand_quantity, reference_unit_cost
    into ingredient_record
    from public.ingredients
    where id = line_ingredient_id
      and restaurant_id = target_restaurant_id
      and is_active = true
    for update;

    if ingredient_record.id is null then
      raise exception 'Inventory count ingredient is missing';
    end if;

    if line_batch_id is not null and not exists (
      select 1
      from public.inventory_batches
      where id = line_batch_id
        and restaurant_id = target_restaurant_id
        and ingredient_id = line_ingredient_id
    ) then
      raise exception 'Inventory count batch is missing';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended(
        target_restaurant_id::text || ':' ||
        line_ingredient_id::text || ':' ||
        coalesce(line_branch_id::text, 'global') || ':' ||
        coalesce(line_location_id::text, 'global') || ':' ||
        coalesce(line_batch_id::text, 'no-batch'),
        0
      )
    );

    expected_quantity := null;

    if line_location_id is not null or line_batch_id is not null then
      select on_hand_quantity
      into expected_quantity
      from public.stock_balances
      where restaurant_id = target_restaurant_id
        and ingredient_id = line_ingredient_id
        and coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid) =
          coalesce(line_branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
        and coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid) =
          coalesce(line_location_id, '00000000-0000-0000-0000-000000000000'::uuid)
        and (
          (line_batch_id is null and batch_id is null)
          or batch_id = line_batch_id
        )
      for update;
    end if;

    if expected_quantity is null then
      if line_location_id is null or (line_location_is_primary and line_batch_id is null) then
        expected_quantity := coalesce(ingredient_record.on_hand_quantity, 0);
      else
        expected_quantity := 0;
      end if;
    end if;

    if expected_quantity > 0 and line_location_id is not null and line_batch_id is null then
      insert into public.stock_balances (
        restaurant_id,
        branch_id,
        location_id,
        ingredient_id,
        on_hand_quantity,
        metadata
      )
      values (
        target_restaurant_id,
        line_branch_id,
        line_location_id,
        line_ingredient_id,
        expected_quantity,
        jsonb_build_object('createdFrom', 'inventory_count_fallback')
      )
      on conflict do nothing;
    end if;

    variance_quantity := round(counted_quantity - expected_quantity, 3);

    insert into public.inventory_count_lines (
      count_id,
      restaurant_id,
      branch_id,
      location_id,
      batch_id,
      ingredient_id,
      expected_quantity,
      counted_quantity,
      note,
      metadata
    )
    values (
      created_count.id,
      target_restaurant_id,
      line_branch_id,
      line_location_id,
      line_batch_id,
      line_ingredient_id,
      expected_quantity,
      counted_quantity,
      nullif(trim(coalesce(line_item ->> 'note', '')), ''),
      jsonb_build_object('createdFrom', 'inventory_workspace')
    );

    inserted_line_count := inserted_line_count + 1;
    total_abs_variance := total_abs_variance + abs(variance_quantity);
    total_variance_value := total_variance_value + round(abs(variance_quantity) * coalesce(ingredient_record.reference_unit_cost, 0))::integer;

    if abs(variance_quantity) > 0.0005 then
      perform public.apply_inventory_movement(
        target_restaurant_id,
        line_ingredient_id,
        case when variance_quantity > 0 then 'adjust_increase' else 'adjust_decrease' end,
        variance_quantity,
        case when variance_quantity > 0 then coalesce(ingredient_record.reference_unit_cost, 0) else null end,
        'count',
        created_count.id,
        'Kiem ke: ' || created_count.title,
        target_actor_user_id,
        jsonb_build_object(
          'inventoryCountId', created_count.id,
          'expectedQuantity', expected_quantity,
          'countedQuantity', counted_quantity,
          'varianceQuantity', variance_quantity
        ),
        line_branch_id,
        line_location_id,
        line_batch_id,
        null,
        null
      );

      adjusted_line_count := adjusted_line_count + 1;
    end if;
  end loop;

  update public.inventory_counts
  set
    metadata = metadata || jsonb_build_object(
      'lineCount', inserted_line_count,
      'adjustedLineCount', adjusted_line_count,
      'totalAbsVariance', total_abs_variance,
      'totalVarianceValue', total_variance_value
    ),
    updated_at = now()
  where id = created_count.id
    and restaurant_id = target_restaurant_id;

  return jsonb_build_object(
    'countId', created_count.id,
    'title', created_count.title,
    'lineCount', inserted_line_count,
    'adjustedLineCount', adjusted_line_count,
    'totalAbsVariance', total_abs_variance,
    'totalVarianceValue', total_variance_value
  );
end;
$$;

revoke all on function public.apply_inventory_count(uuid, text, uuid, text, uuid, jsonb) from public;
grant execute on function public.apply_inventory_count(uuid, text, uuid, text, uuid, jsonb) to authenticated, service_role;

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
    approved_by_user_id,
    dispatched_at,
    received_at,
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
    'received',
    target_actor_user_id,
    target_actor_user_id,
    now(),
    now(),
    nullif(trim(coalesce(target_note, '')), ''),
    jsonb_build_object('createdFrom', 'inventory_workspace', 'mode', 'direct_transfer')
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
    ) then
      raise exception 'Transfer batch is missing';
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
      dispatched_quantity,
      received_quantity,
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
      stock_quantity,
      stock_quantity,
      nullif(trim(coalesce(line_item ->> 'note', '')), ''),
      jsonb_build_object(
        'requestedQuantity', requested_quantity,
        'requestedUnit', source_unit,
        'stockUnit', stock_unit,
        'conversionFactor', conversion_factor
      )
    );

    perform public.apply_inventory_movement(
      target_restaurant_id,
      line_ingredient_id,
      'transfer_out',
      -abs(stock_quantity),
      null,
      'transfer',
      transfer_record.id,
      'Dieu chuyen ' || transfer_record.transfer_number || ' tu ' || from_location_record.name,
      target_actor_user_id,
      jsonb_build_object(
        'transferId', transfer_record.id,
        'fromLocationId', target_from_location_id,
        'toLocationId', target_to_location_id
      ),
      from_location_record.branch_id,
      target_from_location_id,
      line_batch_id,
      null,
      transfer_record.id
    );

    perform public.apply_inventory_movement(
      target_restaurant_id,
      line_ingredient_id,
      'transfer_in',
      abs(stock_quantity),
      null,
      'transfer',
      transfer_record.id,
      'Dieu chuyen ' || transfer_record.transfer_number || ' den ' || to_location_record.name,
      target_actor_user_id,
      jsonb_build_object(
        'transferId', transfer_record.id,
        'fromLocationId', target_from_location_id,
        'toLocationId', target_to_location_id
      ),
      to_location_record.branch_id,
      target_to_location_id,
      line_batch_id,
      null,
      transfer_record.id
    );

    inserted_line_count := inserted_line_count + 1;
    total_quantity := total_quantity + stock_quantity;
  end loop;

  update public.branch_transfers
  set
    metadata = metadata || jsonb_build_object(
      'lineCount', inserted_line_count,
      'totalQuantity', total_quantity
    ),
    updated_at = now()
  where id = transfer_record.id
    and restaurant_id = target_restaurant_id;

  return jsonb_build_object(
    'transferId', transfer_record.id,
    'transferNumber', transfer_record.transfer_number,
    'lineCount', inserted_line_count,
    'totalQuantity', total_quantity
  );
end;
$$;

revoke all on function public.create_branch_transfer(uuid, uuid, uuid, text, uuid, jsonb) from public;
grant execute on function public.create_branch_transfer(uuid, uuid, uuid, text, uuid, jsonb) to authenticated, service_role;

do $$
declare
  realtime_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach realtime_table in array array[
      'inventory_counts',
      'inventory_count_lines',
      'branch_transfers',
      'branch_transfer_lines',
      'stock_balances',
      'inventory_movements',
      'inventory_alerts'
    ]
    loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = realtime_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', realtime_table);
      end if;
    end loop;
  end if;
end $$;
