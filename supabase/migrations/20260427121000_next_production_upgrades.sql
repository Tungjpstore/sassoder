-- Production upgrade patch for the logivn.com rollout.
-- Safe to run after the original schema has already been applied.

alter table public.orders
  drop constraint if exists orders_idempotency_key_key;

create unique index if not exists orders_restaurant_table_idempotency_idx
  on public.orders (restaurant_id, table_id, idempotency_key)
  where idempotency_key is not null;
