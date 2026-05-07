alter table public.restaurants
  add column if not exists online_ordering_enabled boolean not null default false,
  add column if not exists pickup_enabled boolean not null default true,
  add column if not exists delivery_enabled boolean not null default false,
  add column if not exists store_lat double precision,
  add column if not exists store_lng double precision,
  add column if not exists delivery_radius_km numeric(6,2) not null default 5,
  add column if not exists free_delivery_radius_km numeric(6,2) not null default 0,
  add column if not exists delivery_base_fee integer not null default 0,
  add column if not exists delivery_fee_per_km integer not null default 0,
  add column if not exists min_order_for_delivery integer not null default 0,
  add column if not exists pickup_eta_minutes integer not null default 15,
  add column if not exists delivery_eta_minutes integer not null default 45,
  add column if not exists notify_new_order boolean not null default true,
  add column if not exists notify_payment_waiting boolean not null default true,
  add column if not exists receipt_footer text,
  add column if not exists receipt_show_qr boolean not null default true;

alter table public.restaurants
  drop constraint if exists restaurants_store_lat_range,
  add constraint restaurants_store_lat_range
    check (store_lat is null or (store_lat >= -90 and store_lat <= 90));

alter table public.restaurants
  drop constraint if exists restaurants_store_lng_range,
  add constraint restaurants_store_lng_range
    check (store_lng is null or (store_lng >= -180 and store_lng <= 180));

alter table public.restaurants
  drop constraint if exists restaurants_delivery_radius_range,
  add constraint restaurants_delivery_radius_range
    check (delivery_radius_km >= 0 and delivery_radius_km <= 200);

alter table public.restaurants
  drop constraint if exists restaurants_free_delivery_radius_range,
  add constraint restaurants_free_delivery_radius_range
    check (free_delivery_radius_km >= 0 and free_delivery_radius_km <= delivery_radius_km);

alter table public.restaurants
  drop constraint if exists restaurants_delivery_fee_range,
  add constraint restaurants_delivery_fee_range
    check (
      delivery_base_fee >= 0
      and delivery_fee_per_km >= 0
      and min_order_for_delivery >= 0
      and pickup_eta_minutes between 1 and 240
      and delivery_eta_minutes between 1 and 240
    );

alter table public.orders
  alter column table_id drop not null,
  add column if not exists fulfillment_type text not null default 'DINE_IN',
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists delivery_address text,
  add column if not exists delivery_lat double precision,
  add column if not exists delivery_lng double precision,
  add column if not exists delivery_distance_km numeric(8,2),
  add column if not exists delivery_fee integer not null default 0,
  add column if not exists delivery_status text not null default 'none';

alter table public.orders
  drop constraint if exists orders_fulfillment_type_check,
  add constraint orders_fulfillment_type_check
    check (fulfillment_type in ('DINE_IN', 'PICKUP', 'DELIVERY'));

alter table public.orders
  drop constraint if exists orders_delivery_status_check,
  add constraint orders_delivery_status_check
    check (delivery_status in ('none', 'requested', 'accepted', 'out_for_delivery', 'delivered', 'rejected'));

alter table public.orders
  drop constraint if exists orders_delivery_lat_range,
  add constraint orders_delivery_lat_range
    check (delivery_lat is null or (delivery_lat >= -90 and delivery_lat <= 90));

alter table public.orders
  drop constraint if exists orders_delivery_lng_range,
  add constraint orders_delivery_lng_range
    check (delivery_lng is null or (delivery_lng >= -180 and delivery_lng <= 180));

alter table public.orders
  drop constraint if exists orders_remote_customer_required,
  add constraint orders_remote_customer_required
    check (
      fulfillment_type = 'DINE_IN'
      or (customer_name is not null and length(trim(customer_name)) >= 2 and customer_phone is not null and length(trim(customer_phone)) >= 6)
    );

alter table public.orders
  drop constraint if exists orders_delivery_address_required,
  add constraint orders_delivery_address_required
    check (fulfillment_type <> 'DELIVERY' or delivery_address is not null);

create index if not exists orders_restaurant_fulfillment_created_idx
  on public.orders (restaurant_id, fulfillment_type, created_at desc);

create index if not exists orders_restaurant_remote_customer_created_idx
  on public.orders (restaurant_id, customer_phone, created_at desc)
  where fulfillment_type in ('PICKUP', 'DELIVERY') and customer_phone is not null;

create unique index if not exists orders_restaurant_remote_idempotency_idx
  on public.orders (restaurant_id, idempotency_key)
  where table_id is null and idempotency_key is not null;

