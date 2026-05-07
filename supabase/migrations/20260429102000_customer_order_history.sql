alter table public.orders
  add column if not exists customer_session_id text;

alter table public.orders
  drop constraint if exists orders_customer_session_id_format,
  add constraint orders_customer_session_id_format
    check (customer_session_id is null or customer_session_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

create index if not exists orders_customer_session_created_idx
  on public.orders (restaurant_id, table_id, customer_session_id, created_at desc)
  where customer_session_id is not null;
