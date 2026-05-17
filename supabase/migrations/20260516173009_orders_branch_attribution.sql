-- Durable branch attribution for orders.
-- AI Ops can use orders.branch_id directly instead of inferring from delivery snapshots.

alter table public.orders
  add column if not exists branch_id uuid references public.store_branches(id) on delete set null,
  add column if not exists branch_assignment_source text;

alter table public.orders
  drop constraint if exists orders_branch_assignment_source_check,
  add constraint orders_branch_assignment_source_check
    check (
      branch_assignment_source is null
      or branch_assignment_source in ('delivery_quote', 'single_branch', 'primary_branch', 'manual', 'legacy_backfill')
    );

create index if not exists orders_restaurant_branch_created_idx
  on public.orders (restaurant_id, branch_id, created_at desc)
  where branch_id is not null;

create index if not exists orders_restaurant_branch_status_created_idx
  on public.orders (restaurant_id, branch_id, status, created_at desc)
  where branch_id is not null;

update public.orders o
set
  branch_id = b.id,
  branch_assignment_source = 'delivery_quote'
from public.store_branches b
where o.branch_id is null
  and o.delivery_quote_snapshot is not null
  and o.delivery_quote_snapshot->'nearestStore'->>'id' = b.id::text
  and b.restaurant_id = o.restaurant_id;

with single_active_branch as (
  select restaurant_id, (array_agg(id order by created_at asc))[1] as branch_id
  from public.store_branches
  where is_active = true
  group by restaurant_id
  having count(*) = 1
)
update public.orders o
set
  branch_id = b.branch_id,
  branch_assignment_source = 'single_branch'
from single_active_branch b
where o.branch_id is null
  and o.restaurant_id = b.restaurant_id;

with primary_branch as (
  select distinct on (restaurant_id)
    restaurant_id,
    id as branch_id
  from public.store_branches
  where is_active = true
    and is_primary = true
  order by restaurant_id, created_at asc
)
update public.orders o
set
  branch_id = b.branch_id,
  branch_assignment_source = 'primary_branch'
from primary_branch b
where o.branch_id is null
  and o.restaurant_id = b.restaurant_id
  and o.fulfillment_type in ('DINE_IN', 'PICKUP');
