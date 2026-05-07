-- Harden public data access before commercial rollout.
-- Public/customer reads go through Next.js API routes. Browser realtime uses
-- per-order public broadcast topics instead of granting anon SELECT on orders.

drop policy if exists "public can read tables for QR routes" on public.tables;
drop policy if exists "public can read menu categories" on public.menu_categories;
drop policy if exists "public can read available menu items" on public.menu_items;
drop policy if exists "anonymous can receive order status realtime" on public.orders;

drop policy if exists "anon can receive customer order broadcasts" on realtime.messages;

create policy "anon can receive customer order broadcasts"
on realtime.messages
for select
to anon
using (topic like 'customer-order:%');

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
      'total', new.total,
      'payment_method', new.payment_method,
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
after insert or update of status, total, payment_method, updated_at on public.orders
for each row execute function public.broadcast_customer_order_status();
