alter table public.restaurants
  add column if not exists map_default_zoom integer not null default 14,
  add column if not exists map_display_style text not null default 'LIGHT',
  add column if not exists show_store_marker_on_ordering boolean not null default true,
  add column if not exists show_customer_distance boolean not null default true,
  add column if not exists delivery_area_mode text not null default 'RADIUS',
  add column if not exists delivery_area_name text,
  add column if not exists delivery_area_note text,
  add column if not exists delivery_area_polygon jsonb not null default '[]'::jsonb,
  add column if not exists delivery_area_ward_count integer not null default 0,
  add column if not exists delivery_exclusion_zones jsonb not null default '[]'::jsonb,
  add column if not exists delivery_fee_enabled boolean not null default true,
  add column if not exists delivery_fee_tiers jsonb not null default '[]'::jsonb,
  add column if not exists service_fee_enabled boolean not null default false,
  add column if not exists service_fee_type text not null default 'ORDER_PERCENT',
  add column if not exists service_fee_percent numeric(5,2) not null default 0,
  add column if not exists service_fee_min integer not null default 0,
  add column if not exists service_fee_max integer,
  add column if not exists allow_outside_delivery_area boolean not null default false,
  add column if not exists show_delivery_eta boolean not null default true,
  add column if not exists require_outside_area_confirmation boolean not null default true,
  add column if not exists auto_suggest_nearest_branch boolean not null default true;

alter table public.restaurants
  add constraint restaurants_map_display_style_check check (map_display_style in ('LIGHT', 'DARK')) not valid,
  add constraint restaurants_map_default_zoom_range check (map_default_zoom between 8 and 18) not valid,
  add constraint restaurants_delivery_area_mode_check check (delivery_area_mode in ('RADIUS', 'CUSTOM')) not valid,
  add constraint restaurants_delivery_area_json_check check (
    jsonb_typeof(delivery_area_polygon) = 'array'
    and jsonb_typeof(delivery_exclusion_zones) = 'array'
    and jsonb_typeof(delivery_fee_tiers) = 'array'
  ) not valid,
  add constraint restaurants_delivery_area_ward_count_range check (delivery_area_ward_count >= 0) not valid,
  add constraint restaurants_service_fee_check check (
    service_fee_type in ('ORDER_PERCENT')
    and service_fee_percent >= 0
    and service_fee_percent <= 100
    and service_fee_min >= 0
    and (service_fee_max is null or service_fee_max >= service_fee_min)
  ) not valid;

alter table public.restaurants validate constraint restaurants_map_display_style_check;
alter table public.restaurants validate constraint restaurants_map_default_zoom_range;
alter table public.restaurants validate constraint restaurants_delivery_area_mode_check;
alter table public.restaurants validate constraint restaurants_delivery_area_json_check;
alter table public.restaurants validate constraint restaurants_delivery_area_ward_count_range;
alter table public.restaurants validate constraint restaurants_service_fee_check;

alter table public.orders
  add column if not exists service_fee integer not null default 0;

alter table public.orders
  add constraint orders_service_fee_range check (service_fee >= 0) not valid;

alter table public.orders validate constraint orders_service_fee_range;

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
after insert or update of status, total, payment_method, payment_status, paid_at, delivery_status, delivery_distance_km, delivery_fee, service_fee, delivery_route_duration_minutes, delivery_tracking_updated_at, updated_at on public.orders
for each row execute function public.broadcast_customer_order_status();
