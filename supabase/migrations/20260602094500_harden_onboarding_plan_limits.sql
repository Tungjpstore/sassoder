create unique index if not exists billing_payment_logs_request_signature_idx
  on public.billing_payment_logs (request_signature)
  where request_signature is not null;

do $$
begin
  if exists (
    select 1
    from pg_proc
    join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    where pg_namespace.nspname = 'public'
      and pg_proc.proname = 'create_restaurant_onboarding_core'
  ) and not exists (
    select 1
    from pg_proc
    join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    where pg_namespace.nspname = 'public'
      and pg_proc.proname = 'create_restaurant_onboarding_core_unchecked_20260602'
  ) then
    alter function public.create_restaurant_onboarding_core(
      uuid,
      text,
      text,
      text,
      public.business_type,
      integer,
      text,
      double precision,
      double precision,
      text,
      text,
      text,
      text,
      text,
      text,
      text,
      jsonb,
      jsonb,
      jsonb,
      text
    ) rename to create_restaurant_onboarding_core_unchecked_20260602;
  end if;
end $$;

create or replace function public.create_restaurant_onboarding_core(
  p_user_id uuid,
  p_owner_email text,
  p_name text,
  p_slug text,
  p_business_type public.business_type,
  p_table_count integer,
  p_address text default null,
  p_store_lat double precision default null,
  p_store_lng double precision default null,
  p_hotline text default null,
  p_description text default null,
  p_logo_url text default null,
  p_receipt_footer text default null,
  p_bank_code text default null,
  p_bank_account text default null,
  p_bank_account_name text default null,
  p_primary_branch jsonb default null,
  p_categories jsonb default '[]'::jsonb,
  p_menu_items jsonb default '[]'::jsonb,
  p_plan_code text default 'pro'
)
returns public.restaurants
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_requested_plan_code text;
  v_table_limit integer;
  v_restaurant public.restaurants%rowtype;
begin
  v_requested_plan_code := case when lower(coalesce(p_plan_code, 'pro')) = 'premium' then 'premium' else 'pro' end;
  v_table_limit := case when v_requested_plan_code = 'premium' then 300 else 20 end;

  if p_table_count is null or p_table_count < 1 or p_table_count > v_table_limit then
    raise exception 'Onboarding table count exceeds % plan limit of % tables', v_requested_plan_code, v_table_limit
      using errcode = '23514';
  end if;

  perform set_config('app.onboarding_plan_code', v_requested_plan_code, true);

  select *
  into v_restaurant
  from public.create_restaurant_onboarding_core_unchecked_20260602(
    p_user_id,
    p_owner_email,
    p_name,
    p_slug,
    p_business_type,
    p_table_count,
    p_address,
    p_store_lat,
    p_store_lng,
    p_hotline,
    p_description,
    p_logo_url,
    p_receipt_footer,
    p_bank_code,
    p_bank_account,
    p_bank_account_name,
    p_primary_branch,
    p_categories,
    p_menu_items,
    v_requested_plan_code
  );

  with latest_legacy_subscription as (
    select rs.*
    from public.restaurant_subscriptions rs
    where rs.restaurant_id = v_restaurant.id
    order by rs.created_at desc, rs.id desc
    limit 1
  ), target_plan as (
    select id
    from public.subscription_plans
    where code::text = v_requested_plan_code
      and is_active = true
      and deleted_at is null
    limit 1
  )
  insert into public.subscriptions (
    restaurant_id,
    plan_id,
    status,
    interval,
    started_at,
    current_period_start,
    current_period_end,
    grace_ends_at,
    trial_started_at,
    trial_ends_at,
    metadata,
    created_at,
    updated_at
  )
  select
    v_restaurant.id,
    target_plan.id,
    case
      when latest_legacy_subscription.status = 'past_due' then 'grace'::public.billing_subscription_status
      else latest_legacy_subscription.status::text::public.billing_subscription_status
    end,
    'month'::public.billing_interval,
    coalesce(latest_legacy_subscription.current_period_start, latest_legacy_subscription.created_at, now()),
    latest_legacy_subscription.current_period_start,
    latest_legacy_subscription.current_period_end,
    case
      when latest_legacy_subscription.status = 'past_due' and latest_legacy_subscription.current_period_end is not null then latest_legacy_subscription.current_period_end + interval '7 days'
      else null
    end,
    latest_legacy_subscription.trial_started_at,
    latest_legacy_subscription.trial_ends_at,
    jsonb_build_object(
      'source', 'onboarding_rpc_hardened',
      'legacySubscriptionId', latest_legacy_subscription.id,
      'requestedPlanCode', v_requested_plan_code
    ),
    now(),
    now()
  from latest_legacy_subscription
  join target_plan on true
  where not exists (
    select 1
    from public.subscriptions existing
    where existing.restaurant_id = v_restaurant.id
      and existing.deleted_at is null
      and existing.status in ('trialing', 'active', 'grace', 'pending_payment', 'suspended')
  );

  return v_restaurant;
end;
$$;

