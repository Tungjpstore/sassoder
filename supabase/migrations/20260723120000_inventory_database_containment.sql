-- Forward-only inventory database containment. Invalid legacy relationships
-- must be repaired explicitly instead of being rewritten by this migration.

do $inventory_preflight$
declare
  v_violations text;
begin
  with checks as (
    select 'ingredients parent scope' as issue, count(*)::bigint as invalid_count
    from public.ingredients ingredients
    left join public.ingredient_categories categories on categories.id = ingredients.category_id
    left join public.suppliers suppliers on suppliers.id = ingredients.default_supplier_id
    where (ingredients.category_id is not null and (categories.id is null or categories.restaurant_id is distinct from ingredients.restaurant_id))
       or (ingredients.default_supplier_id is not null and (suppliers.id is null or suppliers.restaurant_id is distinct from ingredients.restaurant_id))

    union all

    select 'menu recipe parent scope', count(*)::bigint
    from public.menu_item_recipes recipes
    left join public.menu_items menu_items on menu_items.id = recipes.menu_item_id
    left join public.ingredients ingredients on ingredients.id = recipes.ingredient_id
    where menu_items.id is null
       or menu_items.restaurant_id is distinct from recipes.restaurant_id
       or ingredients.id is null
       or ingredients.restaurant_id is distinct from recipes.restaurant_id

    union all

    select 'inventory location branch scope', count(*)::bigint
    from public.inventory_locations locations
    left join public.store_branches branches on branches.id = locations.branch_id
    where locations.branch_id is not null
      and (branches.id is null or branches.restaurant_id is distinct from locations.restaurant_id)

    union all

    select 'unit conversion ingredient scope', count(*)::bigint
    from public.ingredient_unit_conversions conversions
    left join public.ingredients ingredients on ingredients.id = conversions.ingredient_id
    where ingredients.id is null
       or ingredients.restaurant_id is distinct from conversions.restaurant_id

    union all

    select 'supplier item parent scope', count(*)::bigint
    from public.supplier_items items
    left join public.suppliers suppliers on suppliers.id = items.supplier_id
    left join public.ingredients ingredients on ingredients.id = items.ingredient_id
    where suppliers.id is null
       or suppliers.restaurant_id is distinct from items.restaurant_id
       or ingredients.id is null
       or ingredients.restaurant_id is distinct from items.restaurant_id

    union all

    select 'supplier price history parent scope', count(*)::bigint
    from public.supplier_price_history history
    left join public.suppliers suppliers on suppliers.id = history.supplier_id
    left join public.ingredients ingredients on ingredients.id = history.ingredient_id
    left join public.purchase_orders purchase_orders on purchase_orders.id = history.purchase_order_id
    where suppliers.id is null
       or suppliers.restaurant_id is distinct from history.restaurant_id
       or ingredients.id is null
       or ingredients.restaurant_id is distinct from history.restaurant_id
       or (
         history.purchase_order_id is not null
         and (purchase_orders.id is null or purchase_orders.restaurant_id is distinct from history.restaurant_id)
       )

    union all

    select 'purchase order tenant branch location scope', count(*)::bigint
    from public.purchase_orders purchase_orders
    left join public.store_branches branches on branches.id = purchase_orders.branch_id
    left join public.inventory_locations locations on locations.id = purchase_orders.location_id
    left join public.suppliers suppliers on suppliers.id = purchase_orders.supplier_id
    left join public.users actors on actors.id = purchase_orders.actor_user_id
    where (purchase_orders.branch_id is not null and (branches.id is null or branches.restaurant_id is distinct from purchase_orders.restaurant_id))
       or (purchase_orders.location_id is not null and (locations.id is null or locations.restaurant_id is distinct from purchase_orders.restaurant_id))
       or (purchase_orders.location_id is not null and locations.branch_id is distinct from purchase_orders.branch_id)
       or (purchase_orders.supplier_id is not null and (suppliers.id is null or suppliers.restaurant_id is distinct from purchase_orders.restaurant_id))
       or (purchase_orders.actor_user_id is not null and (actors.id is null or actors.restaurant_id is distinct from purchase_orders.restaurant_id))

    union all

    select 'purchase order line parent scope', count(*)::bigint
    from public.purchase_order_lines lines
    left join public.purchase_orders purchase_orders on purchase_orders.id = lines.purchase_order_id
    left join public.ingredients ingredients on ingredients.id = lines.ingredient_id
    left join public.supplier_items supplier_items on supplier_items.id = lines.supplier_item_id
    where purchase_orders.id is null
       or purchase_orders.restaurant_id is distinct from lines.restaurant_id
       or ingredients.id is null
       or ingredients.restaurant_id is distinct from lines.restaurant_id
       or (
         lines.supplier_item_id is not null
         and (
           supplier_items.id is null
           or supplier_items.restaurant_id is distinct from lines.restaurant_id
           or supplier_items.ingredient_id is distinct from lines.ingredient_id
           or supplier_items.supplier_id is distinct from purchase_orders.supplier_id
         )
       )

    union all

    select 'inventory batch parent scope', count(*)::bigint
    from public.inventory_batches batches
    left join public.ingredients ingredients on ingredients.id = batches.ingredient_id
    left join public.suppliers suppliers on suppliers.id = batches.supplier_id
    left join public.purchase_order_lines lines on lines.id = batches.purchase_order_line_id
    where ingredients.id is null
       or ingredients.restaurant_id is distinct from batches.restaurant_id
       or (batches.supplier_id is not null and (suppliers.id is null or suppliers.restaurant_id is distinct from batches.restaurant_id))
       or (
         batches.purchase_order_line_id is not null
         and (
           lines.id is null
           or lines.restaurant_id is distinct from batches.restaurant_id
           or lines.ingredient_id is distinct from batches.ingredient_id
         )
       )

    union all

    select 'stock balance tenant branch location scope', count(*)::bigint
    from public.stock_balances balances
    left join public.store_branches branches on branches.id = balances.branch_id
    left join public.inventory_locations locations on locations.id = balances.location_id
    left join public.ingredients ingredients on ingredients.id = balances.ingredient_id
    left join public.inventory_batches batches on batches.id = balances.batch_id
    where (balances.branch_id is not null and (branches.id is null or branches.restaurant_id is distinct from balances.restaurant_id))
       or (balances.location_id is not null and (locations.id is null or locations.restaurant_id is distinct from balances.restaurant_id))
       or (balances.location_id is not null and locations.branch_id is distinct from balances.branch_id)
       or ingredients.id is null
       or ingredients.restaurant_id is distinct from balances.restaurant_id
       or (
         balances.batch_id is not null
         and (
           batches.id is null
           or batches.restaurant_id is distinct from balances.restaurant_id
           or batches.ingredient_id is distinct from balances.ingredient_id
         )
       )

    union all

    select 'branch transfer tenant location scope', count(*)::bigint
    from public.branch_transfers transfers
    left join public.store_branches from_branches on from_branches.id = transfers.from_branch_id
    left join public.store_branches to_branches on to_branches.id = transfers.to_branch_id
    left join public.inventory_locations from_locations on from_locations.id = transfers.from_location_id
    left join public.inventory_locations to_locations on to_locations.id = transfers.to_location_id
    left join public.users requested_users on requested_users.id = transfers.requested_by_user_id
    left join public.users approved_users on approved_users.id = transfers.approved_by_user_id
    where (transfers.from_branch_id is not null and (from_branches.id is null or from_branches.restaurant_id is distinct from transfers.restaurant_id))
       or (transfers.to_branch_id is not null and (to_branches.id is null or to_branches.restaurant_id is distinct from transfers.restaurant_id))
       or (transfers.from_location_id is not null and (from_locations.id is null or from_locations.restaurant_id is distinct from transfers.restaurant_id))
       or (transfers.to_location_id is not null and (to_locations.id is null or to_locations.restaurant_id is distinct from transfers.restaurant_id))
       or (transfers.from_location_id is not null and from_locations.branch_id is distinct from transfers.from_branch_id)
       or (transfers.to_location_id is not null and to_locations.branch_id is distinct from transfers.to_branch_id)
       or (transfers.requested_by_user_id is not null and (requested_users.id is null or requested_users.restaurant_id is distinct from transfers.restaurant_id))
       or (transfers.approved_by_user_id is not null and (approved_users.id is null or approved_users.restaurant_id is distinct from transfers.restaurant_id))

    union all

    select 'branch transfer line parent scope', count(*)::bigint
    from public.branch_transfer_lines lines
    left join public.branch_transfers transfers on transfers.id = lines.transfer_id
    left join public.ingredients ingredients on ingredients.id = lines.ingredient_id
    left join public.inventory_batches batches on batches.id = lines.batch_id
    where transfers.id is null
       or transfers.restaurant_id is distinct from lines.restaurant_id
       or ingredients.id is null
       or ingredients.restaurant_id is distinct from lines.restaurant_id
       or (
         lines.batch_id is not null
         and (
           batches.id is null
           or batches.restaurant_id is distinct from lines.restaurant_id
           or batches.ingredient_id is distinct from lines.ingredient_id
         )
       )

    union all

    select 'inventory movement tenant branch location scope', count(*)::bigint
    from public.inventory_movements movements
    left join public.store_branches branches on branches.id = movements.branch_id
    left join public.inventory_locations locations on locations.id = movements.location_id
    left join public.ingredients ingredients on ingredients.id = movements.ingredient_id
    left join public.inventory_batches batches on batches.id = movements.batch_id
    left join public.purchase_orders purchase_orders on purchase_orders.id = movements.purchase_order_id
    left join public.branch_transfers transfers on transfers.id = movements.transfer_id
    left join public.users actors on actors.id = movements.actor_user_id
    where (movements.branch_id is not null and (branches.id is null or branches.restaurant_id is distinct from movements.restaurant_id))
       or (movements.location_id is not null and (locations.id is null or locations.restaurant_id is distinct from movements.restaurant_id))
       or (movements.location_id is not null and locations.branch_id is distinct from movements.branch_id)
       or ingredients.id is null
       or ingredients.restaurant_id is distinct from movements.restaurant_id
       or (
         movements.batch_id is not null
         and (
           batches.id is null
           or batches.restaurant_id is distinct from movements.restaurant_id
           or batches.ingredient_id is distinct from movements.ingredient_id
         )
       )
       or (movements.purchase_order_id is not null and (purchase_orders.id is null or purchase_orders.restaurant_id is distinct from movements.restaurant_id))
       or (movements.transfer_id is not null and (transfers.id is null or transfers.restaurant_id is distinct from movements.restaurant_id))
       or (movements.actor_user_id is not null and (actors.id is null or actors.restaurant_id is distinct from movements.restaurant_id))

    union all

    select 'inventory movement source scope', count(*)::bigint
    from public.inventory_movements movements
    left join public.orders orders on movements.source_type = 'order' and orders.id = movements.source_id
    left join public.inventory_counts counts on movements.source_type = 'count' and counts.id = movements.source_id
    left join public.purchase_orders purchase_orders on movements.source_type = 'purchase_order' and purchase_orders.id = movements.source_id
    left join public.branch_transfers transfers on movements.source_type = 'transfer' and transfers.id = movements.source_id
    left join public.suppliers suppliers on movements.source_type = 'supplier' and suppliers.id = movements.source_id
    where movements.source_id is not null
      and (
        (movements.source_type = 'order' and (orders.id is null or orders.restaurant_id is distinct from movements.restaurant_id))
        or (movements.source_type = 'count' and (counts.id is null or counts.restaurant_id is distinct from movements.restaurant_id))
        or (movements.source_type = 'purchase_order' and (purchase_orders.id is null or purchase_orders.restaurant_id is distinct from movements.restaurant_id))
        or (movements.source_type = 'transfer' and (transfers.id is null or transfers.restaurant_id is distinct from movements.restaurant_id))
        or (movements.source_type = 'supplier' and (suppliers.id is null or suppliers.restaurant_id is distinct from movements.restaurant_id))
      )

    union all

    select 'inventory count tenant branch location scope', count(*)::bigint
    from public.inventory_counts counts
    left join public.store_branches branches on branches.id = counts.branch_id
    left join public.inventory_locations locations on locations.id = counts.location_id
    left join public.users actors on actors.id = counts.actor_user_id
    where (counts.branch_id is not null and (branches.id is null or branches.restaurant_id is distinct from counts.restaurant_id))
       or (counts.location_id is not null and (locations.id is null or locations.restaurant_id is distinct from counts.restaurant_id))
       or (counts.location_id is not null and locations.branch_id is distinct from counts.branch_id)
       or (counts.actor_user_id is not null and (actors.id is null or actors.restaurant_id is distinct from counts.restaurant_id))

    union all

    select 'inventory count line parent scope', count(*)::bigint
    from public.inventory_count_lines lines
    left join public.inventory_counts counts on counts.id = lines.count_id
    left join public.store_branches branches on branches.id = lines.branch_id
    left join public.inventory_locations locations on locations.id = lines.location_id
    left join public.ingredients ingredients on ingredients.id = lines.ingredient_id
    left join public.inventory_batches batches on batches.id = lines.batch_id
    where counts.id is null
       or counts.restaurant_id is distinct from lines.restaurant_id
       or (lines.branch_id is not null and (branches.id is null or branches.restaurant_id is distinct from lines.restaurant_id))
       or (lines.location_id is not null and (locations.id is null or locations.restaurant_id is distinct from lines.restaurant_id))
       or (lines.location_id is not null and locations.branch_id is distinct from lines.branch_id)
       or ingredients.id is null
       or ingredients.restaurant_id is distinct from lines.restaurant_id
       or (
         lines.batch_id is not null
         and (
           batches.id is null
           or batches.restaurant_id is distinct from lines.restaurant_id
           or batches.ingredient_id is distinct from lines.ingredient_id
         )
       )

    union all

    select 'inventory alert parent scope', count(*)::bigint
    from public.inventory_alerts alerts
    left join public.store_branches branches on branches.id = alerts.branch_id
    left join public.ingredients ingredients on ingredients.id = alerts.ingredient_id
    left join public.users actors on actors.id = alerts.actor_user_id
    where (alerts.branch_id is not null and (branches.id is null or branches.restaurant_id is distinct from alerts.restaurant_id))
       or (alerts.ingredient_id is not null and (ingredients.id is null or ingredients.restaurant_id is distinct from alerts.restaurant_id))
       or (alerts.actor_user_id is not null and (actors.id is null or actors.restaurant_id is distinct from alerts.restaurant_id))
  )
  select string_agg(format('%s=%s', issue, invalid_count), ', ' order by issue)
  into v_violations
  from checks
  where invalid_count > 0;

  if v_violations is not null then
    raise exception 'Inventory containment preflight failed (%); repair invalid rows and rerun the migration', v_violations;
  end if;
