-- Online ordering commercial controls: payment policy, payment status and delivery route tracking.

alter table public.restaurants
  add column if not exists online_payment_mode text not null default 'PAY_AFTER',
  add column if not exists delivery_tracking_enabled boolean not null default true;

alter table public.restaurants
  drop constraint if exists restaurants_online_payment_mode_check,
  add constraint restaurants_online_payment_mode_check
    check (online_payment_mode in ('PAY_AFTER', 'QR_PREPAID'));

alter table public.orders
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists paid_at timestamptz,
  add column if not exists delivery_route_geometry jsonb,
  add column if not exists delivery_route_duration_minutes integer,
  add column if not exists delivery_tracking_updated_at timestamptz;

update public.orders
set payment_status = case
  when status = 'paid' then 'paid'
  when status = 'waiting_payment' then 'waiting_payment'
  when status = 'waiting_confirm' then 'waiting_confirm'
  else coalesce(payment_status, 'unpaid')
end
where payment_status is null
  or payment_status = 'unpaid';

update public.orders
set paid_at = coalesce(paid_at, updated_at, created_at)
where payment_status = 'paid'
  and paid_at is null;

alter table public.orders
  drop constraint if exists orders_payment_status_check,
  add constraint orders_payment_status_check
    check (payment_status in ('unpaid', 'waiting_payment', 'waiting_confirm', 'paid', 'failed', 'refunded')),
  drop constraint if exists orders_delivery_route_duration_check,
  add constraint orders_delivery_route_duration_check
    check (delivery_route_duration_minutes is null or delivery_route_duration_minutes between 0 and 1440),
  drop constraint if exists orders_delivery_route_geometry_check,
  add constraint orders_delivery_route_geometry_check
    check (
      delivery_route_geometry is null
      or (
        jsonb_typeof(delivery_route_geometry) = 'object'
        and delivery_route_geometry->>'type' = 'LineString'
        and jsonb_typeof(delivery_route_geometry->'coordinates') = 'array'
      )
    );

create index if not exists orders_restaurant_payment_status_created_idx
  on public.orders (restaurant_id, payment_status, created_at desc);

create index if not exists orders_restaurant_delivery_status_created_idx
  on public.orders (restaurant_id, delivery_status, created_at desc)
  where fulfillment_type = 'DELIVERY';

create or replace function public.broadcast_customer_order_status()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'status', new.status,
      'payment_status', new.payment_status,
      'payment_method', new.payment_method,
      'paid_at', new.paid_at,
      'delivery_status', new.delivery_status,
      'delivery_distance_km', new.delivery_distance_km,
      'delivery_fee', new.delivery_fee,
      'delivery_route_duration_minutes', new.delivery_route_duration_minutes,
      'delivery_tracking_updated_at', new.delivery_tracking_updated_at,
      'total', new.total,
      'updated_at', new.updated_at
    ),
    'order_status',
    'customer-order:' || new.id::text,
    false
  );

  return null;
end;
$$;

drop trigger if exists orders_customer_status_broadcast on public.orders;

create trigger orders_customer_status_broadcast
after insert or update of status, total, payment_method, payment_status, paid_at, delivery_status, delivery_distance_km, delivery_fee, delivery_route_duration_minutes, delivery_tracking_updated_at, updated_at on public.orders
for each row execute function public.broadcast_customer_order_status();

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
      count(o.id) filter (where o.status = 'paid' or o.payment_status = 'paid')::int as paid,
      count(o.id) filter (where o.status = 'completed')::int as completed_today,
      coalesce(sum(o.total) filter (where o.status = 'paid' or o.payment_status = 'paid'), 0)::int as today_revenue,
      coalesce(sum(o.total) filter (where (o.status = 'paid' or o.payment_status = 'paid') and o.payment_method = 'QR'), 0)::int as qr_revenue,
      coalesce(sum(o.total) filter (where (o.status = 'paid' or o.payment_status = 'paid') and o.payment_method = 'CASH'), 0)::int as cash_revenue
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
