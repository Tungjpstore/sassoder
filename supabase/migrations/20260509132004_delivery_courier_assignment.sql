alter table public.orders
  add column if not exists delivery_courier_id uuid references public.delivery_couriers(id) on delete set null,
  add column if not exists delivery_assigned_at timestamptz;

create index if not exists orders_restaurant_delivery_courier_idx
  on public.orders (restaurant_id, delivery_courier_id, delivery_status, created_at desc)
  where fulfillment_type = 'DELIVERY' and delivery_courier_id is not null;

create index if not exists orders_restaurant_unassigned_delivery_idx
  on public.orders (restaurant_id, created_at desc)
  where fulfillment_type = 'DELIVERY'
    and delivery_courier_id is null
    and delivery_status in ('requested', 'accepted', 'out_for_delivery');

comment on column public.orders.delivery_courier_id is 'Assigned internal courier/shipper for delivery ops. Null means unassigned/manual delivery.';
comment on column public.orders.delivery_assigned_at is 'Timestamp when the current courier assignment was made.';
