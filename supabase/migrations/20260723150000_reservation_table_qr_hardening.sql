-- Phase 3 containment: private customer realtime, fail-closed table QR access,
-- atomic QR revocation, and reservation branch/deposit invariants.

drop policy if exists "anon can receive customer order broadcasts" on realtime.messages;
drop trigger if exists orders_customer_status_broadcast on public.orders;
drop function if exists public.broadcast_customer_order_status();

alter table public.restaurants
  alter column allow_legacy_qr set default false;

update public.restaurants
set allow_legacy_qr = false
where allow_legacy_qr is distinct from false;

alter table public.tables
  alter column qr_token_enforced set default true;

update public.tables
set qr_token_enforced = true
where qr_token_enforced is distinct from true;

create or replace function public.rotate_table_qr_token(
  p_restaurant_id uuid,
  p_table_id uuid
)
returns setof public.tables
language plpgsql
security definer
set search_path = public
as $$
declare
  rotated public.tables%rowtype;
begin
  update public.tables t
  set qr_token_version = t.qr_token_version + 1,
      qr_token_enforced = true,
      qr_token_rotated_at = now()
  where t.id = p_table_id
    and t.restaurant_id = p_restaurant_id
  returning t.* into rotated;

  if not found then
    raise no_data_found using message = 'table not found for QR rotation';
  end if;

  return next rotated;
end;
$$;

create or replace function public.set_table_qr_enabled(
  p_restaurant_id uuid,
  p_table_id uuid,
  p_qr_enabled boolean
)
returns setof public.tables
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_table public.tables%rowtype;
begin
  update public.tables t
  set qr_enabled = p_qr_enabled,
      qr_token_version = case when p_qr_enabled then t.qr_token_version else t.qr_token_version + 1 end,
      qr_token_enforced = true,
      qr_token_rotated_at = case when p_qr_enabled then t.qr_token_rotated_at else now() end
  where t.id = p_table_id
    and t.restaurant_id = p_restaurant_id
  returning t.* into updated_table;

  if not found then
    raise no_data_found using message = 'table not found for QR status change';
  end if;

  return next updated_table;
end;
$$;