revoke all on function public.create_restaurant_onboarding_core(
  uuid,
  text,
  text,
  text,
  public.business_type,
  integer,
  text,
  double precision,
  double precision,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  text
) from public, anon, authenticated;

revoke all on function public.create_restaurant_onboarding_core_unchecked_20260602(
  uuid,
  text,
  text,
  text,
  public.business_type,
  integer,
  text,
  double precision,
  double precision,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  text
) from public, anon, authenticated, service_role;

grant execute on function public.create_restaurant_onboarding_core(
  uuid,
  text,
  text,
  text,
  public.business_type,
  integer,
  text,
  double precision,
  double precision,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  text
) to service_role;

with plan_ids as (
  select
    (select id from public.saas_plans where code = 'pro' limit 1) as pro_id,
    (select id from public.saas_plans where code = 'premium' limit 1) as premium_id
)
insert into public.plan_capabilities (plan_id, feature_key, enabled, limit_value, config)
select plan_id, feature_key, true, limit_value, '{}'::jsonb
from (
  select pro_id as plan_id, 'table_qr' as feature_key, 20::integer as limit_value from plan_ids where pro_id is not null
  union all
  select pro_id as plan_id, 'staff_management' as feature_key, 10::integer as limit_value from plan_ids where pro_id is not null
  union all
  select premium_id as plan_id, 'table_qr' as feature_key, 300::integer as limit_value from plan_ids where premium_id is not null
  union all
  select premium_id as plan_id, 'staff_management' as feature_key, 50::integer as limit_value from plan_ids where premium_id is not null
) as capability_updates
on conflict (plan_id, feature_key) do update set
  enabled = excluded.enabled,
  limit_value = excluded.limit_value,
  updated_at = now();

update public.subscription_plans
set
  metadata = coalesce(metadata, '{}'::jsonb) || case
    when code = 'premium' then jsonb_build_object('tablesLimit', 300, 'staffLimit', 50, 'limitPolicy', 'fair_use_operational_cap')
    else jsonb_build_object('tablesLimit', 20, 'staffLimit', 10)
  end,
  updated_at = now()
where code in ('pro', 'premium');

with entitlement_limits as (
  select *
  from (
    values
      ('pro', 'tables', 'tables', 20::numeric),
      ('pro', 'staff', 'staff', 10::numeric),
      ('pro', 'menu_management', null, 500::numeric),
      ('pro', 'promotions', null, 20::numeric),
      ('premium', 'tables', 'tables', 300::numeric),
      ('premium', 'staff', 'staff', 50::numeric),
      ('premium', 'menu_management', null, 2000::numeric),
      ('premium', 'promotions', null, 200::numeric)
  ) as t(plan_code, feature_key, quota_dimension, limit_value)
)
insert into public.plan_entitlements (
  plan_id,
  feature_key,
  access_mode,
  quota_dimension,
  limit_value,
  config,
  metadata
)
select
  subscription_plans.id,
  entitlement_limits.feature_key,
  'active'::public.entitlement_access_mode,
  entitlement_limits.quota_dimension::public.quota_dimension,
  entitlement_limits.limit_value,
  '{}'::jsonb,
  '{}'::jsonb
from entitlement_limits
join public.subscription_plans on subscription_plans.code::text = entitlement_limits.plan_code
where subscription_plans.deleted_at is null
on conflict (plan_id, feature_key) do update set
  access_mode = excluded.access_mode,
  quota_dimension = excluded.quota_dimension,
  limit_value = excluded.limit_value,
  deleted_at = null,
  updated_at = now();

update public.subscriptions
set
  grace_ends_at = current_period_end + interval '7 days',
  updated_at = now()
where status = 'grace'
  and grace_ends_at is null
  and current_period_end is not null
  and deleted_at is null;

create index if not exists users_restaurant_id_idx on public.users (restaurant_id);
create index if not exists menu_items_restaurant_id_idx on public.menu_items (restaurant_id);

