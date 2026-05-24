alter table public.orders
  add column if not exists delivery_route_provider text,
  add column if not exists delivery_route_confidence text,
  add column if not exists delivery_quote_version text,
  add column if not exists delivery_quote_snapshot jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_delivery_route_provider_check'
  ) then
    alter table public.orders
      add constraint orders_delivery_route_provider_check
      check (
        delivery_route_provider is null
        or delivery_route_provider in ('goong', 'vietmap', 'osrm', 'mapbox', 'haversine')
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'orders_delivery_route_confidence_check'
  ) then
    alter table public.orders
      add constraint orders_delivery_route_confidence_check
      check (
        delivery_route_confidence is null
        or delivery_route_confidence in ('high', 'medium', 'low')
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'orders_delivery_quote_snapshot_check'
  ) then
    alter table public.orders
      add constraint orders_delivery_quote_snapshot_check
      check (
        delivery_quote_snapshot is null
        or jsonb_typeof(delivery_quote_snapshot) = 'object'
      );
  end if;
end $$;

create index if not exists orders_delivery_route_provider_idx
  on public.orders (restaurant_id, delivery_route_provider)
  where delivery_route_provider is not null;

create index if not exists orders_delivery_quote_version_idx
  on public.orders (restaurant_id, delivery_quote_version)
  where delivery_quote_version is not null;

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
      'service_fee', new.service_fee,
      'delivery_route_duration_minutes', new.delivery_route_duration_minutes,
      'delivery_route_provider', new.delivery_route_provider,
      'delivery_route_confidence', new.delivery_route_confidence,
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
after insert or update of status, total, payment_method, payment_status, paid_at, delivery_status, delivery_distance_km, delivery_fee, service_fee, delivery_route_duration_minutes, delivery_route_provider, delivery_route_confidence, delivery_tracking_updated_at, updated_at on public.orders
for each row execute function public.broadcast_customer_order_status();
