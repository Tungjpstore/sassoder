-- Phase 1: close the remaining tenant/RBAC mutation gaps and provide
-- transaction boundaries for reservation creation.

-- Staff mutation RPCs may be called by an authenticated server session, but
-- the actor must be the caller. Service-role workers remain allowed for
-- audited system workflows.
create or replace function app_private.assert_staff_actor_session(p_actor_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or p_actor_user_id is distinct from auth.uid()) then
    raise exception 'Staff mutation actor must match auth.uid()';
  end if;
end;
$$;

revoke all on function app_private.assert_staff_actor_session(uuid) from public, anon;
grant execute on function app_private.assert_staff_actor_session(uuid) to authenticated, service_role;

create or replace function public.update_staff_user_profile(
  p_restaurant_id uuid,
  p_user_id uuid,
  p_actor_user_id uuid,
  p_role_scope public.user_role,
  p_staff_title text,
  p_permission_profile text,
  p_permissions jsonb,
  p_role_id uuid,
  p_role_code text,
  p_profile jsonb,
  p_branch_id uuid default null
)
returns table(user_id uuid, staff_member_id uuid, branch_id uuid)
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.assert_staff_actor_session(p_actor_user_id);
  return query
  select * from app_private.update_staff_user_profile(
    p_restaurant_id, p_user_id, p_actor_user_id, p_role_scope,
    p_staff_title, p_permission_profile, p_permissions, p_role_id,
    p_role_code, p_profile, p_branch_id
  );
end;
$$;

grant execute on function public.update_staff_user_profile(uuid, uuid, uuid, public.user_role, text, text, jsonb, uuid, text, jsonb, uuid)
  to authenticated, service_role;

-- Allow authenticated dashboard sessions to reach the guarded create wrapper;
-- the underlying Auth Admin operation remains service-role-only in the app.
create or replace function public.create_staff_user_profile(
  p_user_id uuid,
  p_restaurant_id uuid,
  p_actor_user_id uuid,
  p_email text,
  p_role_scope public.user_role,
  p_staff_title text,
  p_permission_profile text,
  p_permissions jsonb,
  p_role_id uuid,
  p_role_code text,
  p_full_name text,
  p_phone text default null,
  p_username text default null,
  p_pin_hash text default null,
  p_pin_lookup_hash text default null,
  p_date_of_birth date default null,
  p_hometown text default null,
  p_must_change_app_password boolean default true,
  p_branch_id uuid default null,
  p_notes text default null
)
returns table(user_id uuid, staff_member_id uuid, employee_code text, employee_number integer, must_change_app_password boolean, branch_id uuid)
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.assert_staff_actor_session(p_actor_user_id);
  return query
  select * from app_private.create_staff_user_profile(
    p_user_id, p_restaurant_id, p_actor_user_id, p_email, p_role_scope,
    p_staff_title, p_permission_profile, p_permissions, p_role_id, p_role_code,
    p_full_name, p_phone, p_username, p_pin_hash, p_pin_lookup_hash,
    p_date_of_birth, p_hometown, p_must_change_app_password, p_branch_id, p_notes
  );
end;
$$;

revoke all on function public.create_staff_user_profile(uuid, uuid, uuid, text, public.user_role, text, text, jsonb, uuid, text, text, text, text, text, text, date, text, boolean, uuid, text)
  from public, anon;
grant execute on function public.create_staff_user_profile(uuid, uuid, uuid, text, public.user_role, text, text, jsonb, uuid, text, text, text, text, text, text, date, text, boolean, uuid, text)
  to authenticated, service_role;

create or replace function public.set_staff_account_state(
  p_restaurant_id uuid,
  p_user_id uuid,
  p_actor_user_id uuid,
  p_next_state text,
  p_reason text default null
)
returns table(user_id uuid, staff_member_id uuid, next_state text)
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.assert_staff_actor_session(p_actor_user_id);
  return query
  select * from app_private.set_staff_account_state(
    p_restaurant_id, p_user_id, p_actor_user_id, p_next_state, p_reason
  );
end;
$$;

grant execute on function public.set_staff_account_state(uuid, uuid, uuid, text, text)
  to authenticated, service_role;

-- Inventory ledger tables are readable by staff but all writes go through
-- security-definer workflow RPCs owned by service_role.
revoke insert, update, delete on table
  public.inventory_locations,
  public.suppliers,
  public.ingredient_unit_conversions,
  public.supplier_items,
  public.supplier_price_history,
  public.purchase_orders,
  public.purchase_order_lines,
  public.inventory_batches,
  public.stock_balances,
  public.branch_transfers,
  public.branch_transfer_lines,
  public.inventory_alerts
from authenticated;
grant select on table
  public.inventory_locations,
  public.suppliers,
  public.ingredient_unit_conversions,
  public.supplier_items,
  public.supplier_price_history,
  public.purchase_orders,
  public.purchase_order_lines,
  public.inventory_batches,
  public.stock_balances,
  public.branch_transfers,
  public.branch_transfer_lines,
  public.inventory_alerts
to authenticated;

-- Enforce branch/tenant ownership at the database boundary. Existing bad
-- rows fail the migration with a repairable diagnostic instead of being
-- silently re-associated.
do $$
declare
  v_bad_tables bigint;
  v_bad_orders bigint;