end
$inventory_preflight$;

set lock_timeout = '5s';
set statement_timeout = '5min';

create unique index if not exists users_restaurant_id_id_key
  on public.users (restaurant_id, id);
create unique index if not exists store_branches_restaurant_id_id_key
  on public.store_branches (restaurant_id, id);
create unique index if not exists menu_items_restaurant_id_id_key
  on public.menu_items (restaurant_id, id);
create unique index if not exists ingredient_categories_restaurant_id_id_key
  on public.ingredient_categories (restaurant_id, id);
create unique index if not exists ingredients_restaurant_id_id_key
  on public.ingredients (restaurant_id, id);
create unique index if not exists suppliers_restaurant_id_id_key
  on public.suppliers (restaurant_id, id);
create unique index if not exists supplier_items_restaurant_id_ingredient_key
  on public.supplier_items (restaurant_id, id, ingredient_id);
create unique index if not exists inventory_locations_restaurant_id_id_key
  on public.inventory_locations (restaurant_id, id);
create unique index if not exists purchase_orders_restaurant_id_id_key
  on public.purchase_orders (restaurant_id, id);
create unique index if not exists purchase_order_lines_restaurant_id_ingredient_key
  on public.purchase_order_lines (restaurant_id, id, ingredient_id);
create unique index if not exists inventory_batches_restaurant_id_ingredient_key
  on public.inventory_batches (restaurant_id, id, ingredient_id);
