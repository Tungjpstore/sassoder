-- Harden promotion usage identity and timezone interpretation.

create extension if not exists pgcrypto;

alter table public.restaurants
  add column if not exists timezone text not null default 'Asia/Ho_Chi_Minh';

alter table public.restaurants
  drop constraint if exists restaurants_timezone_format,
  add constraint restaurants_timezone_format
    check (timezone ~ '^[A-Za-z_]+/[A-Za-z0-9_+.-]+$' or timezone = 'UTC');

alter table public.orders
  add column if not exists promotion_customer_key_hash text;

alter table public.orders
  drop constraint if exists orders_promotion_customer_key_hash_format,
  add constraint orders_promotion_customer_key_hash_format
    check (promotion_customer_key_hash is null or promotion_customer_key_hash ~ '^[a-f0-9]{64}$');

update public.orders
set promotion_customer_key_hash = encode(
  extensions.digest(concat_ws('|', 'v1', restaurant_id::text, 'QR_MENU', 'table', table_id::text), 'sha256'),
  'hex'
)
where promotion_id is not null
  and promotion_customer_key_hash is null
  and table_id is not null;

update public.orders
set promotion_customer_key_hash = encode(
  extensions.digest(
    concat_ws('|', 'v1', restaurant_id::text, 'WEBSITE', 'phone', regexp_replace(coalesce(customer_phone, ''), '\D', '', 'g')),
    'sha256'
  ),
  'hex'
)
where promotion_id is not null
  and promotion_customer_key_hash is null
  and table_id is null
  and length(regexp_replace(coalesce(customer_phone, ''), '\D', '', 'g')) >= 6;

create index if not exists orders_restaurant_promotion_customer_key_idx
  on public.orders (restaurant_id, promotion_id, promotion_customer_key_hash, created_at desc)
  where promotion_id is not null
    and promotion_customer_key_hash is not null
    and status <> 'cancelled';

create or replace function public.enforce_promotion_usage_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_limit integer;
  v_customer_limit integer;
  v_total_used integer;
  v_customer_used integer;
begin
  if new.promotion_id is null or new.status = 'cancelled' then
    return new;
  end if;

  select total_usage_limit, per_customer_usage_limit
  into v_total_limit, v_customer_limit
  from public.promotions
  where id = new.promotion_id
    and restaurant_id = new.restaurant_id
  for update;

  if not found then
    return new;
  end if;

  if v_total_limit is not null then
    select count(*)::integer
    into v_total_used
    from public.orders
    where restaurant_id = new.restaurant_id
      and promotion_id = new.promotion_id
      and status <> 'cancelled'
      and id <> new.id;

    if v_total_used >= v_total_limit then
      raise exception 'Mã khuyến mãi đã hết lượt sử dụng.' using errcode = 'P0001';
    end if;
  end if;

  if v_customer_limit is not null then
    if new.promotion_customer_key_hash is null then
      raise exception 'Mã khuyến mãi cần định danh khách an toàn.' using errcode = 'P0001';
    end if;

    select count(*)::integer
    into v_customer_used
    from public.orders
    where restaurant_id = new.restaurant_id
      and promotion_id = new.promotion_id
      and promotion_customer_key_hash = new.promotion_customer_key_hash
      and status <> 'cancelled'
      and id <> new.id;

    if v_customer_used >= v_customer_limit then
      raise exception 'Khách này đã dùng hết lượt cho mã khuyến mãi.' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists orders_promotion_usage_limits on public.orders;
create trigger orders_promotion_usage_limits
before insert or update of promotion_id, promotion_customer_key_hash, status on public.orders
for each row execute function public.enforce_promotion_usage_limits();
