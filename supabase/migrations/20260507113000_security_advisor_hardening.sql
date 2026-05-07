-- Reduce Supabase advisor warnings for exposed RPC and public storage listing.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- These helper functions are used by RLS policies, so authenticated users still need EXECUTE.
-- They must not be callable by anonymous REST clients.
revoke all on function public.current_restaurant_id() from public, anon;
revoke all on function public.current_user_role() from public, anon;
grant execute on function public.current_restaurant_id() to authenticated, service_role;
grant execute on function public.current_user_role() to authenticated, service_role;

-- Dashboard snapshot is called by trusted server code with the service role.
revoke all on function public.get_admin_dashboard_snapshot(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.get_admin_dashboard_snapshot(uuid, timestamptz) to service_role;

-- Trigger-only functions should not be exposed as public RPC endpoints.
revoke all on function public.broadcast_customer_order_status() from public, anon, authenticated;
revoke all on function public.touch_order_for_realtime() from public, anon, authenticated;
revoke all on function public.sync_table_bill_total() from public, anon, authenticated;
revoke all on function public.recalculate_table_bill_total(uuid) from public, anon, authenticated;
grant execute on function public.recalculate_table_bill_total(uuid) to service_role;

-- Public buckets can serve objects by URL without allowing clients to list every object.
drop policy if exists "public can read menu images" on storage.objects;
drop policy if exists "public can read platform assets" on storage.objects;

-- Customer screens receive status through realtime broadcast topics and server API history.
-- They must not be able to list arbitrary orders through the public Data API.
drop policy if exists "anonymous can receive order status realtime" on public.orders;