create unique index if not exists branch_transfers_restaurant_id_id_key
  on public.branch_transfers (restaurant_id, id);
create unique index if not exists inventory_counts_restaurant_id_id_key
  on public.inventory_counts (restaurant_id, id);

do $inventory_constraints$
declare
  v_constraint record;
begin
  for v_constraint in
    select *
    from (values
      ('ingredients', 'ingredients_restaurant_category_fkey', 'foreign key (restaurant_id, category_id) references public.ingredient_categories (restaurant_id, id)'),
      ('ingredients', 'ingredients_restaurant_default_supplier_fkey', 'foreign key (restaurant_id, default_supplier_id) references public.suppliers (restaurant_id, id)'),
      ('menu_item_recipes', 'menu_item_recipes_restaurant_menu_item_fkey', 'foreign key (restaurant_id, menu_item_id) references public.menu_items (restaurant_id, id)'),
      ('menu_item_recipes', 'menu_item_recipes_restaurant_ingredient_fkey', 'foreign key (restaurant_id, ingredient_id) references public.ingredients (restaurant_id, id)'),
      ('inventory_locations', 'inventory_locations_restaurant_branch_fkey', 'foreign key (restaurant_id, branch_id) references public.store_branches (restaurant_id, id)'),
      ('ingredient_unit_conversions', 'ingredient_unit_conversions_restaurant_ingredient_fkey', 'foreign key (restaurant_id, ingredient_id) references public.ingredients (restaurant_id, id)'),
      ('supplier_items', 'supplier_items_restaurant_supplier_fkey', 'foreign key (restaurant_id, supplier_id) references public.suppliers (restaurant_id, id)'),
      ('supplier_items', 'supplier_items_restaurant_ingredient_fkey', 'foreign key (restaurant_id, ingredient_id) references public.ingredients (restaurant_id, id)'),
      ('supplier_price_history', 'supplier_price_history_restaurant_supplier_fkey', 'foreign key (restaurant_id, supplier_id) references public.suppliers (restaurant_id, id)'),
      ('supplier_price_history', 'supplier_price_history_restaurant_ingredient_fkey', 'foreign key (restaurant_id, ingredient_id) references public.ingredients (restaurant_id, id)'),
      ('supplier_price_history', 'supplier_price_history_restaurant_purchase_order_fkey', 'foreign key (restaurant_id, purchase_order_id) references public.purchase_orders (restaurant_id, id)'),
      ('purchase_orders', 'purchase_orders_restaurant_branch_fkey', 'foreign key (restaurant_id, branch_id) references public.store_branches (restaurant_id, id)'),
      ('purchase_orders', 'purchase_orders_restaurant_location_fkey', 'foreign key (restaurant_id, location_id) references public.inventory_locations (restaurant_id, id)'),
      ('purchase_orders', 'purchase_orders_restaurant_supplier_fkey', 'foreign key (restaurant_id, supplier_id) references public.suppliers (restaurant_id, id)'),
      ('purchase_orders', 'purchase_orders_restaurant_actor_fkey', 'foreign key (restaurant_id, actor_user_id) references public.users (restaurant_id, id)'),
      ('purchase_order_lines', 'purchase_order_lines_restaurant_order_fkey', 'foreign key (restaurant_id, purchase_order_id) references public.purchase_orders (restaurant_id, id)'),
      ('purchase_order_lines', 'purchase_order_lines_restaurant_ingredient_fkey', 'foreign key (restaurant_id, ingredient_id) references public.ingredients (restaurant_id, id)'),
      ('purchase_order_lines', 'purchase_order_lines_restaurant_supplier_item_ingredient_fkey', 'foreign key (restaurant_id, supplier_item_id, ingredient_id) references public.supplier_items (restaurant_id, id, ingredient_id)'),
      ('inventory_batches', 'inventory_batches_restaurant_ingredient_fkey', 'foreign key (restaurant_id, ingredient_id) references public.ingredients (restaurant_id, id)'),
      ('inventory_batches', 'inventory_batches_restaurant_supplier_fkey', 'foreign key (restaurant_id, supplier_id) references public.suppliers (restaurant_id, id)'),
      ('inventory_batches', 'inventory_batches_restaurant_po_line_ingredient_fkey', 'foreign key (restaurant_id, purchase_order_line_id, ingredient_id) references public.purchase_order_lines (restaurant_id, id, ingredient_id)'),
      ('stock_balances', 'stock_balances_restaurant_branch_fkey', 'foreign key (restaurant_id, branch_id) references public.store_branches (restaurant_id, id)'),
      ('stock_balances', 'stock_balances_restaurant_location_fkey', 'foreign key (restaurant_id, location_id) references public.inventory_locations (restaurant_id, id)'),
      ('stock_balances', 'stock_balances_restaurant_ingredient_fkey', 'foreign key (restaurant_id, ingredient_id) references public.ingredients (restaurant_id, id)'),
      ('stock_balances', 'stock_balances_restaurant_batch_ingredient_fkey', 'foreign key (restaurant_id, batch_id, ingredient_id) references public.inventory_batches (restaurant_id, id, ingredient_id)'),
      ('branch_transfers', 'branch_transfers_restaurant_from_branch_fkey', 'foreign key (restaurant_id, from_branch_id) references public.store_branches (restaurant_id, id)'),
      ('branch_transfers', 'branch_transfers_restaurant_to_branch_fkey', 'foreign key (restaurant_id, to_branch_id) references public.store_branches (restaurant_id, id)'),
      ('branch_transfers', 'branch_transfers_restaurant_from_location_fkey', 'foreign key (restaurant_id, from_location_id) references public.inventory_locations (restaurant_id, id)'),
      ('branch_transfers', 'branch_transfers_restaurant_to_location_fkey', 'foreign key (restaurant_id, to_location_id) references public.inventory_locations (restaurant_id, id)'),
      ('branch_transfers', 'branch_transfers_restaurant_requested_by_fkey', 'foreign key (restaurant_id, requested_by_user_id) references public.users (restaurant_id, id)'),
      ('branch_transfers', 'branch_transfers_restaurant_approved_by_fkey', 'foreign key (restaurant_id, approved_by_user_id) references public.users (restaurant_id, id)'),
      ('branch_transfer_lines', 'branch_transfer_lines_restaurant_transfer_fkey', 'foreign key (restaurant_id, transfer_id) references public.branch_transfers (restaurant_id, id)'),
      ('branch_transfer_lines', 'branch_transfer_lines_restaurant_ingredient_fkey', 'foreign key (restaurant_id, ingredient_id) references public.ingredients (restaurant_id, id)'),
      ('branch_transfer_lines', 'branch_transfer_lines_restaurant_batch_ingredient_fkey', 'foreign key (restaurant_id, batch_id, ingredient_id) references public.inventory_batches (restaurant_id, id, ingredient_id)'),
      ('inventory_movements', 'inventory_movements_restaurant_branch_fkey', 'foreign key (restaurant_id, branch_id) references public.store_branches (restaurant_id, id)'),
      ('inventory_movements', 'inventory_movements_restaurant_location_fkey', 'foreign key (restaurant_id, location_id) references public.inventory_locations (restaurant_id, id)'),
      ('inventory_movements', 'inventory_movements_restaurant_ingredient_fkey', 'foreign key (restaurant_id, ingredient_id) references public.ingredients (restaurant_id, id)'),
      ('inventory_movements', 'inventory_movements_restaurant_batch_ingredient_fkey', 'foreign key (restaurant_id, batch_id, ingredient_id) references public.inventory_batches (restaurant_id, id, ingredient_id)'),
      ('inventory_movements', 'inventory_movements_restaurant_purchase_order_fkey', 'foreign key (restaurant_id, purchase_order_id) references public.purchase_orders (restaurant_id, id)'),
      ('inventory_movements', 'inventory_movements_restaurant_transfer_fkey', 'foreign key (restaurant_id, transfer_id) references public.branch_transfers (restaurant_id, id)'),
      ('inventory_movements', 'inventory_movements_restaurant_actor_fkey', 'foreign key (restaurant_id, actor_user_id) references public.users (restaurant_id, id)'),
      ('inventory_counts', 'inventory_counts_restaurant_branch_fkey', 'foreign key (restaurant_id, branch_id) references public.store_branches (restaurant_id, id)'),
      ('inventory_counts', 'inventory_counts_restaurant_location_fkey', 'foreign key (restaurant_id, location_id) references public.inventory_locations (restaurant_id, id)'),
      ('inventory_counts', 'inventory_counts_restaurant_actor_fkey', 'foreign key (restaurant_id, actor_user_id) references public.users (restaurant_id, id)'),
      ('inventory_count_lines', 'inventory_count_lines_restaurant_count_fkey', 'foreign key (restaurant_id, count_id) references public.inventory_counts (restaurant_id, id)'),
      ('inventory_count_lines', 'inventory_count_lines_restaurant_branch_fkey', 'foreign key (restaurant_id, branch_id) references public.store_branches (restaurant_id, id)'),
      ('inventory_count_lines', 'inventory_count_lines_restaurant_location_fkey', 'foreign key (restaurant_id, location_id) references public.inventory_locations (restaurant_id, id)'),
      ('inventory_count_lines', 'inventory_count_lines_restaurant_ingredient_fkey', 'foreign key (restaurant_id, ingredient_id) references public.ingredients (restaurant_id, id)'),
      ('inventory_count_lines', 'inventory_count_lines_restaurant_batch_ingredient_fkey', 'foreign key (restaurant_id, batch_id, ingredient_id) references public.inventory_batches (restaurant_id, id, ingredient_id)'),
      ('inventory_alerts', 'inventory_alerts_restaurant_branch_fkey', 'foreign key (restaurant_id, branch_id) references public.store_branches (restaurant_id, id)'),
      ('inventory_alerts', 'inventory_alerts_restaurant_ingredient_fkey', 'foreign key (restaurant_id, ingredient_id) references public.ingredients (restaurant_id, id)'),
      ('inventory_alerts', 'inventory_alerts_restaurant_actor_fkey', 'foreign key (restaurant_id, actor_user_id) references public.users (restaurant_id, id)')
    ) as constraints(table_name, constraint_name, definition)
  loop
    if not exists (
      select 1
      from pg_constraint
      where conname = v_constraint.constraint_name
        and conrelid = format('public.%I', v_constraint.table_name)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I %s not valid',
        v_constraint.table_name,
        v_constraint.constraint_name,
        v_constraint.definition
      );
    end if;

    execute format(
      'alter table public.%I validate constraint %I',
      v_constraint.table_name,
      v_constraint.constraint_name
    );
  end loop;
