-- Phase 2 fix-forward: enforce reservation tenant/branch integrity at the table boundary.

create or replace function public.enforce_inventory_reservation_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  order_record public.orders;
begin
  select * into order_record
  from public.orders
  where id = new.order_id;

  if not found
    or order_record.restaurant_id is distinct from new.restaurant_id
    or order_record.branch_id is distinct from new.branch_id then
    raise exception 'Inventory reservation order scope mismatch';
  end if;

  if not exists (
    select 1
    from public.ingredients ingredient
    where ingredient.id = new.ingredient_id
      and ingredient.restaurant_id = new.restaurant_id
  ) then
    raise exception 'Inventory reservation ingredient scope mismatch';
  end if;

  if new.location_id is not null and not exists (
    select 1
    from public.inventory_locations location
    where location.id = new.location_id
      and location.restaurant_id = new.restaurant_id
      and location.branch_id is not distinct from new.branch_id
  ) then
    raise exception 'Inventory reservation location scope mismatch';
  end if;

  if new.batch_id is not null and not exists (
    select 1
    from public.inventory_batches batch
    where batch.id = new.batch_id
      and batch.restaurant_id = new.restaurant_id
      and batch.ingredient_id = new.ingredient_id
  ) then
    raise exception 'Inventory reservation batch scope mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_reservations_scope_guard on public.inventory_reservations;
create trigger inventory_reservations_scope_guard
before insert or update of restaurant_id, order_id, ingredient_id, branch_id, location_id, batch_id
on public.inventory_reservations
for each row execute function public.enforce_inventory_reservation_scope();

revoke all privileges on table public.inventory_reservations from service_role;
grant select on table public.inventory_reservations to service_role;

notify pgrst, 'reload schema';
