-- Connect dine-in tables to physical branches so orders created from QR tables
-- can be attributed without guessing from restaurant-level defaults.

alter table public.tables
  add column if not exists branch_id uuid references public.store_branches(id) on delete set null;

create index if not exists tables_restaurant_branch_idx
  on public.tables (restaurant_id, branch_id, name)
  where branch_id is not null;

with single_active_branch as (
  select
    restaurant_id,
    (array_agg(id order by created_at asc))[1] as branch_id
  from public.store_branches
  where is_active = true
  group by restaurant_id
  having count(*) = 1
)
update public.tables t
set branch_id = b.branch_id
from single_active_branch b
where t.branch_id is null
  and t.restaurant_id = b.restaurant_id;

with primary_branch as (
  select distinct on (restaurant_id)
    restaurant_id,
    id as branch_id
  from public.store_branches
  where is_active = true
    and is_primary = true
  order by restaurant_id, created_at asc
)
update public.tables t
set branch_id = b.branch_id
from primary_branch b
where t.branch_id is null
  and t.restaurant_id = b.restaurant_id;