end
$inventory_constraints$;

create or replace function app_private.assert_inventory_location_scope(
  p_restaurant_id uuid,
  p_branch_id uuid,
  p_location_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_branch_id is not null and not exists (
    select 1
    from public.store_branches branches
    where branches.id = p_branch_id
      and branches.restaurant_id = p_restaurant_id
  ) then
    raise exception using errcode = '23514', message = 'INVENTORY_BRANCH_SCOPE_MISMATCH';
  end if;

  if p_location_id is not null and not exists (
    select 1
    from public.inventory_locations locations
    where locations.id = p_location_id
      and locations.restaurant_id = p_restaurant_id
      and locations.branch_id is not distinct from p_branch_id
  ) then
    raise exception using errcode = '23514', message = 'INVENTORY_LOCATION_SCOPE_MISMATCH';
  end if;
end;
$$;

create or replace function app_private.enforce_inventory_location_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_restaurant_id uuid := nullif(v_row ->> 'restaurant_id', '')::uuid;
  v_branch_id uuid;
  v_location_id uuid;
begin
  if coalesce(tg_argv[0], '') <> '' then
    v_branch_id := nullif(v_row ->> tg_argv[0], '')::uuid;
  end if;

  if coalesce(tg_argv[1], '') <> '' then
    v_location_id := nullif(v_row ->> tg_argv[1], '')::uuid;
  end if;

  perform app_private.assert_inventory_location_scope(v_restaurant_id, v_branch_id, v_location_id);
  return new;
end;
$$;

create or replace function app_private.assert_inventory_movement_source_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_valid boolean := true;
begin
  if new.source_id is null then
    return new;
  end if;

  case new.source_type
    when 'order' then
      select exists (
        select 1 from public.orders sources
        where sources.id = new.source_id and sources.restaurant_id = new.restaurant_id
      ) into v_valid;
    when 'count' then
      select exists (
        select 1 from public.inventory_counts sources
        where sources.id = new.source_id and sources.restaurant_id = new.restaurant_id
      ) into v_valid;
    when 'purchase_order' then
      select exists (
        select 1 from public.purchase_orders sources
        where sources.id = new.source_id and sources.restaurant_id = new.restaurant_id
      ) into v_valid;
    when 'transfer' then
      select exists (
        select 1 from public.branch_transfers sources
        where sources.id = new.source_id and sources.restaurant_id = new.restaurant_id
      ) into v_valid;
    when 'supplier' then
      select exists (
        select 1 from public.suppliers sources
        where sources.id = new.source_id and sources.restaurant_id = new.restaurant_id
      ) into v_valid;
    else
      v_valid := true;
  end case;

  if not v_valid then
    raise exception using errcode = '23514', message = 'INVENTORY_MOVEMENT_SOURCE_SCOPE_MISMATCH';
  end if;

  return new;
end;
$$;

revoke all on function app_private.assert_inventory_location_scope(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.enforce_inventory_location_scope()
  from public, anon, authenticated, service_role;
revoke all on function app_private.assert_inventory_movement_source_scope()
  from public, anon, authenticated, service_role;

drop trigger if exists inventory_locations_scope_guard on public.inventory_locations;
create trigger inventory_locations_scope_guard
before insert or update of restaurant_id, branch_id on public.inventory_locations
for each row execute function app_private.enforce_inventory_location_scope('branch_id', '');

drop trigger if exists purchase_orders_scope_guard on public.purchase_orders;
create trigger purchase_orders_scope_guard
before insert or update of restaurant_id, branch_id, location_id on public.purchase_orders
for each row execute function app_private.enforce_inventory_location_scope('branch_id', 'location_id');

drop trigger if exists stock_balances_scope_guard on public.stock_balances;
create trigger stock_balances_scope_guard
before insert or update of restaurant_id, branch_id, location_id on public.stock_balances
for each row execute function app_private.enforce_inventory_location_scope('branch_id', 'location_id');

drop trigger if exists branch_transfers_from_scope_guard on public.branch_transfers;
create trigger branch_transfers_from_scope_guard
before insert or update of restaurant_id, from_branch_id, from_location_id on public.branch_transfers
for each row execute function app_private.enforce_inventory_location_scope('from_branch_id', 'from_location_id');

drop trigger if exists branch_transfers_to_scope_guard on public.branch_transfers;
create trigger branch_transfers_to_scope_guard
before insert or update of restaurant_id, to_branch_id, to_location_id on public.branch_transfers
for each row execute function app_private.enforce_inventory_location_scope('to_branch_id', 'to_location_id');

drop trigger if exists inventory_movements_scope_guard on public.inventory_movements;
create trigger inventory_movements_scope_guard
before insert or update of restaurant_id, branch_id, location_id on public.inventory_movements
for each row execute function app_private.enforce_inventory_location_scope('branch_id', 'location_id');

drop trigger if exists inventory_movements_source_scope_guard on public.inventory_movements;
create trigger inventory_movements_source_scope_guard
before insert or update of restaurant_id, source_type, source_id on public.inventory_movements
for each row execute function app_private.assert_inventory_movement_source_scope();

drop trigger if exists inventory_counts_scope_guard on public.inventory_counts;
create trigger inventory_counts_scope_guard
before insert or update of restaurant_id, branch_id, location_id on public.inventory_counts
for each row execute function app_private.enforce_inventory_location_scope('branch_id', 'location_id');

drop trigger if exists inventory_count_lines_scope_guard on public.inventory_count_lines;
create trigger inventory_count_lines_scope_guard
before insert or update of restaurant_id, branch_id, location_id on public.inventory_count_lines
for each row execute function app_private.enforce_inventory_location_scope('branch_id', 'location_id');

drop trigger if exists inventory_alerts_scope_guard on public.inventory_alerts;
create trigger inventory_alerts_scope_guard
before insert or update of restaurant_id, branch_id on public.inventory_alerts
for each row execute function app_private.enforce_inventory_location_scope('branch_id', '');

create or replace function app_private.current_inventory_restaurant_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with request_context as (
    select
      current_setting('request.jwt.claim.role', true) as jwt_role,
      auth.uid() as jwt_user_id,
      nullif(app_private.request_header_text('x-logivn-inventory-actor-id'), '')::uuid as inventory_actor_user_id
  )
  select users.restaurant_id
  from public.users users
  cross join request_context
  where (
      request_context.jwt_role = 'service_role'
      and users.id = request_context.inventory_actor_user_id
    )
    or (
      request_context.jwt_role is distinct from 'service_role'
      and users.id = request_context.jwt_user_id
    )
  limit 1
$$;

revoke all on function app_private.current_inventory_restaurant_id() from public, anon;
grant execute on function app_private.current_inventory_restaurant_id() to authenticated, service_role;

revoke all on table
  public.ingredient_categories,
  public.ingredients,
  public.menu_item_recipes,
  public.inventory_movements,
  public.inventory_counts,
  public.inventory_count_lines,
  public.inventory_locations,
  public.suppliers,
  public.ingredient_unit_conversions,
  public.supplier_items,
  public.supplier_price_history,
  public.purchase_orders,
  public.purchase_order_lines,
  public.inventory_batches,
  public.stock_balances,
  public.branch_transfers,
  public.branch_transfer_lines,
  public.inventory_alerts
from public, anon, authenticated;

grant select on table
  public.ingredient_categories,
  public.ingredients,
  public.menu_item_recipes,
  public.inventory_movements,
  public.inventory_counts,
  public.inventory_count_lines,
  public.inventory_locations,
  public.suppliers,
  public.ingredient_unit_conversions,
  public.supplier_items,
  public.supplier_price_history,
  public.purchase_orders,
  public.purchase_order_lines,
  public.inventory_batches,
  public.stock_balances,
  public.branch_transfers,
  public.branch_transfer_lines,
  public.inventory_alerts
to authenticated;

grant select, insert, update, delete on table
  public.ingredient_categories,
  public.ingredients,
  public.menu_item_recipes,
  public.inventory_movements,
  public.inventory_counts,
  public.inventory_count_lines,
  public.inventory_locations,
  public.suppliers,
  public.ingredient_unit_conversions,
  public.supplier_items,
  public.supplier_price_history,
  public.purchase_orders,
  public.purchase_order_lines,
  public.inventory_batches,
  public.stock_balances,
  public.branch_transfers,
  public.branch_transfer_lines,
  public.inventory_alerts
to service_role;

drop policy if exists "staff can read own ingredient categories" on public.ingredient_categories;
drop policy if exists "admins can manage own ingredient categories" on public.ingredient_categories;
drop policy if exists "staff can read own ingredients" on public.ingredients;
drop policy if exists "admins can manage own ingredients" on public.ingredients;
drop policy if exists "staff can read own menu recipes" on public.menu_item_recipes;
drop policy if exists "admins can manage own menu recipes" on public.menu_item_recipes;
drop policy if exists "staff can read own inventory movements" on public.inventory_movements;
drop policy if exists "admins can create own inventory movements" on public.inventory_movements;
drop policy if exists "staff can read own inventory counts" on public.inventory_counts;
drop policy if exists "admins can manage own inventory counts" on public.inventory_counts;
drop policy if exists "staff can read own inventory count lines" on public.inventory_count_lines;
drop policy if exists "admins can manage own inventory count lines" on public.inventory_count_lines;
drop policy if exists "restaurant users can read own inventory locations" on public.inventory_locations;
drop policy if exists "admins can manage own inventory locations" on public.inventory_locations;
drop policy if exists "restaurant users can read own suppliers" on public.suppliers;
drop policy if exists "admins can manage own suppliers" on public.suppliers;
drop policy if exists "restaurant users can read own ingredient unit conversions" on public.ingredient_unit_conversions;
drop policy if exists "admins can manage own ingredient unit conversions" on public.ingredient_unit_conversions;
drop policy if exists "restaurant users can read own supplier items" on public.supplier_items;
drop policy if exists "admins can manage own supplier items" on public.supplier_items;
drop policy if exists "restaurant users can read own supplier price history" on public.supplier_price_history;
drop policy if exists "admins can manage own supplier price history" on public.supplier_price_history;
drop policy if exists "restaurant users can read own purchase orders" on public.purchase_orders;
drop policy if exists "admins can manage own purchase orders" on public.purchase_orders;
drop policy if exists "restaurant users can read own purchase order lines" on public.purchase_order_lines;
drop policy if exists "admins can manage own purchase order lines" on public.purchase_order_lines;
drop policy if exists "restaurant users can read own inventory batches" on public.inventory_batches;
drop policy if exists "admins can manage own inventory batches" on public.inventory_batches;
drop policy if exists "restaurant users can read own stock balances" on public.stock_balances;
drop policy if exists "admins can manage own stock balances" on public.stock_balances;
drop policy if exists "restaurant users can read own branch transfers" on public.branch_transfers;
drop policy if exists "admins can manage own branch transfers" on public.branch_transfers;
drop policy if exists "restaurant users can read own branch transfer lines" on public.branch_transfer_lines;
drop policy if exists "admins can manage own branch transfer lines" on public.branch_transfer_lines;
drop policy if exists "restaurant users can read own inventory alerts" on public.inventory_alerts;
drop policy if exists "admins can manage own inventory alerts" on public.inventory_alerts;

do $inventory_read_policies$
declare
  v_table text;
begin
  foreach v_table in array array[
    'ingredient_categories',
    'ingredients',
    'menu_item_recipes',
    'inventory_movements',
    'inventory_counts',
    'inventory_count_lines',
    'inventory_locations',
    'suppliers',
    'ingredient_unit_conversions',
    'supplier_items',
    'supplier_price_history',
    'purchase_orders',
    'purchase_order_lines',
    'inventory_batches',
    'stock_balances',
    'branch_transfers',
    'branch_transfer_lines',
    'inventory_alerts'
  ]
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      'authenticated can read tenant inventory',
      v_table
    );
    execute format(
      'create policy %I on public.%I for select to authenticated using (restaurant_id = app_private.current_inventory_restaurant_id())',
      'authenticated can read tenant inventory',
      v_table
    );
  end loop;
end
$inventory_read_policies$;

revoke all on function public.apply_inventory_movement(
  uuid, uuid, text, numeric, integer, text, uuid, text, uuid, jsonb,
  uuid, uuid, uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.apply_inventory_movement(
  uuid, uuid, text, numeric, integer, text, uuid, text, uuid, jsonb,
  uuid, uuid, uuid, uuid, uuid
) to service_role;

revoke all on function public.create_purchase_order(
  uuid, uuid, uuid, timestamptz, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.create_purchase_order(
  uuid, uuid, uuid, timestamptz, text, uuid, jsonb
) to service_role;

revoke all on function public.receive_purchase_order(
  uuid, uuid, uuid, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.receive_purchase_order(
  uuid, uuid, uuid, timestamptz, jsonb
) to service_role;

revoke all on function public.apply_inventory_count(
  uuid, text, uuid, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.apply_inventory_count(
  uuid, text, uuid, text, uuid, jsonb
) to service_role;

revoke all on function public.create_branch_transfer(
  uuid, uuid, uuid, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.create_branch_transfer(
  uuid, uuid, uuid, text, uuid, jsonb
) to service_role;

revoke all on function public.process_branch_transfer(
  uuid, uuid, text, uuid, text, jsonb
) from public, anon, authenticated;
grant execute on function public.process_branch_transfer(
  uuid, uuid, text, uuid, text, jsonb
) to service_role;

revoke all on function public.accept_order_with_inventory_deduction(
  uuid, uuid, uuid, timestamptz, text, jsonb
) from public, anon, authenticated;
grant execute on function public.accept_order_with_inventory_deduction(
  uuid, uuid, uuid, timestamptz, text, jsonb
) to service_role;

revoke all on function public.cancel_order_with_inventory_rollback(
  uuid, uuid, uuid
) from public, anon, authenticated, service_role;

revoke all on function public.apply_order_inventory_movement_atomic(
  uuid, uuid, text, numeric, integer, uuid, text, uuid, jsonb, uuid, uuid, uuid
) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';

reset lock_timeout;
reset statement_timeout;
