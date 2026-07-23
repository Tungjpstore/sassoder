-- Phase 1 financial transaction boundary. This migration is intentionally
-- forward-only; application cutover happens only after an isolated DB rehearsal.

do $phase1_preflight$
declare
  v_cross_tenant_links bigint;
begin
  select count(*)
  into v_cross_tenant_links
  from public.orders orders
  join public.table_bills bills on bills.id = orders.bill_id
  where orders.bill_id is not null
    and orders.restaurant_id is distinct from bills.restaurant_id;

  if v_cross_tenant_links > 0 then
    raise exception 'Found % cross-tenant order-to-bill links; repair and rerun the migration', v_cross_tenant_links;
  end if;

  select count(*)
  into v_cross_tenant_links
  from public.payment_logs payments
  join public.orders orders on orders.id = payments.order_id
  join public.table_bills bills on bills.id = payments.bill_id
  where payments.bill_id is not null
    and (
      orders.restaurant_id is distinct from bills.restaurant_id
      or orders.bill_id is distinct from payments.bill_id
    );

  if v_cross_tenant_links > 0 then
    raise exception 'Found % cross-tenant payment-to-bill links; repair and rerun the migration', v_cross_tenant_links;
  end if;
end
$phase1_preflight$;

set lock_timeout = '5s';
set statement_timeout = '5min';

alter table public.orders
  add column if not exists state_version bigint not null default 0,
  add column if not exists request_fingerprint text;

alter table public.table_bills
  add column if not exists state_version bigint not null default 0;

alter table public.payment_logs
  add column if not exists restaurant_id uuid,
  add column if not exists request_fingerprint text;

-- Keep legacy service callers safe while making tenant ownership mandatory.
create or replace function public.populate_payment_log_restaurant_id()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order_restaurant_id uuid;
begin
  select orders.restaurant_id
  into v_order_restaurant_id
  from public.orders orders
  where orders.id = new.order_id
  for key share;

  if v_order_restaurant_id is null then
    raise exception using errcode = '23503', message = 'PAYMENT_LOG_ORDER_NOT_FOUND';
  end if;

  if new.restaurant_id is null then
    new.restaurant_id := v_order_restaurant_id;
  elsif new.restaurant_id is distinct from v_order_restaurant_id then
    raise exception using errcode = '23514', message = 'PAYMENT_LOG_TENANT_MISMATCH';
  end if;

  return new;
end;
$$;

drop trigger if exists payment_logs_populate_restaurant_id on public.payment_logs;
create trigger payment_logs_populate_restaurant_id
before insert or update on public.payment_logs
for each row execute function public.populate_payment_log_restaurant_id();

revoke all on function public.populate_payment_log_restaurant_id() from public, anon, authenticated;
grant execute on function public.populate_payment_log_restaurant_id() to service_role;

update public.payment_logs payments
set restaurant_id = orders.restaurant_id
from public.orders orders
where orders.id = payments.order_id
  and payments.restaurant_id is null;

do $phase1_payment_preflight$
declare
  v_invalid_payments bigint;
begin
  select count(*)
  into v_invalid_payments
  from public.payment_logs payments
  left join public.orders orders on orders.id = payments.order_id
  where payments.restaurant_id is null
    or orders.id is null
    or payments.restaurant_id is distinct from orders.restaurant_id;

  if v_invalid_payments > 0 then
    raise exception 'Found % payment logs without a valid restaurant-scoped order; repair and rerun the migration', v_invalid_payments;
  end if;
end
$phase1_payment_preflight$;

alter table public.payment_logs
  alter column restaurant_id set not null;

do $phase1_constraints$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_restaurant_id_id_key'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_restaurant_id_id_key unique (restaurant_id, id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'table_bills_restaurant_id_id_key'
      and conrelid = 'public.table_bills'::regclass
  ) then
    alter table public.table_bills
      add constraint table_bills_restaurant_id_id_key unique (restaurant_id, id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'payment_logs_restaurant_order_fkey'
      and conrelid = 'public.payment_logs'::regclass
  ) then
    alter table public.payment_logs
      add constraint payment_logs_restaurant_order_fkey
      foreign key (restaurant_id, order_id)
      references public.orders (restaurant_id, id)
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'payment_logs_restaurant_bill_fkey'
      and conrelid = 'public.payment_logs'::regclass
  ) then
    alter table public.payment_logs
      add constraint payment_logs_restaurant_bill_fkey
      foreign key (restaurant_id, bill_id)
      references public.table_bills (restaurant_id, id)
      not valid;
  end if;
end
$phase1_constraints$;

alter table public.payment_logs
  validate constraint payment_logs_restaurant_order_fkey;

alter table public.payment_logs
  validate constraint payment_logs_restaurant_bill_fkey;

create or replace function public.bump_order_state_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.state_version is null or new.state_version = old.state_version then
    new.state_version := old.state_version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_bump_state_version on public.orders;
create trigger orders_bump_state_version
before update on public.orders
for each row execute function public.bump_order_state_version();

create or replace function public.bump_table_bill_state_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.state_version is null or new.state_version = old.state_version then
    new.state_version := old.state_version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists table_bills_bump_state_version on public.table_bills;
create trigger table_bills_bump_state_version
before update on public.table_bills
for each row execute function public.bump_table_bill_state_version();

revoke all on function public.bump_order_state_version() from public, anon, authenticated;
revoke all on function public.bump_table_bill_state_version() from public, anon, authenticated;
grant execute on function public.bump_order_state_version() to service_role;
grant execute on function public.bump_table_bill_state_version() to service_role;

create index if not exists payment_logs_restaurant_order_created_idx
  on public.payment_logs (restaurant_id, order_id, created_at desc);

create index if not exists payment_logs_restaurant_bill_created_idx
  on public.payment_logs (restaurant_id, bill_id, created_at desc)
  where bill_id is not null;

create table if not exists public.financial_transaction_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  operation text not null,
  idempotency_key text not null,
  request_fingerprint text not null,
  response_payload jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint financial_transaction_requests_operation_check
    check (operation in ('create_online_order', 'checkout_bill', 'transition_payment')),
  constraint financial_transaction_requests_idempotency_key_check
    check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$'),
  constraint financial_transaction_requests_fingerprint_check
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint financial_transaction_requests_response_check
    check (response_payload is null or jsonb_typeof(response_payload) = 'object'),
  unique (restaurant_id, operation, idempotency_key)
);

create index if not exists financial_transaction_requests_created_idx
  on public.financial_transaction_requests (restaurant_id, created_at desc);

alter table public.financial_transaction_requests enable row level security;

revoke all on table public.financial_transaction_requests from public, anon, authenticated;
grant select, insert, update, delete on table public.financial_transaction_requests to service_role;

