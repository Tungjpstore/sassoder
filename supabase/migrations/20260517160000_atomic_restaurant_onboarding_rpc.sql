drop function if exists public.create_restaurant_onboarding_core(
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
  jsonb
);

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
set search_path = public, extensions
as $$
declare
  v_restaurant public.restaurants%rowtype;
  v_branch_id uuid;
  v_category jsonb;
  v_category_id uuid;
  v_category_name text;
  v_first_category_id uuid;
  v_item jsonb;
  v_item_name text;
  v_item_price integer;
  v_item_category_name text;
  v_item_category_id uuid;
  v_branch_lat_text text;
  v_branch_lng_text text;
  v_item_price_text text;
  v_plan public.saas_plans%rowtype;
  v_trial_already_claimed boolean;
  v_now timestamptz := now();
  v_requested_plan_code text;
begin
  if p_user_id is null then
    raise exception 'Missing onboarding user id';
  end if;

  if p_owner_email is null or position('@' in p_owner_email) <= 1 then
    raise exception 'Invalid onboarding owner email';
  end if;

  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'Invalid restaurant name';
  end if;

  if p_slug is null or p_slug !~ '^[a-z0-9-]{2,80}$' then
    raise exception 'Invalid restaurant slug';
  end if;

  if p_table_count is null or p_table_count < 1 or p_table_count > 300 then
    raise exception 'Invalid onboarding table count';
  end if;

  v_requested_plan_code := case when lower(coalesce(p_plan_code, 'pro')) = 'premium' then 'premium' else 'pro' end;

  select *
  into v_plan
  from public.saas_plans
  where code = v_requested_plan_code
    and is_active = true
  limit 1;

  if not found then
    raise exception 'Requested onboarding plan is not available';
  end if;

  select exists (
    select 1
    from public.trial_claims
    where lower(owner_email) = lower(trim(p_owner_email))
  )
  into v_trial_already_claimed;

  insert into public.restaurants (
    name,
    slug,
    business_type,
    table_count,
    contact_email,
    address,
    store_lat,
    store_lng,
    hotline,
    description,
    logo_url,
    brand_primary,
    brand_accent,
    receipt_footer,
    bank_code,
    bank_account,
    bank_account_name
  )
  values (
    trim(p_name),
    p_slug,
    p_business_type,
    p_table_count,
    lower(trim(p_owner_email)),
    nullif(trim(coalesce(p_address, '')), ''),
    p_store_lat,
    p_store_lng,
    nullif(trim(coalesce(p_hotline, '')), ''),
    nullif(trim(coalesce(p_description, '')), ''),
    nullif(trim(coalesce(p_logo_url, '')), ''),
    '#0F4D3A',
    '#F28C28',
    nullif(trim(coalesce(p_receipt_footer, '')), ''),
    nullif(trim(coalesce(p_bank_code, '')), ''),
    nullif(trim(coalesce(p_bank_account, '')), ''),
    nullif(trim(coalesce(p_bank_account_name, '')), '')
  )
  returning * into v_restaurant;

  insert into public.users (
    id,
    email,
    role,
    restaurant_id,
    staff_title,
    permission_profile,
    permissions
  )
  values (
    p_user_id,
    lower(trim(p_owner_email)),
    'ADMIN',
    v_restaurant.id,
    'Quản lý',
    'manager',
    '["dashboard.view","orders.manage","tables.manage","menu.manage","reservations.manage","payments.manage","settings.manage"]'::jsonb
  );

  if p_primary_branch is not null and jsonb_typeof(p_primary_branch) = 'object' then
    v_branch_lat_text := nullif(trim(p_primary_branch->>'latitude'), '');
    v_branch_lng_text := nullif(trim(p_primary_branch->>'longitude'), '');

    insert into public.store_branches (
      restaurant_id,
      name,
      address,
      latitude,
      longitude,
      is_primary,
      is_active,
      metadata
    )
    values (
      v_restaurant.id,
      coalesce(nullif(trim(p_primary_branch->>'name'), ''), 'Chi nhánh chính'),
      coalesce(nullif(trim(p_primary_branch->>'address'), ''), nullif(trim(coalesce(p_address, '')), ''), trim(p_name)),
      case when v_branch_lat_text ~ '^-?[0-9]+(\.[0-9]+)?$' then v_branch_lat_text::double precision else null end,
      case when v_branch_lng_text ~ '^-?[0-9]+(\.[0-9]+)?$' then v_branch_lng_text::double precision else null end,
      true,
      true,
      jsonb_build_object(
        'createdFrom', 'onboarding',
        'locationSource', coalesce(nullif(trim(p_primary_branch->>'source'), ''), 'onboarding')
      )
    )
    returning id into v_branch_id;
  end if;

  insert into public.tables (restaurant_id, branch_id, name)
  select
    v_restaurant.id,
    v_branch_id,
    'Bàn ' || series_index
  from generate_series(1, p_table_count) as series_index;

  if jsonb_typeof(coalesce(p_categories, '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid onboarding categories payload';
  end if;

  for v_category in select value from jsonb_array_elements(coalesce(p_categories, '[]'::jsonb))
  loop
    v_category_name := nullif(trim(v_category->>'name'), '');
    if v_category_name is null then
      continue;
    end if;

    insert into public.menu_categories (restaurant_id, name)
    values (v_restaurant.id, v_category_name)
    on conflict (restaurant_id, name) do update set name = excluded.name
    returning id into v_category_id;

    if v_first_category_id is null then
      v_first_category_id := v_category_id;
    end if;
  end loop;

  if jsonb_typeof(coalesce(p_menu_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid onboarding menu items payload';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_menu_items, '[]'::jsonb))
  loop
    v_item_name := nullif(trim(v_item->>'name'), '');
    v_item_price_text := nullif(trim(v_item->>'price'), '');
    v_item_price := case when v_item_price_text ~ '^[0-9]+$' then v_item_price_text::integer else 0 end;
    v_item_category_name := nullif(trim(v_item->>'categoryName'), '');

    if v_item_name is null or v_item_price <= 0 then
      continue;
    end if;

    v_item_category_id := null;
    if v_item_category_name is not null then
      select id
      into v_item_category_id
      from public.menu_categories
      where restaurant_id = v_restaurant.id
        and name = v_item_category_name
      limit 1;
    end if;

    v_item_category_id := coalesce(v_item_category_id, v_first_category_id);
    if v_item_category_id is null then
      continue;
    end if;

    insert into public.menu_items (
      restaurant_id,
      category_id,
      name,
      price,
      is_available
    )
    values (
      v_restaurant.id,
      v_item_category_id,
      v_item_name,
      v_item_price,
      true
    )
    on conflict (restaurant_id, name) do nothing;
  end loop;

  insert into public.restaurant_subscriptions (
    restaurant_id,
    plan_id,
    status,
    trial_started_at,
    trial_ends_at,
    current_period_start,
    current_period_end,
    metadata
  )
  values (
    v_restaurant.id,
    v_plan.id,
    case when v_trial_already_claimed then 'pending_payment' else 'trialing' end::public.saas_subscription_status,
    v_now,
    case when v_trial_already_claimed then v_now else v_now + make_interval(days => v_plan.trial_days) end,
    v_now,
    case when v_trial_already_claimed then v_now else v_now + make_interval(days => v_plan.trial_days) end,
    jsonb_build_object(
      'source', 'onboarding',
      'trialBlockedByPriorClaim', v_trial_already_claimed,
      'requestedPlanCode', v_requested_plan_code
    )
  );

  insert into public.trial_claims (
    restaurant_id,
    owner_email,
    owner_user_id
  )
  values (
    v_restaurant.id,
    lower(trim(p_owner_email)),
    p_user_id
  );

  return v_restaurant;
end;
$$;

revoke execute on function public.create_restaurant_onboarding_core(
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
