-- Allow Google OAuth identities to access the restaurant already attached to the same verified email.
-- Supabase may return a different auth.uid() for an OAuth identity depending on provider-linking settings.

create or replace function public.current_restaurant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select restaurant_id
  from public.users
  where id = auth.uid()
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by case when id = auth.uid() then 0 else 1 end
  limit 1
$$;

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.users
  where id = auth.uid()
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by case when id = auth.uid() then 0 else 1 end
  limit 1
$$;

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
        or public.current_restaurant_id() = r.id
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
  today_orders as (
    select o.*
    from public.orders o
    join allowed_restaurant ar on ar.id = o.restaurant_id
    where o.created_at >= today_start
  ),
  open_orders as (
    select o.*
    from public.orders o
    join allowed_restaurant ar on ar.id = o.restaurant_id
    where o.status in ('pending', 'ordering', 'completed', 'waiting_payment', 'waiting_confirm')
  ),
  paid_today as (
    select *
    from today_orders
    where status = 'paid' or payment_status = 'paid'
  ),
  recent_orders as (
    select jsonb_agg(
      jsonb_build_object(
        'id', o.id,
        'status', o.status,
        'total', o.total,
        'paymentMethod', o.payment_method,
        'createdAt', o.created_at,
        'tableName', coalesce(t.name, case when o.fulfillment_type = 'DELIVERY' then 'Giao hàng' when o.fulfillment_type = 'PICKUP' then 'Đến lấy' else 'Không rõ bàn' end)
      )
      order by o.created_at desc
    ) as rows
    from (
      select *
      from public.orders
      where restaurant_id = target_restaurant_id
      order by created_at desc
      limit 6
    ) o
    left join public.tables t on t.id = o.table_id
  )
  select jsonb_build_object(
    'dashboard', jsonb_build_object(
      'restaurant', to_jsonb(ar),
      'menuItems', coalesce(c.menu_items, 0),
      'tables', coalesce(c.tables, 0),
      'activeOrders', coalesce(c.active_orders, 0)
    ),
    'operations', jsonb_build_object(
      'pending', (select count(*)::int from open_orders where status = 'pending'),
      'ordering', (select count(*)::int from open_orders where status = 'ordering'),
      'completed', (select count(*)::int from open_orders where status = 'completed'),
      'waitingPayment', (select count(*)::int from open_orders where status = 'waiting_payment'),
      'waitingConfirm', (select count(*)::int from open_orders where status = 'waiting_confirm'),
      'paid', (select count(*)::int from paid_today),
      'completedToday', (select count(*)::int from today_orders where status = 'completed'),
      'todayOrders', (select count(*)::int from today_orders),
      'todayRevenue', coalesce((select sum(total)::int from paid_today), 0),
      'qrRevenue', coalesce((select sum(total)::int from paid_today where payment_method = 'QR'), 0),
      'cashRevenue', coalesce((select sum(total)::int from paid_today where payment_method = 'CASH'), 0),
      'averageTicket', coalesce((select round(avg(total))::int from paid_today), 0),
      'openOrderTotal', coalesce((select sum(total)::int from open_orders), 0),
      'recentOrders', coalesce((select rows from recent_orders), '[]'::jsonb)
    )
  )
  from allowed_restaurant ar
  left join counts c on true;
$$;
