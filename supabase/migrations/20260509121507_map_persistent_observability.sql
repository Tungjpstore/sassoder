create table if not exists public.map_provider_request_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete set null,
  restaurant_slug text,
  source text,
  operation text not null,
  provider text not null,
  outcome text not null,
  status_code integer,
  latency_ms integer not null default 0,
  estimated_cost_vnd numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  constraint map_provider_request_logs_operation_check
    check (operation in ('geocode', 'reverse', 'route')),
  constraint map_provider_request_logs_provider_check
    check (provider in ('goong', 'vietmap', 'mapbox', 'nominatim', 'osrm')),
  constraint map_provider_request_logs_outcome_check
    check (outcome in ('success', 'http_error', 'timeout', 'error', 'empty')),
  constraint map_provider_request_logs_latency_check
    check (latency_ms >= 0)
);

create table if not exists public.map_cache_event_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete set null,
  restaurant_slug text,
  source text,
  operation text not null,
  namespace text not null,
  hit boolean not null,
  created_at timestamptz not null default now(),
  constraint map_cache_event_logs_operation_check
    check (operation in ('geocode', 'reverse', 'route', 'delivery_quote'))
);

create table if not exists public.delivery_quote_metric_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete set null,
  restaurant_slug text not null,
  accepted boolean not null,
  provider text not null,
  route_provider text,
  confidence text,
  is_estimated boolean,
  distance_km numeric(8,2),
  fee integer,
  latency_ms integer not null default 0,
  created_at timestamptz not null default now(),
  constraint delivery_quote_metric_logs_provider_check
    check (provider in ('goong', 'vietmap', 'mapbox', 'nominatim', 'osrm', 'manual', 'browser-location+haversine')),
  constraint delivery_quote_metric_logs_route_provider_check
    check (route_provider is null or route_provider in ('goong', 'vietmap', 'mapbox', 'osrm', 'haversine')),
  constraint delivery_quote_metric_logs_confidence_check
    check (confidence is null or confidence in ('high', 'medium', 'low')),
  constraint delivery_quote_metric_logs_latency_check
    check (latency_ms >= 0)
);

alter table public.map_provider_request_logs enable row level security;
alter table public.map_cache_event_logs enable row level security;
alter table public.delivery_quote_metric_logs enable row level security;

create index if not exists map_provider_request_logs_restaurant_created_idx
  on public.map_provider_request_logs (restaurant_id, created_at desc);

create index if not exists map_provider_request_logs_provider_created_idx
  on public.map_provider_request_logs (provider, operation, created_at desc);

create index if not exists map_cache_event_logs_restaurant_created_idx
  on public.map_cache_event_logs (restaurant_id, created_at desc);

create index if not exists delivery_quote_metric_logs_restaurant_created_idx
  on public.delivery_quote_metric_logs (restaurant_id, created_at desc);

create index if not exists delivery_quote_metric_logs_slug_created_idx
  on public.delivery_quote_metric_logs (restaurant_slug, created_at desc);
