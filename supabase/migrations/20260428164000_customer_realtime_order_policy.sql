drop policy if exists "anonymous can receive order status realtime" on public.orders;

create policy "anonymous can receive order status realtime"
on public.orders for select
to anon
using (status in ('pending', 'ordering', 'waiting_payment', 'waiting_confirm', 'paid', 'completed', 'cancelled'));