begin
  select count(*) into v_bad_tables
  from public.tables t
  join public.store_branches b on b.id = t.branch_id
  where t.branch_id is not null and t.restaurant_id is distinct from b.restaurant_id;
  if v_bad_tables > 0 then
    raise exception 'Found % cross-tenant table branch links; repair before Phase 1 migration', v_bad_tables;
  end if;

  select count(*) into v_bad_orders
  from public.orders o
  join public.store_branches b on b.id = o.branch_id
  where o.branch_id is not null and o.restaurant_id is distinct from b.restaurant_id;
  if v_bad_orders > 0 then
    raise exception 'Found % cross-tenant order branch links; repair before Phase 1 migration', v_bad_orders;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'store_branches_restaurant_id_id_key') then
    alter table public.store_branches add constraint store_branches_restaurant_id_id_key unique (restaurant_id, id);
  end if;
  alter table public.tables drop constraint if exists tables_branch_id_fkey;
  if not exists (select 1 from pg_constraint where conname = 'tables_restaurant_branch_id_fkey') then
    alter table public.tables add constraint tables_restaurant_branch_id_fkey
      foreign key (restaurant_id, branch_id) references public.store_branches(restaurant_id, id)
      on delete set null not valid;
  end if;
  alter table public.tables validate constraint tables_restaurant_branch_id_fkey;

  alter table public.orders drop constraint if exists orders_branch_id_fkey;
  if not exists (select 1 from pg_constraint where conname = 'orders_restaurant_branch_id_fkey') then
    alter table public.orders add constraint orders_restaurant_branch_id_fkey
      foreign key (restaurant_id, branch_id) references public.store_branches(restaurant_id, id)
      on delete set null not valid;
  end if;
  alter table public.orders validate constraint orders_restaurant_branch_id_fkey;
end $$;

-- One transaction for reservation + table exclusion lock + deposit log.
create or replace function public.create_reservation_with_lock(
  p_reservation jsonb,
  p_table_id uuid,
  p_lock_ends_at timestamptz,
  p_deposit_log jsonb default null
)
returns public.reservations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_reservation public.reservations;
  v_payload jsonb;
begin
  if p_table_id is null then raise exception 'Reservation table is required'; end if;
  v_payload := p_reservation || jsonb_build_object(
    'id', coalesce(p_reservation->>'id', gen_random_uuid()::text),
    'created_at', coalesce(p_reservation->>'created_at', now()::text),
    'updated_at', coalesce(p_reservation->>'updated_at', now()::text)
  );
  insert into public.reservations
  select (jsonb_populate_record(null::public.reservations, v_payload)).* returning * into v_reservation;

  insert into public.reservation_table_locks (
    reservation_id, restaurant_id, table_id, starts_at, ends_at
  ) values (
    v_reservation.id, v_reservation.restaurant_id, p_table_id,
    v_reservation.starts_at, p_lock_ends_at
  );

  if p_deposit_log is not null then
    insert into public.reservation_deposit_logs
    select (jsonb_populate_record(null::public.reservation_deposit_logs,
      p_deposit_log || jsonb_build_object(
        'id', coalesce(p_deposit_log->>'id', gen_random_uuid()::text),
        'reservation_id', v_reservation.id,
        'restaurant_id', v_reservation.restaurant_id,
        'created_at', coalesce(p_deposit_log->>'created_at', now()::text),
        'transition_key', 'reservation:' || v_reservation.id::text || ':deposit-required'
      )
    )).*;
  end if;

  return v_reservation;
end;
$$;

revoke all on function public.create_reservation_with_lock(jsonb, uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.create_reservation_with_lock(jsonb, uuid, timestamptz, jsonb) to service_role;

-- One transaction for order, line items and the initial payment transition.
create or replace function public.create_order_with_items_atomic(
  p_order jsonb,
  p_items jsonb,
  p_payment_log jsonb default null
)
returns public.orders
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order public.orders;
  v_item jsonb;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  insert into public.orders
  select (jsonb_populate_record(null::public.orders,
    p_order || jsonb_build_object(
      'id', coalesce(p_order->>'id', gen_random_uuid()::text),
      'fulfillment_type', coalesce(p_order->>'fulfillment_type', 'DINE_IN'),
      'discount_amount', coalesce(p_order->'discount_amount', '0'::jsonb),
      'payment_status', coalesce(p_order->>'payment_status', 'unpaid'),
      'delivery_fee', coalesce(p_order->'delivery_fee', '0'::jsonb),
      'service_fee', coalesce(p_order->'service_fee', '0'::jsonb),
      'delivery_status', coalesce(p_order->>'delivery_status', 'none'),
      'created_at', coalesce(p_order->>'created_at', now()::text),
      'updated_at', coalesce(p_order->>'updated_at', now()::text)
    )
  )).* returning * into v_order;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    insert into public.order_items
    select (jsonb_populate_record(null::public.order_items,
      v_item || jsonb_build_object('order_id', v_order.id)
    )).*;
  end loop;

  if p_payment_log is not null then
    insert into public.payment_logs
    select (jsonb_populate_record(null::public.payment_logs,
      p_payment_log || jsonb_build_object(
        'id', coalesce(p_payment_log->>'id', gen_random_uuid()::text),
        'order_id', v_order.id,
        'created_at', coalesce(p_payment_log->>'created_at', now()::text),
        'transition_key', replace(coalesce(p_payment_log->>'transition_key', ''), 'order:pending:', 'order:' || v_order.id::text || ':')
      )
    )).*;
  end if;

  return v_order;
end;
$$;

revoke all on function public.create_order_with_items_atomic(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_order_with_items_atomic(jsonb, jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';