create or replace function app_private.restaurant_feature_limit(
  p_restaurant_id uuid,
  p_v2_feature_key text,
  p_legacy_feature_key text default null
)
returns numeric
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_limit numeric;
begin
  select pc.limit_value::numeric
  into v_limit
  from public.restaurant_subscriptions rs
  join public.saas_plans sp on sp.id = rs.plan_id
  join public.plan_capabilities pc on pc.plan_id = sp.id
  where rs.restaurant_id = p_restaurant_id
    and rs.status in ('trialing', 'pending_payment', 'active', 'past_due')
    and sp.is_active = true
    and pc.enabled = true
    and pc.feature_key = coalesce(p_legacy_feature_key, p_v2_feature_key)
    and case
      when rs.status = 'trialing' then coalesce(rs.trial_ends_at, rs.current_period_end, now() - interval '1 second') >= now()
      when rs.status = 'active' then coalesce(rs.current_period_end, rs.trial_ends_at, now() - interval '1 second') >= now()
      when rs.status = 'past_due' then coalesce(rs.current_period_end + interval '7 days', rs.trial_ends_at, now() - interval '1 second') >= now()
      when rs.status = 'pending_payment' then coalesce(rs.current_period_end, rs.trial_ends_at, now() - interval '1 second') >= now()
      else false
    end
  order by rs.created_at desc, rs.id desc
  limit 1;

  if found then return coalesce(v_limit, 0); end if;

  select pe.limit_value
  into v_limit
  from public.subscriptions s
  join public.subscription_plans sp on sp.id = s.plan_id
  join public.plan_entitlements pe on pe.plan_id = sp.id
  where s.restaurant_id = p_restaurant_id
    and s.deleted_at is null
    and s.status in ('trialing', 'active', 'grace', 'pending_payment')
    and sp.deleted_at is null
    and sp.is_active = true
    and pe.deleted_at is null
    and pe.feature_key = p_v2_feature_key
    and pe.access_mode in ('active', 'quota', 'trial')
    and case
      when s.status = 'trialing' then coalesce(s.trial_ends_at, s.current_period_end, now() - interval '1 second') >= now()
      when s.status = 'active' then coalesce(s.current_period_end, s.trial_ends_at, now() - interval '1 second') >= now()
      when s.status = 'grace' then coalesce(s.grace_ends_at, s.current_period_end + interval '7 days', now() - interval '1 second') >= now()
      when s.status = 'pending_payment' then coalesce(s.current_period_end, s.trial_ends_at, now() - interval '1 second') >= now()
      else false
    end
  order by s.created_at desc, s.id desc
  limit 1;

  if found then return coalesce(v_limit, 0); end if;

  return 0;
end;
$$;

revoke all on function app_private.restaurant_feature_limit(uuid, text, text) from public, anon, authenticated;

create or replace function public.enforce_restaurant_cardinality_limit()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_limit numeric;
  v_used integer;
  v_onboarding_plan_code text;
begin
  if new.restaurant_id is null then
    raise exception 'Missing restaurant for plan limit enforcement' using errcode = '23502';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.restaurant_id::text || ':' || tg_table_name, 0));

  if tg_table_name = 'tables' then
    v_limit := app_private.restaurant_feature_limit(new.restaurant_id, 'tables', 'table_qr');
    select count(*) into v_used from public.tables where restaurant_id = new.restaurant_id and id is distinct from new.id;
  elsif tg_table_name = 'users' then
    v_limit := app_private.restaurant_feature_limit(new.restaurant_id, 'staff', 'staff_management');
    select count(*) into v_used from public.users where restaurant_id = new.restaurant_id and id is distinct from new.id;
  elsif tg_table_name = 'menu_items' then
    v_limit := app_private.restaurant_feature_limit(new.restaurant_id, 'menu_management', 'menu_management');
    select count(*) into v_used from public.menu_items where restaurant_id = new.restaurant_id and id is distinct from new.id;
  elsif tg_table_name = 'promotions' then
    v_limit := app_private.restaurant_feature_limit(new.restaurant_id, 'promotions', 'promotions');
    select count(*) into v_used from public.promotions where restaurant_id = new.restaurant_id and id is distinct from new.id;
  else
    return new;
  end if;

  if v_limit = 0 then
    v_onboarding_plan_code := nullif(current_setting('app.onboarding_plan_code', true), '');
    if v_onboarding_plan_code in ('pro', 'premium') then
      v_limit := case
        when tg_table_name = 'tables' and v_onboarding_plan_code = 'premium' then 300
        when tg_table_name = 'tables' then 20
        when tg_table_name = 'users' and v_onboarding_plan_code = 'premium' then 50
        when tg_table_name = 'users' then 10
        when tg_table_name = 'menu_items' and v_onboarding_plan_code = 'premium' then 2000
        when tg_table_name = 'menu_items' then 500
        when tg_table_name = 'promotions' and v_onboarding_plan_code = 'premium' then 200
        when tg_table_name = 'promotions' then 20
        else 0
      end;
    end if;
  end if;

  if v_limit is not null and v_used + 1 > v_limit then
    raise exception 'Plan limit exceeded for %. restaurant_id=% limit=% used=%', tg_table_name, new.restaurant_id, v_limit, v_used
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_restaurant_cardinality_limit() from public, anon, authenticated;

drop trigger if exists tables_enforce_plan_limit on public.tables;
create trigger tables_enforce_plan_limit
before insert or update of restaurant_id on public.tables
for each row execute function public.enforce_restaurant_cardinality_limit();

drop trigger if exists users_enforce_plan_limit on public.users;
create trigger users_enforce_plan_limit
before insert or update of restaurant_id on public.users
for each row execute function public.enforce_restaurant_cardinality_limit();

drop trigger if exists menu_items_enforce_plan_limit on public.menu_items;
create trigger menu_items_enforce_plan_limit
before insert or update of restaurant_id on public.menu_items
for each row execute function public.enforce_restaurant_cardinality_limit();

drop trigger if exists promotions_enforce_plan_limit on public.promotions;
create trigger promotions_enforce_plan_limit
before insert or update of restaurant_id on public.promotions
for each row execute function public.enforce_restaurant_cardinality_limit();
