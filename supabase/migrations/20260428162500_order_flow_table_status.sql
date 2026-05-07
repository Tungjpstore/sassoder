-- Aligns ordering with real restaurant flow: order first, pay after service.

alter table public.orders
  alter column payment_method drop not null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists accepted_at timestamptz,
  add column if not exists served_at timestamptz,
  add column if not exists service_due_at timestamptz;

create index if not exists orders_restaurant_table_status_due_idx
  on public.orders (restaurant_id, table_id, status, service_due_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists orders_set_updated_at on public.orders;

create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();
