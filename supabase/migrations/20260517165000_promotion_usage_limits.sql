alter table public.promotions
  add column if not exists total_usage_limit integer,
  add column if not exists per_customer_usage_limit integer;

alter table public.promotions
  drop constraint if exists promotions_total_usage_limit_check,
  add constraint promotions_total_usage_limit_check check (total_usage_limit is null or total_usage_limit > 0),
  drop constraint if exists promotions_per_customer_usage_limit_check,
  add constraint promotions_per_customer_usage_limit_check check (per_customer_usage_limit is null or per_customer_usage_limit > 0);

create index if not exists orders_restaurant_promotion_customer_idx
  on public.orders (restaurant_id, promotion_id, customer_session_id, created_at desc)
  where promotion_id is not null and status <> 'cancelled';

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

  if v_customer_limit is not null and new.customer_session_id is not null then
    select count(*)::integer
    into v_customer_used
    from public.orders
    where restaurant_id = new.restaurant_id
      and promotion_id = new.promotion_id
      and customer_session_id = new.customer_session_id
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
before insert or update of promotion_id, customer_session_id, status on public.orders
for each row execute function public.enforce_promotion_usage_limits();