revoke insert, update, delete on table
  public.orders,
  public.order_items,
  public.table_bills,
  public.payment_logs
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.orders,
  public.order_items,
  public.table_bills,
  public.payment_logs
to service_role;

create or replace function public.create_online_order_atomic(
  p_restaurant_id uuid,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_order jsonb,
  p_items jsonb,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.financial_transaction_requests%rowtype;
  v_order public.orders%rowtype;
  v_bill public.table_bills%rowtype;
  v_waiting_bill public.table_bills%rowtype;
  v_payment public.payment_logs%rowtype;
  v_item record;
  v_order_id uuid;
  v_bill_id uuid;
  v_table_id uuid;
  v_branch_id uuid;
  v_promotion_id uuid;
  v_promotion public.promotions%rowtype;
  v_promotion_channel text;
  v_expected_discount integer := 0;
  v_promotion_eligible bigint := 0;
  v_free_item_id uuid;
  v_free_item_quantity integer;
  v_promotion_usage integer;
  v_promotion_customer_key text;
  v_fulfillment_type text;
  v_initial_payment_status text;
  v_menu_price integer;
  v_menu_available boolean;
  v_modifier record;
  v_modifier_group_id uuid;
  v_modifier_option_id uuid;
  v_modifier_option_group_id uuid;
  v_modifier_quantity integer;
  v_modifier_line_total integer;
  v_modifier_price_delta integer;
  v_modifier_price_value integer;
  v_modifier_total_calculated integer;
  v_modifier_pricing_mode text;
  v_subtotal integer;
  v_discount_amount integer;
  v_delivery_fee integer;
  v_service_fee integer;
  v_total integer;
  v_item_subtotal bigint := 0;
  v_response jsonb;
begin
  if p_restaurant_id is null
    or p_idempotency_key is null
    or p_request_fingerprint is null
    or p_order is null
    or p_items is null
    or jsonb_typeof(p_order) <> 'object'
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0
  then
    raise exception using errcode = '22023', message = 'INVALID_ORDER_TRANSACTION_REQUEST';
  end if;

  perform 1
  from public.restaurants restaurants
  where restaurants.id = p_restaurant_id
  for key share;

  if not found then
    raise exception using errcode = 'P0002', message = 'RESTAURANT_NOT_FOUND';
  end if;

  insert into public.financial_transaction_requests (
    restaurant_id,
    operation,
    idempotency_key,
    request_fingerprint
  )
  values (
    p_restaurant_id,
    'create_online_order',
    p_idempotency_key,
    p_request_fingerprint
  )
  on conflict (restaurant_id, operation, idempotency_key) do nothing;

  select requests.*
  into v_request
  from public.financial_transaction_requests requests
  where requests.restaurant_id = p_restaurant_id
    and requests.operation = 'create_online_order'
    and requests.idempotency_key = p_idempotency_key
  for update;

  if v_request.request_fingerprint is distinct from p_request_fingerprint then
    raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_FINGERPRINT_MISMATCH';
  end if;

  if v_request.response_payload is not null then
    return jsonb_set(v_request.response_payload, '{idempotentReplay}', 'true'::jsonb, true);
  end if;

  v_order_id := coalesce(nullif(p_order->>'id', '')::uuid, gen_random_uuid());
  v_bill_id := nullif(p_order->>'bill_id', '')::uuid;
  v_table_id := nullif(p_order->>'table_id', '')::uuid;
  v_branch_id := nullif(p_order->>'branch_id', '')::uuid;
  v_promotion_id := nullif(p_order->>'promotion_id', '')::uuid;
  v_fulfillment_type := coalesce(nullif(p_order->>'fulfillment_type', ''), 'DINE_IN');
  v_initial_payment_status := coalesce(nullif(p_order->>'payment_status', ''), 'unpaid');
  v_subtotal := (p_order->>'subtotal')::integer;
  v_discount_amount := coalesce((p_order->>'discount_amount')::integer, 0);
  v_delivery_fee := coalesce((p_order->>'delivery_fee')::integer, 0);
  v_service_fee := coalesce((p_order->>'service_fee')::integer, 0);
  v_total := (p_order->>'total')::integer;

  if v_fulfillment_type not in ('DINE_IN', 'PICKUP', 'DELIVERY')
    or v_initial_payment_status not in ('unpaid', 'waiting_payment')
    or v_subtotal is null
    or v_total is null
    or v_subtotal < 0
    or v_discount_amount < 0
    or v_discount_amount > v_subtotal
    or v_delivery_fee < 0
    or v_service_fee < 0
    or v_total <> v_subtotal - v_discount_amount
    or (v_initial_payment_status = 'waiting_payment' and nullif(p_order->>'payment_method', '') is distinct from 'QR')
  then
    raise exception using errcode = '22023', message = 'INVALID_ORDER_TOTAL_OR_PAYMENT_STATE';
  end if;

  if v_fulfillment_type = 'DINE_IN' and v_table_id is null then
    raise exception using errcode = '22023', message = 'DINE_IN_TABLE_REQUIRED';
  end if;

  if v_fulfillment_type <> 'DINE_IN' and (v_table_id is not null or v_bill_id is not null) then
    raise exception using errcode = '22023', message = 'REMOTE_ORDER_CANNOT_ATTACH_TABLE_BILL';
  end if;

  if v_table_id is not null then
    perform 1
    from public.tables tables
    where tables.id = v_table_id
      and tables.restaurant_id = p_restaurant_id
    for update;
    if not found then
      raise exception using errcode = '23503', message = 'INVALID_RESTAURANT_TABLE';
    end if;

    if v_fulfillment_type = 'DINE_IN' and v_bill_id is null then
      select bills.*
      into v_waiting_bill
      from public.table_bills bills
      where bills.restaurant_id = p_restaurant_id
        and bills.table_id = v_table_id
        and bills.status in ('waiting_payment', 'waiting_confirm')
      order by bills.created_at desc
      limit 1
      for update;

      if found then
        raise exception using errcode = 'P0001', message = 'TABLE_BILL_AWAITING_PAYMENT';
      end if;

      select bills.*
      into v_bill
      from public.table_bills bills
      where bills.restaurant_id = p_restaurant_id
        and bills.table_id = v_table_id
        and bills.status = 'open'
      order by bills.created_at desc
      limit 1
      for update;

      if found then
        v_bill_id := v_bill.id;
      else
        insert into public.table_bills (
          restaurant_id,
          table_id,
          customer_session_id,
          status
        )
        values (
          p_restaurant_id,
          v_table_id,
          nullif(p_order->>'customer_session_id', ''),
          'open'
        )
        returning * into v_bill;
        v_bill_id := v_bill.id;
      end if;
    end if;
  end if;

  if v_branch_id is not null and not exists (
    select 1
    from public.store_branches branches
    where branches.id = v_branch_id
      and branches.restaurant_id = p_restaurant_id
  ) then
    raise exception using errcode = '23503', message = 'INVALID_RESTAURANT_BRANCH';
  end if;

  if v_promotion_id is not null and not exists (
    select 1
    from public.promotions promotions
    where promotions.id = v_promotion_id
      and promotions.restaurant_id = p_restaurant_id
  ) then
    raise exception using errcode = '23503', message = 'INVALID_RESTAURANT_PROMOTION';
  end if;

  if v_promotion_id is null and nullif(p_order->>'promotion_code', '') is not null then
    raise exception using errcode = '22023', message = 'PROMOTION_ID_REQUIRED';
  end if;

  if v_bill_id is not null then
    select bills.*
    into v_bill
    from public.table_bills bills
    where bills.id = v_bill_id
      and bills.restaurant_id = p_restaurant_id
    for update;

    if not found then
      raise exception using
        errcode = '23503',
        message = 'INVALID_SAME_TENANT_BILL_ATTACHMENT',
        detail = 'same-tenant bill attachment is required';
    end if;

    if v_bill.status <> 'open' then
      raise exception using errcode = 'P0001', message = 'BILL_NOT_OPEN';
    end if;

    if v_bill.table_id is distinct from v_table_id then
      raise exception using
        errcode = '23503',
        message = 'INVALID_SAME_TENANT_BILL_ATTACHMENT',
        detail = 'same-tenant bill attachment must target the same table';
    end if;
  end if;

  for v_item in
    select parsed.*
    from jsonb_to_recordset(p_items) as parsed(
      menu_item_id uuid,
      quantity integer,
      price integer,
      base_price integer,
      modifier_total integer,
      modifier_snapshot jsonb,
      note text
    )
  loop
    select menu_items.price, menu_items.is_available
    into v_menu_price, v_menu_available
    from public.menu_items menu_items
    where menu_items.id = v_item.menu_item_id
      and menu_items.restaurant_id = p_restaurant_id
    for key share;

    if v_item.menu_item_id is null
      or coalesce(v_item.quantity, 0) <= 0
      or coalesce(v_item.price, 0) <= 0
      or coalesce(v_item.base_price, v_item.price, 0) <= 0
      or coalesce(v_item.modifier_total, 0) < 0
      or v_menu_price is null
      or v_menu_available is distinct from true
      or coalesce(v_item.base_price, v_item.price) <> v_menu_price
      or v_item.price <> coalesce(v_item.base_price, v_item.price) + coalesce(v_item.modifier_total, 0)
    then
      raise exception using errcode = '22023', message = 'CANONICAL_MENU_PRICE_MISMATCH';
    end if;

    if v_item.modifier_snapshot is not null
      and jsonb_typeof(v_item.modifier_snapshot) <> 'array'
    then
      raise exception using errcode = '22023', message = 'MODIFIER_PRICE_MISMATCH';
    end if;

    v_modifier_total_calculated := 0;
    for v_modifier in
      select selections.value
      from jsonb_array_elements(coalesce(v_item.modifier_snapshot, '[]'::jsonb)) selections(value)
    loop
      v_modifier_group_id := nullif(v_modifier.value->>'groupId', '')::uuid;
      v_modifier_option_id := nullif(v_modifier.value->>'optionId', '')::uuid;
      v_modifier_quantity := coalesce(nullif(v_modifier.value->>'quantity', '')::integer, 1);

      select
        options.group_id,
        options.price_delta,
        coalesce(options.pricing_mode, 'DELTA'),
        options.price_value
      into
        v_modifier_option_group_id,
        v_modifier_price_delta,
        v_modifier_pricing_mode,
        v_modifier_price_value
      from public.menu_modifier_options options
      join public.menu_modifier_groups groups on groups.id = options.group_id
      where options.id = v_modifier_option_id
        and options.restaurant_id = p_restaurant_id
        and options.is_available = true
        and groups.restaurant_id = p_restaurant_id
        and groups.menu_item_id = v_item.menu_item_id
        and groups.is_active = true
      for key share of options, groups;

      if v_modifier_option_group_id is null
        or v_modifier_group_id is distinct from v_modifier_option_group_id
        or v_modifier_quantity <= 0
      then
        raise exception using errcode = '22023', message = 'MODIFIER_PRICE_MISMATCH';
      end if;

      v_modifier_price_delta := case
        when v_modifier_pricing_mode = 'ABSOLUTE' and coalesce(v_modifier_price_value, 0) > 0
          then v_modifier_price_value - v_menu_price
        else v_modifier_price_delta
      end;
      v_modifier_line_total := v_modifier_price_delta * v_modifier_quantity;

      if (v_modifier.value ? 'priceDelta'
          and nullif(v_modifier.value->>'priceDelta', '')::integer is distinct from v_modifier_price_delta)
        or (v_modifier.value ? 'pricingMode'
          and nullif(v_modifier.value->>'pricingMode', '') is distinct from v_modifier_pricing_mode)
        or (v_modifier.value ? 'priceValue'
          and nullif(v_modifier.value->>'priceValue', '')::integer is distinct from v_modifier_price_value)
        or (v_modifier.value ? 'lineTotal'
          and nullif(v_modifier.value->>'lineTotal', '')::integer is distinct from v_modifier_line_total)
      then
        raise exception using errcode = '22023', message = 'MODIFIER_PRICE_MISMATCH';
      end if;

      v_modifier_total_calculated := v_modifier_total_calculated + v_modifier_line_total;
    end loop;

    if v_modifier_total_calculated <> coalesce(v_item.modifier_total, 0) then
      raise exception using errcode = '22023', message = 'MODIFIER_PRICE_MISMATCH';
    end if;

    v_item_subtotal := v_item_subtotal + (v_item.price::bigint * v_item.quantity::bigint);
  end loop;

  if v_item_subtotal + v_delivery_fee::bigint + v_service_fee::bigint <> v_subtotal::bigint then
    raise exception using errcode = '22023', message = 'ORDER_TOTAL_MISMATCH';
  end if;

  if v_promotion_id is not null then
    select promotions.*
    into v_promotion
    from public.promotions promotions
    where promotions.id = v_promotion_id
      and promotions.restaurant_id = p_restaurant_id
    for update;

    v_promotion_channel := case when v_fulfillment_type = 'DINE_IN' then 'QR_MENU' else 'WEBSITE' end;
    if v_promotion.id is null
      or v_promotion.is_active is distinct from true
      or not (v_promotion.channels @> array[v_promotion_channel]::text[])
      or (v_promotion.starts_at is not null and v_promotion.starts_at > clock_timestamp())
      or (v_promotion.ends_at is not null and v_promotion.ends_at < clock_timestamp())
      or upper(coalesce(v_promotion.code, '')) is distinct from upper(nullif(p_order->>'promotion_code', ''))
      or v_item_subtotal < v_promotion.min_order_amount
    then
      raise exception using errcode = '22023', message = 'PROMOTION_NOT_CANONICAL';
    end if;

    if v_promotion.total_usage_limit is not null then
      select count(*)::integer
      into v_promotion_usage
      from public.orders orders
      where orders.restaurant_id = p_restaurant_id
        and orders.promotion_id = v_promotion_id
        and orders.status <> 'cancelled';

      if v_promotion_usage >= v_promotion.total_usage_limit then
        raise exception using errcode = 'P0001', message = 'PROMOTION_USAGE_LIMIT_REACHED';
      end if;
    end if;

    if v_promotion.per_customer_usage_limit is not null then
      v_promotion_customer_key := nullif(p_order->>'promotion_customer_key_hash', '');
      if v_promotion_customer_key is null then
        raise exception using errcode = '22023', message = 'PROMOTION_CUSTOMER_IDENTITY_REQUIRED';
      end if;

      select count(*)::integer
      into v_promotion_usage
      from public.orders orders
      where orders.restaurant_id = p_restaurant_id
        and orders.promotion_id = v_promotion_id
        and orders.promotion_customer_key_hash = v_promotion_customer_key
        and orders.status <> 'cancelled';

      if v_promotion_usage >= v_promotion.per_customer_usage_limit then
        raise exception using errcode = 'P0001', message = 'PROMOTION_USAGE_LIMIT_REACHED';
      end if;
    end if;

    if v_promotion.reward_type = 'FREE_ITEM' then
      v_free_item_id := v_promotion.free_item_menu_item_id;
      v_free_item_quantity := greatest(1, coalesce(v_promotion.free_item_quantity, 1));
      select coalesce(sum((parsed.price::bigint * least(parsed.quantity, v_free_item_quantity))::bigint), 0)
      into v_promotion_eligible
      from jsonb_to_recordset(p_items) as parsed(
        menu_item_id uuid,
        quantity integer,
        price integer,
        base_price integer,
        modifier_total integer,
        modifier_snapshot jsonb,
        note text
      )
      where parsed.menu_item_id = v_free_item_id
        and parsed.quantity > 0;
      v_expected_discount := least(v_item_subtotal::integer, v_promotion_eligible::integer);
    elsif v_promotion.discount_scope = 'DELIVERY_FEE' then
      v_promotion_eligible := v_delivery_fee;
      v_expected_discount := case
        when v_promotion.discount_type = 'PERCENT'
          then least(v_promotion_eligible::integer, round(v_promotion_eligible * v_promotion.discount_value / 100.0)::integer)
        else least(v_promotion_eligible::integer, v_promotion.discount_value)
      end;
    else
      v_promotion_eligible := v_item_subtotal;
      v_expected_discount := case
        when v_promotion.discount_type = 'PERCENT'
          then least(v_promotion_eligible::integer, round(v_promotion_eligible * v_promotion.discount_value / 100.0)::integer)
        else least(v_promotion_eligible::integer, v_promotion.discount_value)
      end;
    end if;

    if v_promotion_eligible <= 0 or v_discount_amount <> v_expected_discount then
      raise exception using errcode = '22023', message = 'PROMOTION_DISCOUNT_MISMATCH';
    end if;
  end if;

  insert into public.orders (
    id,
    restaurant_id,
    table_id,
    bill_id,
    branch_id,
    branch_assignment_source,
    fulfillment_type,
    status,
    subtotal,
    discount_amount,
    promotion_id,
    promotion_code,
    promotion_customer_key_hash,
    total,
    payment_method,
    payment_status,
    customer_session_id,
    customer_note,
    customer_name,
    customer_phone,
    delivery_address,
    delivery_lat,
    delivery_lng,
    delivery_distance_km,
    delivery_fee,
    service_fee,
    delivery_status,
    delivery_route_provider,
    delivery_route_confidence,
    delivery_route_geometry,
    delivery_route_duration_minutes,
    delivery_quote_version,
    delivery_quote_snapshot,
    delivery_tracking_updated_at,
    idempotency_key,
    request_fingerprint,
    state_version
  )
  values (
    v_order_id,
    p_restaurant_id,
    v_table_id,
    v_bill_id,
    v_branch_id,
    nullif(p_order->>'branch_assignment_source', ''),
    v_fulfillment_type,
    case
      when v_initial_payment_status = 'waiting_payment' then 'waiting_payment'::public.order_status
      else 'pending'::public.order_status
    end,
    v_subtotal,
    v_discount_amount,
    v_promotion_id,
    nullif(p_order->>'promotion_code', ''),
    nullif(p_order->>'promotion_customer_key_hash', ''),
    v_total,
    nullif(p_order->>'payment_method', '')::public.payment_method,
    v_initial_payment_status,
    nullif(p_order->>'customer_session_id', ''),
    nullif(p_order->>'customer_note', ''),
    nullif(p_order->>'customer_name', ''),
    nullif(p_order->>'customer_phone', ''),
    nullif(p_order->>'delivery_address', ''),
    nullif(p_order->>'delivery_lat', '')::double precision,
    nullif(p_order->>'delivery_lng', '')::double precision,
    nullif(p_order->>'delivery_distance_km', '')::double precision,
    v_delivery_fee,
    v_service_fee,
    coalesce(nullif(p_order->>'delivery_status', ''), 'none'),
    nullif(p_order->>'delivery_route_provider', ''),
    nullif(p_order->>'delivery_route_confidence', ''),
    nullif(p_order->'delivery_route_geometry', 'null'::jsonb),
    nullif(p_order->>'delivery_route_duration_minutes', '')::integer,
    nullif(p_order->>'delivery_quote_version', ''),
    nullif(p_order->'delivery_quote_snapshot', 'null'::jsonb),
    nullif(p_order->>'delivery_tracking_updated_at', '')::timestamptz,
    p_idempotency_key,
    p_request_fingerprint,
    0
  )
  returning * into v_order;

  insert into public.order_items (
    order_id,
    menu_item_id,
    quantity,
    price,
    base_price,
    modifier_total,
    modifier_snapshot,
    note
  )
  select
    v_order.id,
    parsed.menu_item_id,
    parsed.quantity,
    parsed.price,
    coalesce(parsed.base_price, parsed.price),
    coalesce(parsed.modifier_total, 0),
    coalesce(parsed.modifier_snapshot, '[]'::jsonb),
    nullif(parsed.note, '')
  from jsonb_to_recordset(p_items) as parsed(
    menu_item_id uuid,
    quantity integer,
    price integer,
    base_price integer,
    modifier_total integer,
    modifier_snapshot jsonb,
    note text
  );

  if v_initial_payment_status = 'waiting_payment' then
    insert into public.payment_logs (
      restaurant_id,
      order_id,
      bill_id,
      method,
      status,
      amount,
      transition_key,
      request_fingerprint,
      raw_data
    )
    values (
      p_restaurant_id,
      v_order.id,
      v_order.bill_id,
      'QR',
      'pending',
      v_order.total,
      p_restaurant_id::text || ':' || p_idempotency_key || ':initial-payment',
      p_request_fingerprint,
      jsonb_build_object('source', 'create_online_order_atomic')
    )
    returning * into v_payment;
  end if;

  insert into public.audit_logs (
    restaurant_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    after_data,
    metadata
  )
  values (
    p_restaurant_id,
    p_actor_user_id,
    'order.created_atomic',
    'order',
    v_order.id::text,
    to_jsonb(v_order),
    jsonb_build_object(
      'idempotencyKey', p_idempotency_key,
      'requestFingerprint', p_request_fingerprint
    )
  );

  insert into public.operational_event_outbox (
    event_id,
    event_type,
    restaurant_id,
    branch_id,
    tenant_id,
    source,
    payload
  )
  values (
    'order.created:' || v_order.id::text,
    'order.created',
    p_restaurant_id,
    v_order.branch_id,
    p_restaurant_id::text,
    'create_online_order_atomic',
    jsonb_build_object(
      'type', 'order.created',
      'eventId', 'order.created:' || v_order.id::text,
      'restaurantId', p_restaurant_id,
      'tenantId', p_restaurant_id::text,
      'branchId', v_order.branch_id,
      'occurredAt', v_order.created_at,
      'actor', jsonb_build_object('type', 'customer'),
      'source', case when v_order.fulfillment_type = 'DINE_IN' then 'customer_qr' else 'online_ordering' end,
      'order', jsonb_build_object(
        'id', v_order.id,
        'itemCount', (
          select coalesce(sum(order_items.quantity), 0)::integer
          from public.order_items order_items
          where order_items.order_id = v_order.id
        ),
        'lineCount', (
          select count(*)::integer
          from public.order_items order_items
          where order_items.order_id = v_order.id
        ),
        'subtotal', v_order.subtotal,
        'discountAmount', v_order.discount_amount,
        'deliveryFee', v_order.delivery_fee,
        'serviceFee', v_order.service_fee,
        'total', v_order.total,
        'fulfillmentType', v_order.fulfillment_type,
        'customerName', v_order.customer_name,
        'customerPhone', v_order.customer_phone,
        'customerNote', v_order.customer_note,
        'status', v_order.status,
        'paymentStatus', v_order.payment_status,
        'deliveryStatus', v_order.delivery_status,
        'deliveryAddress', v_order.delivery_address,
        'deliveryDistanceKm', v_order.delivery_distance_km,
        'createdAt', v_order.created_at
      )
    )
  );

  v_response := jsonb_build_object(
    'order', to_jsonb(v_order),
    'paymentLog', case when v_payment.id is null then null else to_jsonb(v_payment) end,
    'idempotentReplay', false
  );

  update public.financial_transaction_requests requests
  set response_payload = v_response,
      completed_at = clock_timestamp()
  where requests.id = v_request.id;

  return v_response;
end;
$$;

revoke all on function public.create_online_order_atomic(uuid, text, text, jsonb, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.create_online_order_atomic(uuid, text, text, jsonb, jsonb, uuid)
  to service_role;

create or replace function public.checkout_bill_atomic(
  p_restaurant_id uuid,
  p_bill_id uuid,
  p_expected_state_version bigint,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_payment_method public.payment_method,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.financial_transaction_requests%rowtype;
  v_bill public.table_bills%rowtype;
  v_before jsonb;
  v_response jsonb;
  v_order record;
  v_checkout_orders integer := 0;
  v_notification_order_id uuid;
  v_notification_branch_id uuid;
  v_checkout_order_ids jsonb := '[]'::jsonb;
begin
  if p_restaurant_id is null
    or p_bill_id is null
    or p_expected_state_version is null
    or p_idempotency_key is null
    or p_request_fingerprint is null
    or p_payment_method is null
  then
    raise exception using errcode = '22023', message = 'INVALID_CHECKOUT_REQUEST';
  end if;

  insert into public.financial_transaction_requests (
    restaurant_id,
    operation,
    idempotency_key,
    request_fingerprint
  )
  values (p_restaurant_id, 'checkout_bill', p_idempotency_key, p_request_fingerprint)
  on conflict (restaurant_id, operation, idempotency_key) do nothing;

  select requests.*
  into v_request
  from public.financial_transaction_requests requests
  where requests.restaurant_id = p_restaurant_id
    and requests.operation = 'checkout_bill'
    and requests.idempotency_key = p_idempotency_key
  for update;

  if v_request.request_fingerprint is distinct from p_request_fingerprint then
    raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_FINGERPRINT_MISMATCH';
  end if;

  if v_request.response_payload is not null then
    return jsonb_set(v_request.response_payload, '{idempotentReplay}', 'true'::jsonb, true);
  end if;

  select bills.*
  into v_bill
  from public.table_bills bills
  where bills.id = p_bill_id
    and bills.restaurant_id = p_restaurant_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'BILL_NOT_FOUND';
  end if;

  if v_bill.state_version <> p_expected_state_version then
    raise exception using errcode = '40001', message = 'STATE_VERSION_CONFLICT';
  end if;

  if v_bill.status <> 'open' then
    raise exception using errcode = 'P0001', message = 'INVALID_BILL_TRANSITION';
  end if;

  v_before := to_jsonb(v_bill);

  for v_order in
    select orders.id, orders.status, orders.payment_status
    from public.orders orders
    where orders.restaurant_id = p_restaurant_id
      and orders.bill_id = p_bill_id
      and orders.status <> 'cancelled'
    order by orders.id
    for update
  loop
    if v_order.status = 'pending' then
      raise exception using errcode = 'P0001', message = 'ORDER_NOT_ACCEPTED';
    end if;

    if v_order.payment_status <> 'unpaid' then
      raise exception using errcode = 'P0001', message = 'INVALID_ORDER_PAYMENT_STATE';
    end if;

    if v_order.status in ('ordering', 'completed') then
      v_checkout_orders := v_checkout_orders + 1;
    end if;
  end loop;

  if v_checkout_orders = 0 then
    raise exception using errcode = 'P0001', message = 'BILL_HAS_NO_CHECKOUT_ORDERS';
  end if;

  update public.orders orders
  set payment_method = p_payment_method,
      payment_status = case
        when p_payment_method = 'QR' then 'waiting_payment'
        else 'waiting_confirm'
      end,
      state_version = orders.state_version + 1,
      updated_at = clock_timestamp()
  where orders.restaurant_id = p_restaurant_id
    and orders.bill_id = p_bill_id
    and orders.status in ('ordering', 'completed');

  update public.table_bills bills
  set status = case
        when p_payment_method = 'QR' then 'waiting_payment'::public.table_bill_status
        else 'waiting_confirm'::public.table_bill_status
      end,
      payment_method = p_payment_method,
      state_version = bills.state_version + 1,
      updated_at = clock_timestamp()
  where bills.id = p_bill_id
    and bills.restaurant_id = p_restaurant_id
  returning * into v_bill;

  insert into public.payment_logs (
    restaurant_id,
    order_id,
    bill_id,
    method,
    status,
    amount,
    transition_key,
    request_fingerprint,
    raw_data
  )
  select
    p_restaurant_id,
    orders.id,
    p_bill_id,
    p_payment_method,
    case when p_payment_method = 'QR' then 'pending' else 'waiting_confirm' end::public.payment_log_status,
    orders.total,
    p_restaurant_id::text || ':' || p_idempotency_key || ':checkout:' || orders.id::text,
    p_request_fingerprint,
    jsonb_build_object('source', 'checkout_bill_atomic')
  from public.orders orders
  where orders.restaurant_id = p_restaurant_id
    and orders.bill_id = p_bill_id
    and orders.payment_status = case
      when p_payment_method = 'QR' then 'waiting_payment'
      else 'waiting_confirm'
    end;

  select notification_order.id, notification_order.branch_id
  into v_notification_order_id, v_notification_branch_id
  from public.orders notification_order
  where notification_order.restaurant_id = p_restaurant_id
    and notification_order.bill_id = p_bill_id
    and notification_order.status in ('ordering', 'completed')
  order by notification_order.id
  limit 1;

  select coalesce(jsonb_agg(notification_order.id order by notification_order.id), '[]'::jsonb)
  into v_checkout_order_ids
  from public.orders notification_order
  where notification_order.restaurant_id = p_restaurant_id
    and notification_order.bill_id = p_bill_id
    and notification_order.status in ('ordering', 'completed');

  insert into public.audit_logs (
    restaurant_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data,
    metadata
  )
  values (
    p_restaurant_id,
    p_actor_user_id,
    'bill.checkout_atomic',
    'table_bill',
    p_bill_id::text,
    v_before,
    to_jsonb(v_bill),
    jsonb_build_object(
      'idempotencyKey', p_idempotency_key,
      'requestFingerprint', p_request_fingerprint
    )
  );

  if p_payment_method = 'CASH' then
    insert into public.operational_event_outbox (
      event_id,
      event_type,
      restaurant_id,
      branch_id,
      tenant_id,
      source,
      payload
    )
    values (
      'payment.waiting_confirm:' || p_bill_id::text,
      'payment.waiting_confirm',
      p_restaurant_id,
      v_notification_branch_id,
      p_restaurant_id::text,
      'checkout_bill_atomic',
      jsonb_build_object(
        'type', 'payment.waiting_confirm',
        'eventId', 'payment.waiting_confirm:' || p_bill_id::text,
        'restaurantId', p_restaurant_id,
        'tenantId', p_restaurant_id::text,
        'actor', jsonb_build_object('type', 'customer'),
        'source', 'customer_qr',
        'payment', jsonb_build_object(
          'orderId', v_notification_order_id,
          'orderIds', v_checkout_order_ids,
          'billId', p_bill_id,
          'amount', v_bill.total,
          'method', p_payment_method,
          'status', 'waiting_confirm'
        )
      )
    );
  end if;

  v_response := jsonb_build_object(
    'bill', to_jsonb(v_bill),
    'idempotentReplay', false
  );

  update public.financial_transaction_requests requests
  set response_payload = v_response,
      completed_at = clock_timestamp()
  where requests.id = v_request.id;

  return v_response;
end;
$$;

revoke all on function public.checkout_bill_atomic(uuid, uuid, bigint, text, text, public.payment_method, uuid)
  from public, anon, authenticated;
grant execute on function public.checkout_bill_atomic(uuid, uuid, bigint, text, text, public.payment_method, uuid)
  to service_role;

create or replace function public.transition_payment_atomic(
  p_restaurant_id uuid,
  p_order_id uuid,
  p_bill_id uuid,
  p_expected_order_state_version bigint,
  p_expected_bill_state_version bigint,
  p_to_status text,
  p_next_order_status text,
  p_payment_method public.payment_method,
  p_amount integer,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_actor_user_id uuid default null,
  p_raw_data jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.financial_transaction_requests%rowtype;
  v_order public.orders%rowtype;
  v_bill public.table_bills%rowtype;
  v_payment public.payment_logs%rowtype;
  v_order_before jsonb;
  v_bill_before jsonb;
  v_response jsonb;
  v_bill_complete boolean;
  v_target_before public.orders%rowtype;
  v_target_payment public.payment_logs%rowtype;
  v_bill_order public.orders%rowtype;
  v_bill_order_count integer := 0;
  v_bill_total bigint := 0;
  v_target_seen boolean := false;
  v_affected_order_ids jsonb := '[]'::jsonb;
  v_payment_log_ids jsonb := '[]'::jsonb;
begin
  if p_restaurant_id is null
    or p_order_id is null
    or p_expected_order_state_version is null
    or p_to_status is null
    or p_payment_method is null
    or p_amount is null
    or p_idempotency_key is null
    or p_request_fingerprint is null
  then
    raise exception using errcode = '22023', message = 'INVALID_PAYMENT_REQUEST';
  end if;

  if p_to_status not in ('waiting_payment', 'waiting_confirm', 'paid', 'failed', 'refunded') then
    raise exception using errcode = '22023', message = 'INVALID_PAYMENT_TRANSITION';
  end if;

  if p_next_order_status is not null
    and p_next_order_status not in ('pending', 'ordering', 'waiting_payment', 'waiting_confirm', 'paid', 'completed', 'cancelled')
  then
    raise exception using errcode = '22023', message = 'INVALID_NEXT_ORDER_STATUS';
  end if;

  if p_next_order_status = 'cancelled'
    or (p_to_status = 'paid' and p_next_order_status not in ('pending', 'ordering', 'paid', 'completed'))
    or (p_to_status = 'refunded' and p_next_order_status is not null and p_next_order_status <> 'completed')
    or (p_to_status in ('waiting_payment', 'waiting_confirm') and p_next_order_status not in ('pending', 'ordering', 'completed'))
    or (p_to_status = 'failed' and p_next_order_status not in ('pending', 'ordering', 'completed', 'waiting_payment', 'waiting_confirm'))
  then
    raise exception using errcode = '22023', message = 'INVALID_PAYMENT_ORDER_STATUS_COMBINATION';
  end if;

  if p_bill_id is not null and p_next_order_status is not null then
    raise exception using errcode = '22023', message = 'BILL_NEXT_ORDER_STATUS_NOT_ALLOWED';
  end if;

  insert into public.financial_transaction_requests (
    restaurant_id,
    operation,
    idempotency_key,
    request_fingerprint
  )
  values (p_restaurant_id, 'transition_payment', p_idempotency_key, p_request_fingerprint)
  on conflict (restaurant_id, operation, idempotency_key) do nothing;

  select requests.*
  into v_request
  from public.financial_transaction_requests requests
  where requests.restaurant_id = p_restaurant_id
    and requests.operation = 'transition_payment'
    and requests.idempotency_key = p_idempotency_key
  for update;

  if v_request.request_fingerprint is distinct from p_request_fingerprint then
    raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_FINGERPRINT_MISMATCH';
  end if;

  if v_request.response_payload is not null then
    return jsonb_set(v_request.response_payload, '{idempotentReplay}', 'true'::jsonb, true);
  end if;

  if p_bill_id is not null then
    select bills.*
    into v_bill
    from public.table_bills bills
    where bills.id = p_bill_id
      and bills.restaurant_id = p_restaurant_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'BILL_NOT_FOUND';
    end if;

    if p_expected_bill_state_version is null
      or v_bill.state_version <> p_expected_bill_state_version
    then
      raise exception using errcode = '40001', message = 'STATE_VERSION_CONFLICT';
    end if;

    if v_bill.status = 'cancelled'
      or (v_bill.status = 'paid' and p_to_status <> 'refunded')
    then
      raise exception using errcode = 'P0001', message = 'INVALID_BILL_TRANSITION';
    end if;
  end if;

  select orders.*
  into v_order
  from public.orders orders
  where orders.id = p_order_id
    and orders.restaurant_id = p_restaurant_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND';
  end if;

  if v_order.bill_id is distinct from p_bill_id then
    raise exception using errcode = '23503', message = 'INVALID_SAME_TENANT_BILL_ATTACHMENT';
  end if;

  if v_order.state_version <> p_expected_order_state_version then
    raise exception using errcode = '40001', message = 'STATE_VERSION_CONFLICT';
  end if;

  if p_bill_id is not null then
    v_target_before := v_order;
    for v_bill_order in
      select orders.*
      from public.orders orders
      where orders.restaurant_id = p_restaurant_id
        and orders.bill_id = p_bill_id
        and orders.status <> 'cancelled'
      order by orders.id
      for update
    loop
      v_bill_order_count := v_bill_order_count + 1;
      v_bill_total := v_bill_total + v_bill_order.total::bigint;
      if v_bill_order.id = p_order_id then
        v_target_seen := true;
      end if;

      if v_bill_order.payment_method is not null
        and v_bill_order.payment_method is distinct from p_payment_method
        and v_bill_order.payment_status not in ('unpaid', 'failed')
      then
        raise exception using errcode = '22023', message = 'PAYMENT_METHOD_MISMATCH';
      end if;

      if not (
        (v_bill_order.payment_status = 'unpaid' and p_to_status in ('waiting_payment', 'waiting_confirm', 'paid', 'failed'))
        or (v_bill_order.payment_status = 'waiting_payment' and p_to_status in ('waiting_confirm', 'paid', 'failed'))
        or (v_bill_order.payment_status = 'waiting_confirm' and p_to_status in ('paid', 'failed'))
        or (v_bill_order.payment_status = 'paid' and p_to_status = 'refunded')
        or (v_bill_order.payment_status = 'failed' and p_to_status in ('waiting_payment', 'waiting_confirm'))
      ) then
        raise exception using errcode = 'P0001', message = 'INVALID_PAYMENT_TRANSITION';
      end if;
    end loop;

    if not v_target_seen or v_bill_order_count = 0 then
      raise exception using errcode = '23503', message = 'INVALID_SAME_TENANT_BILL_ATTACHMENT';
    end if;

    if p_amount <> v_bill_total then
      raise exception using errcode = '22023', message = 'PAYMENT_AMOUNT_MISMATCH';
    end if;
  else
    if p_amount <> v_order.total then
      raise exception using errcode = '22023', message = 'PAYMENT_AMOUNT_MISMATCH';
    end if;

    if v_order.payment_method is not null
      and v_order.payment_method is distinct from p_payment_method
      and v_order.payment_status not in ('unpaid', 'failed')
    then
      raise exception using errcode = '22023', message = 'PAYMENT_METHOD_MISMATCH';
    end if;

    if not (
      (v_order.payment_status = 'unpaid' and p_to_status in ('waiting_payment', 'waiting_confirm', 'paid', 'failed'))
      or (v_order.payment_status = 'waiting_payment' and p_to_status in ('waiting_confirm', 'paid', 'failed'))
      or (v_order.payment_status = 'waiting_confirm' and p_to_status in ('paid', 'failed'))
      or (v_order.payment_status = 'paid' and p_to_status = 'refunded')
      or (v_order.payment_status = 'failed' and p_to_status in ('waiting_payment', 'waiting_confirm'))
    ) then
      raise exception using errcode = 'P0001', message = 'INVALID_PAYMENT_TRANSITION';
    end if;
  end if;

  v_order_before := to_jsonb(v_order);
  v_bill_before := case when p_bill_id is null then null else to_jsonb(v_bill) end;

  if p_bill_id is null then
    insert into public.payment_logs (
      restaurant_id, order_id, bill_id, method, status, amount,
      transition_key, request_fingerprint, raw_data
    )
    values (
      p_restaurant_id, p_order_id, null, p_payment_method,
      case p_to_status
        when 'waiting_payment' then 'pending'
        when 'waiting_confirm' then 'waiting_confirm'
        when 'paid' then 'confirmed'
        when 'failed' then 'failed'
        when 'refunded' then 'refunded'
      end::public.payment_log_status,
      p_amount, p_restaurant_id::text || ':' || p_idempotency_key,
      p_request_fingerprint, nullif(p_raw_data, 'null'::jsonb)
    )
    returning * into v_payment;

    update public.orders orders
      set payment_method = p_payment_method,
          payment_status = p_to_status,
          status = coalesce(p_next_order_status::public.order_status, case
            when p_to_status = 'waiting_payment' then 'waiting_payment'::public.order_status
            when p_to_status = 'waiting_confirm' then 'waiting_confirm'::public.order_status
            when p_to_status = 'paid' then 'paid'::public.order_status
            when p_to_status = 'refunded' then 'completed'::public.order_status
            else orders.status
          end),
        paid_at = case
          when p_to_status = 'paid' then clock_timestamp()
          when p_to_status = 'refunded' then null
          else orders.paid_at
        end,
        state_version = orders.state_version + 1,
        updated_at = clock_timestamp()
    where orders.id = p_order_id
      and orders.restaurant_id = p_restaurant_id
    returning * into v_order;

    v_affected_order_ids := jsonb_build_array(v_order.id);
    v_payment_log_ids := jsonb_build_array(v_payment.id);
  else
    for v_bill_order in
      select orders.*
      from public.orders orders
      where orders.restaurant_id = p_restaurant_id
        and orders.bill_id = p_bill_id
        and orders.status <> 'cancelled'
      order by orders.id
      for update
    loop
      insert into public.payment_logs (
        restaurant_id, order_id, bill_id, method, status, amount,
        transition_key, request_fingerprint, raw_data
      )
      values (
        p_restaurant_id, v_bill_order.id, p_bill_id, p_payment_method,
        case p_to_status
          when 'waiting_payment' then 'pending'
          when 'waiting_confirm' then 'waiting_confirm'
          when 'paid' then 'confirmed'
          when 'failed' then 'failed'
          when 'refunded' then 'refunded'
        end::public.payment_log_status,
        v_bill_order.total,
        p_restaurant_id::text || ':' || p_idempotency_key || ':' || v_bill_order.id::text,
        p_request_fingerprint, nullif(p_raw_data, 'null'::jsonb)
      )
      returning * into v_payment;

      v_affected_order_ids := v_affected_order_ids || jsonb_build_array(v_bill_order.id);
      v_payment_log_ids := v_payment_log_ids || jsonb_build_array(v_payment.id);

      if v_bill_order.id = p_order_id then
        v_target_payment := v_payment;
      end if;

      update public.orders orders
      set payment_method = p_payment_method,
          payment_status = p_to_status,
          status = case
            when p_to_status = 'paid' and v_bill_order.status = 'completed' then 'paid'
            when p_to_status = 'paid' and v_bill_order.status in ('waiting_payment', 'waiting_confirm') then 'paid'
            when p_to_status = 'refunded' then 'completed'
            else orders.status
          end,
          paid_at = case
            when p_to_status = 'paid' then clock_timestamp()
            when p_to_status = 'refunded' then null
            else orders.paid_at
          end,
          state_version = orders.state_version + 1,
          updated_at = clock_timestamp()
      where orders.id = v_bill_order.id
        and orders.restaurant_id = p_restaurant_id
      returning * into v_order;

    end loop;

    v_payment := v_target_payment;
    select orders.*
    into v_order
    from public.orders orders
    where orders.id = p_order_id
      and orders.restaurant_id = p_restaurant_id;
  end if;

  if p_bill_id is not null then
    select not exists (
      select 1
      from public.orders orders
      where orders.restaurant_id = p_restaurant_id
        and orders.bill_id = p_bill_id
        and orders.status <> 'cancelled'
        and orders.payment_status not in ('paid', 'refunded')
    )
    into v_bill_complete;

    update public.table_bills bills
    set status = case
          when p_to_status = 'refunded' then 'cancelled'::public.table_bill_status
          when v_bill_complete then 'paid'::public.table_bill_status
          when p_to_status = 'waiting_confirm' and bills.status in ('open', 'waiting_payment')
            then 'waiting_confirm'::public.table_bill_status
          when p_to_status = 'waiting_payment' and bills.status = 'open'
            then 'waiting_payment'::public.table_bill_status
          else bills.status
        end,
        payment_method = p_payment_method,
        paid_at = case
          when p_to_status = 'refunded' then null
          when v_bill_complete then clock_timestamp()
          else bills.paid_at
        end,
        closed_at = case
          when p_to_status = 'refunded' then clock_timestamp()
          when v_bill_complete then clock_timestamp()
          else bills.closed_at
        end,
        state_version = bills.state_version + 1,
        updated_at = clock_timestamp()
    where bills.id = p_bill_id
      and bills.restaurant_id = p_restaurant_id
    returning * into v_bill;
  end if;

  insert into public.audit_logs (
    restaurant_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data,
    metadata
  )
  values (
    p_restaurant_id,
    p_actor_user_id,
    'payment.transition_atomic',
    'order',
    p_order_id::text,
    v_order_before,
    to_jsonb(v_order),
    jsonb_build_object(
      'billBefore', v_bill_before,
      'billAfter', case when p_bill_id is null then null else to_jsonb(v_bill) end,
      'paymentLogId', v_payment.id,
      'affectedOrderIds', v_affected_order_ids,
      'paymentLogIds', v_payment_log_ids,
      'idempotencyKey', p_idempotency_key,
      'requestFingerprint', p_request_fingerprint
    )
  );

  if p_to_status in ('waiting_confirm', 'paid') then
    insert into public.operational_event_outbox (
      event_id,
      event_type,
      restaurant_id,
      branch_id,
      tenant_id,
      source,
      payload
    )
    values (
      case when p_to_status = 'paid' then 'payment.received:' else 'payment.waiting_confirm:' end
        || coalesce(p_bill_id::text, p_order_id::text),
      case when p_to_status = 'paid' then 'payment.received' else 'payment.waiting_confirm' end,
      p_restaurant_id,
      v_order.branch_id,
      p_restaurant_id::text,
      'transition_payment_atomic',
      jsonb_build_object(
        'type', case when p_to_status = 'paid' then 'payment.received' else 'payment.waiting_confirm' end,
        'eventId', case when p_to_status = 'paid' then 'payment.received:' else 'payment.waiting_confirm:' end
          || coalesce(p_bill_id::text, p_order_id::text),
        'restaurantId', p_restaurant_id,
        'tenantId', p_restaurant_id::text,
        'branchId', v_order.branch_id,
        'actor', jsonb_build_object('type', 'system'),
        'source', 'system',
        'payment', jsonb_build_object(
          'orderId', p_order_id,
          'billId', p_bill_id,
          'amount', p_amount,
          'method', p_payment_method,
          'status', case when p_to_status = 'paid' then 'confirmed' else 'waiting_confirm' end
        )
      )
    );
  end if;

  v_response := jsonb_build_object(
    'order', to_jsonb(v_order),
    'bill', case when p_bill_id is null then null else to_jsonb(v_bill) end,
    'paymentLog', to_jsonb(v_payment),
    'affectedOrderIds', v_affected_order_ids,
    'paymentLogIds', v_payment_log_ids,
    'idempotentReplay', false
  );

  update public.financial_transaction_requests requests
  set response_payload = v_response,
      completed_at = clock_timestamp()
  where requests.id = v_request.id;

  return v_response;
end;
$$;

revoke all on function public.transition_payment_atomic(uuid, uuid, uuid, bigint, bigint, text, text, public.payment_method, integer, text, text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.transition_payment_atomic(uuid, uuid, uuid, bigint, bigint, text, text, public.payment_method, integer, text, text, uuid, jsonb)
  to service_role;

notify pgrst, 'reload schema';

reset lock_timeout;
reset statement_timeout;
