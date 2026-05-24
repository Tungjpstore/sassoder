-- Reservation tenant integrity guards.
-- Keep table assignments and reservation links inside the same restaurant even
-- when writes come from admin clients, retries, or future service paths.

create or replace function public.enforce_restaurant_scoped_table_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.tables t
    where t.id = new.table_id
      and t.restaurant_id = new.restaurant_id
  ) then
    raise foreign_key_violation
      using message = 'table assignment must belong to the same restaurant',
            constraint = 'restaurant_scoped_table_assignment';
  end if;

  if new.reservation_id is not null
    and not exists (
      select 1
      from public.reservations r
      where r.id = new.reservation_id
        and r.restaurant_id = new.restaurant_id
    )
  then
    raise foreign_key_violation
      using message = 'reservation assignment must belong to the same restaurant',
            constraint = 'restaurant_scoped_reservation_assignment';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_restaurant_scoped_table_assignment() from public, anon, authenticated;

drop trigger if exists reservation_table_locks_enforce_restaurant_scope on public.reservation_table_locks;
create trigger reservation_table_locks_enforce_restaurant_scope
before insert or update of restaurant_id, table_id, reservation_id
on public.reservation_table_locks
for each row execute function public.enforce_restaurant_scoped_table_assignment();

drop trigger if exists table_bills_enforce_restaurant_scope on public.table_bills;
create trigger table_bills_enforce_restaurant_scope
before insert or update of restaurant_id, table_id, reservation_id
on public.table_bills
for each row execute function public.enforce_restaurant_scoped_table_assignment();
