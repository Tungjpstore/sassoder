-- Add stale stock as a first-class inventory alert class.

alter table public.inventory_alerts
  drop constraint if exists inventory_alerts_type_check,
  add constraint inventory_alerts_type_check
    check (
      alert_type in (
        'low_stock',
        'out_of_stock',
        'expiring_soon',
        'expired',
        'abnormal_usage',
        'waste_spike',
        'missing_inventory',
        'supplier_delay',
        'price_spike',
        'recipe_gap',
        'stale_stock'
      )
    );

create index if not exists stock_balances_restaurant_stale_stock_idx
  on public.stock_balances (restaurant_id, updated_at, counted_at)
  where on_hand_quantity > 0;