revoke all on function public.rotate_table_qr_token(uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_table_qr_enabled(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.rotate_table_qr_token(uuid, uuid) to service_role;
grant execute on function public.set_table_qr_enabled(uuid, uuid, boolean) to service_role;

create or replace function public.enforce_reservation_active_locks_single_branch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_branch_id uuid;
begin
  if new.status <> 'active' then
    return new;
  end if;

  select t.branch_id
  into target_branch_id
  from public.tables t
  where t.id = new.table_id
    and t.restaurant_id = new.restaurant_id;

  if not found then
    raise foreign_key_violation
      using message = 'reservation table must belong to the reservation restaurant',
            constraint = 'restaurant_scoped_table_assignment';
  end if;

  if exists (
    select 1
    from public.reservation_table_locks l
    join public.tables existing_table on existing_table.id = l.table_id
    where l.reservation_id = new.reservation_id
      and l.restaurant_id = new.restaurant_id
      and l.status = 'active'
      and l.id is distinct from new.id
      and existing_table.branch_id is distinct from target_branch_id
  ) then
    raise check_violation
      using message = 'active reservation tables must belong to one branch',
            constraint = 'reservation_active_locks_single_branch';
  end if;

  return new;
end;
$$;

create or replace function public.block_table_branch_change_with_active_reservations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.branch_id is distinct from old.branch_id
    and exists (
      select 1
      from public.reservation_table_locks l
      where l.table_id = old.id
        and l.restaurant_id = old.restaurant_id
        and l.status = 'active'
    )
  then
    raise check_violation
      using message = 'cannot move a table between branches while it has active reservation locks',
            constraint = 'table_branch_active_reservation_guard';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_reservation_active_locks_single_branch() from public, anon, authenticated;
revoke all on function public.block_table_branch_change_with_active_reservations() from public, anon, authenticated;

drop trigger if exists reservation_table_locks_enforce_single_branch on public.reservation_table_locks;
create trigger reservation_table_locks_enforce_single_branch
before insert or update of reservation_id, restaurant_id, table_id, status
on public.reservation_table_locks
for each row execute function public.enforce_reservation_active_locks_single_branch();

drop trigger if exists tables_block_branch_change_with_active_reservations on public.tables;
create trigger tables_block_branch_change_with_active_reservations
before update of branch_id on public.tables
for each row execute function public.block_table_branch_change_with_active_reservations();

create or replace function public.create_reservation_with_table_lock(
  p_reservation jsonb,
  p_table_id uuid,
  p_lock_ends_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation_id uuid;
  restaurant_id uuid := (p_reservation->>'restaurant_id')::uuid;
  starts_at timestamptz := (p_reservation->>'starts_at')::timestamptz;
  ends_at timestamptz := (p_reservation->>'ends_at')::timestamptz;
begin
  if p_lock_ends_at <= starts_at then
    raise check_violation using message = 'reservation lock end must be after reservation start';
  end if;

  insert into public.reservations (
    restaurant_id,
    status,
    customer_name,
    customer_phone,
    customer_email,
    party_size,
    starts_at,
    ends_at,
    hold_expires_at,
    deposit_required_amount,
    deposit_paid_amount,
    deposit_status,
    payment_method,
    customer_note,
    preferred_table_area_id,
    preferred_seating_zone,
    preferred_table_kind,
    source,
    access_token_hash,
    idempotency_key,
    confirmed_at
  ) values (
    restaurant_id,
    p_reservation->>'status',
    p_reservation->>'customer_name',
    p_reservation->>'customer_phone',
    nullif(p_reservation->>'customer_email', ''),
    (p_reservation->>'party_size')::integer,
    starts_at,
    ends_at,
    nullif(p_reservation->>'hold_expires_at', '')::timestamptz,
    (p_reservation->>'deposit_required_amount')::integer,
    (p_reservation->>'deposit_paid_amount')::integer,
    p_reservation->>'deposit_status',
    nullif(p_reservation->>'payment_method', '')::public.payment_method,
    nullif(p_reservation->>'customer_note', ''),
    nullif(p_reservation->>'preferred_table_area_id', '')::uuid,
    nullif(p_reservation->>'preferred_seating_zone', ''),
    nullif(p_reservation->>'preferred_table_kind', ''),
    coalesce(nullif(p_reservation->>'source', ''), 'PUBLIC'),
    p_reservation->>'access_token_hash',
    nullif(p_reservation->>'idempotency_key', ''),
    nullif(p_reservation->>'confirmed_at', '')::timestamptz
  )
  returning id into reservation_id;

  insert into public.reservation_table_locks (
    reservation_id,
    restaurant_id,
    table_id,
    starts_at,
    ends_at,
    status
  ) values (
    reservation_id,
    restaurant_id,
    p_table_id,
    starts_at,
    p_lock_ends_at,
    'active'
  );

  return reservation_id;
end;
$$;

create or replace function public.confirm_reservation_deposit_atomic(
  p_restaurant_id uuid,
  p_reservation_id uuid,
  p_transition_key text,
  p_source text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation_row public.reservations%rowtype;
begin
  select *
  into reservation_row
  from public.reservations r
  where r.id = p_reservation_id
    and r.restaurant_id = p_restaurant_id
  for update;

  if not found then
    raise no_data_found using message = 'reservation not found';
  end if;
  if reservation_row.deposit_status = 'paid' then
    return false;
  end if;
  if reservation_row.status <> 'waiting_deposit_confirm'
    or reservation_row.deposit_status <> 'waiting_confirm'
    or reservation_row.deposit_required_amount <= 0
  then
    return false;
  end if;

  update public.reservations
  set status = 'confirmed',
      deposit_status = 'paid',
      deposit_paid_amount = reservation_row.deposit_required_amount,
      confirmed_at = now(),
      hold_expires_at = null
  where id = p_reservation_id
    and restaurant_id = p_restaurant_id;

  insert into public.reservation_deposit_logs (
    reservation_id,
    restaurant_id,
    method,
    status,
    amount,
    transition_key,
    raw_data
  ) values (
    p_reservation_id,
    p_restaurant_id,
    coalesce(reservation_row.payment_method, 'QR'::public.payment_method),
    'confirmed'::public.payment_log_status,
    reservation_row.deposit_required_amount,
    p_transition_key,
    jsonb_build_object('source', p_source, 'transitionKey', p_transition_key)
  );

  return true;
end;
$$;

-- Serialize table reassignment through the reservation row. The previous
-- service-side read/update/insert sequence allowed two concurrent requests to
-- leave different target tables active for the same reservation.
create or replace function public.replace_reservation_table_locks_atomic(
  p_restaurant_id uuid,
  p_reservation_id uuid,
  p_table_ids uuid[],
  p_starts_at timestamptz,
  p_lock_ends_at timestamptz,
  p_reservation_starts_at timestamptz default null,
  p_reservation_ends_at timestamptz default null
)
returns setof public.reservation_table_locks
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation_row public.reservations%rowtype;
  target_table_id uuid;
  target_branch_id uuid;
  branch_id uuid;
  branch_initialized boolean := false;
  seen_table_ids uuid[] := '{}'::uuid[];
  existing_lock_id uuid;
begin
  if p_table_ids is null or cardinality(p_table_ids) = 0 then
    raise check_violation using message = 'reservation must keep at least one active table lock';
  end if;
  if p_starts_at >= p_lock_ends_at then
    raise check_violation using message = 'reservation lock window is invalid';
  end if;

  select *
  into reservation_row
  from public.reservations r
  where r.id = p_reservation_id
    and r.restaurant_id = p_restaurant_id
  for update;

  if not found then
    raise no_data_found using message = 'reservation not found';
  end if;

  if reservation_row.status in ('completed', 'cancelled', 'rejected', 'expired', 'no_show', 'seated') then
    raise check_violation using message = 'cannot reassign tables for a closed or seated reservation';
  end if;

  -- Lock the current set before calculating the replacement so a second
  -- reassignment waits and observes the first transaction's committed state.
  perform 1
  from public.reservation_table_locks l
  where l.reservation_id = p_reservation_id
    and l.restaurant_id = p_restaurant_id
    and l.status = 'active'
  for update;

  -- Release locks that are no longer targets before inserting a target from a
  -- different branch; the single-branch trigger must see only the new set.
  update public.reservation_table_locks l
  set status = 'released'
  where l.reservation_id = p_reservation_id
    and l.restaurant_id = p_restaurant_id
    and l.status = 'active'
    and not (l.table_id = any(p_table_ids));

  foreach target_table_id in array p_table_ids loop
    if target_table_id is null or target_table_id = any(seen_table_ids) then
      raise check_violation using message = 'reservation table ids must be unique and non-null';
    end if;
    seen_table_ids := array_append(seen_table_ids, target_table_id);

    select t.branch_id
    into target_branch_id
    from public.tables t
    where t.id = target_table_id
      and t.restaurant_id = p_restaurant_id;
    if not found then
      raise foreign_key_violation using message = 'reservation table does not belong to the restaurant';
    end if;

    if not branch_initialized then
      branch_id := target_branch_id;
      branch_initialized := true;
    elsif target_branch_id is distinct from branch_id then
      raise check_violation using message = 'active reservation tables must belong to one branch';
    end if;
  end loop;

  foreach target_table_id in array p_table_ids loop
    select l.id
    into existing_lock_id
    from public.reservation_table_locks l
    where l.reservation_id = p_reservation_id
      and l.restaurant_id = p_restaurant_id
      and l.table_id = target_table_id
      and l.status = 'active'
    for update;

    if found then
      update public.reservation_table_locks
      set starts_at = p_starts_at,
          ends_at = p_lock_ends_at
      where id = existing_lock_id;
    else
      insert into public.reservation_table_locks (
        reservation_id,
        restaurant_id,
        table_id,
        starts_at,
        ends_at,
        status
      ) values (
        p_reservation_id,
        p_restaurant_id,
        target_table_id,
        p_starts_at,
        p_lock_ends_at,
        'active'
      );
    end if;
  end loop;

  update public.reservations
  set starts_at = coalesce(p_reservation_starts_at, starts_at),
      ends_at = coalesce(p_reservation_ends_at, ends_at),
      updated_at = now()
  where id = p_reservation_id
    and restaurant_id = p_restaurant_id;

  return query
  select l.*
  from public.reservation_table_locks l
  where l.reservation_id = p_reservation_id
    and l.restaurant_id = p_restaurant_id
    and l.status = 'active'
  order by l.table_id;
end;
$$;

revoke all on function public.create_reservation_with_table_lock(jsonb, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.confirm_reservation_deposit_atomic(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.replace_reservation_table_locks_atomic(uuid, uuid, uuid[], timestamptz, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.create_reservation_with_table_lock(jsonb, uuid, timestamptz) to service_role;
grant execute on function public.confirm_reservation_deposit_atomic(uuid, uuid, text, text) to service_role;
grant execute on function public.replace_reservation_table_locks_atomic(uuid, uuid, uuid[], timestamptz, timestamptz, timestamptz, timestamptz) to service_role;