create or replace function public.get_admin_dashboard_snapshot(
  target_restaurant_id uuid,
  today_start timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with allowed_restaurant as (
    select r.*
    from public.restaurants r
    where r.id = target_restaurant_id
      and (
        auth.role() = 'service_role'
        or exists (
          select 1
          from public.users u
          where u.id = auth.uid()
            and u.restaurant_id = r.id
        )
      )
    limit 1
  ),
  counts as (
    select
      (select count(*)::int from public.menu_items mi where mi.restaurant_id = ar.id) as menu_items,
      (select count(*)::int from public.tables t where t.restaurant_id = ar.id) as tables,
      (
        select count(*)::int
        from public.orders o
        where o.restaurant_id = ar.id
          and o.status in ('pending', 'ordering', 'completed', 'waiting_payment', 'waiting_confirm')
      ) as active_orders
    from allowed_restaurant ar
  ),
  today as (
    select
      count(o.id)::int as today_orders,
      count(o.id) filter (where o.status = 'paid')::int as paid,
      count(o.id) filter (where o.status = 'completed')::int as completed_today,
      coalesce(sum(o.total) filter (where o.status = 'paid'), 0)::int as today_revenue,
      coalesce(sum(o.total) filter (where o.status = 'paid' and o.payment_method = 'QR'), 0)::int as qr_revenue,
      coalesce(sum(o.total) filter (where o.status = 'paid' and o.payment_method = 'CASH'), 0)::int as cash_revenue
    from allowed_restaurant ar
    left join public.orders o
      on o.restaurant_id = ar.id
      and o.created_at >= today_start
  ),
  open_orders as (
    select
      count(o.id) filter (where o.status = 'pending')::int as pending,
      count(o.id) filter (where o.status = 'ordering')::int as ordering,
      count(o.id) filter (where o.status = 'completed')::int as completed,
      count(o.id) filter (where o.status = 'waiting_payment')::int as waiting_payment,
      count(o.id) filter (where o.status = 'waiting_confirm')::int as waiting_confirm,
      coalesce(sum(o.total), 0)::int as open_order_total
    from allowed_restaurant ar
    left join public.orders o
      on o.restaurant_id = ar.id
      and o.status in ('pending', 'ordering', 'completed', 'waiting_payment', 'waiting_confirm')
  ),
  recent as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', latest.id,
          'status', latest.status,
          'total', latest.total,
          'paymentMethod', latest.payment_method,
          'createdAt', latest.created_at,
          'tableName', latest.table_name
        )
        order by latest.created_at desc
      ),
      '[]'::jsonb
    ) as recent_orders
    from (
      select
        o.id,
        o.status,
        o.total,
        o.payment_method,
        o.created_at,
        case
          when o.fulfillment_type = 'DELIVERY' then 'Giao hàng'
          when o.fulfillment_type = 'PICKUP' then 'Đến lấy'
          else coalesce(t.name, 'Không rõ bàn')
        end as table_name
      from allowed_restaurant ar
      join public.orders o on o.restaurant_id = ar.id
      left join public.tables t on t.id = o.table_id
      order by o.created_at desc
      limit 6
    ) latest
  )
  select jsonb_build_object(
    'dashboard', jsonb_build_object(
      'restaurant', to_jsonb(ar),
      'menuItems', coalesce(c.menu_items, 0),
      'tables', coalesce(c.tables, 0),
      'activeOrders', coalesce(c.active_orders, 0)
    ),
    'operations', jsonb_build_object(
      'pending', coalesce(o.pending, 0),
      'ordering', coalesce(o.ordering, 0),
      'completed', coalesce(o.completed, 0),
      'waitingPayment', coalesce(o.waiting_payment, 0),
      'waitingConfirm', coalesce(o.waiting_confirm, 0),
      'paid', coalesce(td.paid, 0),
      'completedToday', coalesce(td.completed_today, 0),
      'todayOrders', coalesce(td.today_orders, 0),
      'todayRevenue', coalesce(td.today_revenue, 0),
      'qrRevenue', coalesce(td.qr_revenue, 0),
      'cashRevenue', coalesce(td.cash_revenue, 0),
      'averageTicket',
        case
          when coalesce(td.paid, 0) > 0 then round(td.today_revenue::numeric / td.paid)::int
          else 0
        end,
      'openOrderTotal', coalesce(o.open_order_total, 0),
      'recentOrders', coalesce(r.recent_orders, '[]'::jsonb)
    )
  )
  from allowed_restaurant ar
  cross join counts c
  cross join today td
  cross join open_orders o
  cross join recent r;
$$;

revoke all on function public.get_admin_dashboard_snapshot(uuid, timestamptz) from public;
grant execute on function public.get_admin_dashboard_snapshot(uuid, timestamptz) to authenticated, service_role;
