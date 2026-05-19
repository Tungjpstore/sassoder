-- Allows one order ingredient to be deducted across multiple FEFO batch/location rows.
drop index if exists public.inventory_movements_order_deduction_unique_idx;
drop index if exists public.inventory_movements_order_rollback_unique_idx;

create unique index if not exists inventory_movements_order_deduction_unique_idx
  on public.inventory_movements (
    restaurant_id,
    source_id,
    ingredient_id,
    movement_type,
    coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(batch_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where source_type = 'order'
    and movement_type = 'deduct_sale'
    and source_id is not null;

create unique index if not exists inventory_movements_order_rollback_unique_idx
  on public.inventory_movements (
    restaurant_id,
    source_id,
    ingredient_id,
    movement_type,
    coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(batch_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where source_type = 'order'
    and movement_type = 'rollback'
    and source_id is not null;

create index if not exists stock_balances_order_fefo_lookup_idx
  on public.stock_balances (restaurant_id, ingredient_id, location_id, batch_id)
  where on_hand_quantity > 0;

create index if not exists inventory_batches_order_fefo_lookup_idx
  on public.inventory_batches (restaurant_id, ingredient_id, status, expiration_date, received_at, created_at)
  where remaining_quantity > 0;
