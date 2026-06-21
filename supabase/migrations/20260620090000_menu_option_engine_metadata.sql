-- Menu option engine metadata for fast owner workflows: size, sugar, ice,
-- toppings, add-ons and combo choices. Existing modifier rows keep working.

alter table public.menu_modifier_groups
  add column if not exists kind text not null default 'CUSTOM',
  add column if not exists selection_type text not null default 'MULTIPLE',
  add column if not exists allow_quantity boolean not null default false;

alter table public.menu_modifier_options
  add column if not exists pricing_mode text not null default 'DELTA',
  add column if not exists price_value integer,
  add column if not exists is_default boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'menu_modifier_groups_kind_check'
  ) then
    alter table public.menu_modifier_groups
      add constraint menu_modifier_groups_kind_check
      check (kind in ('SIZE', 'TOPPING', 'ICE', 'SUGAR', 'ADDON', 'COMBO', 'CHOICE', 'NOTE_PRESET', 'CUSTOM'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'menu_modifier_groups_selection_type_check'
  ) then
    alter table public.menu_modifier_groups
      add constraint menu_modifier_groups_selection_type_check
      check (selection_type in ('SINGLE', 'MULTIPLE', 'QUANTITY'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'menu_modifier_options_pricing_mode_check'
  ) then
    alter table public.menu_modifier_options
      add constraint menu_modifier_options_pricing_mode_check
      check (pricing_mode in ('DELTA', 'ABSOLUTE'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'menu_modifier_options_price_value_range'
  ) then
    alter table public.menu_modifier_options
      add constraint menu_modifier_options_price_value_range
      check (price_value is null or price_value >= 0);
  end if;
end $$;

update public.menu_modifier_groups
set kind = case
    when lower(name) like '%size%' or lower(name) like '%kích cỡ%' or lower(name) like '%kich co%' then 'SIZE'
    when lower(name) like '%topping%' or lower(name) like '%trân châu%' or lower(name) like '%tran chau%' then 'TOPPING'
    when lower(name) like '%đá%' or lower(name) like '%da%' then 'ICE'
    when lower(name) like '%đường%' or lower(name) like '%duong%' then 'SUGAR'
    when lower(name) like '%món kèm%' or lower(name) like '%mon kem%' or lower(name) like '%ăn kèm%' or lower(name) like '%an kem%' then 'ADDON'
    when lower(name) like '%combo%' or lower(name) like '%set%' then 'COMBO'
    else kind
  end,
  selection_type = case
    when max_select = 1 then 'SINGLE'
    when lower(name) like '%size%' or lower(name) like '%kích cỡ%' or lower(name) like '%kich co%' then 'SINGLE'
    when lower(name) like '%đá%' or lower(name) like '%da%' then 'SINGLE'
    when lower(name) like '%đường%' or lower(name) like '%duong%' then 'SINGLE'
    when lower(name) like '%topping%' or lower(name) like '%trân châu%' or lower(name) like '%tran chau%' then 'QUANTITY'
    else selection_type
  end,
  allow_quantity = case
    when lower(name) like '%topping%' or lower(name) like '%trân châu%' or lower(name) like '%tran chau%' then true
    else allow_quantity
  end,
  updated_at = now()
where kind = 'CUSTOM'
   or selection_type = 'MULTIPLE'
   or allow_quantity = false;

with ranked_required_single_options as (
  select
    o.id,
    row_number() over (partition by o.group_id order by o.sort_order asc, o.name asc, o.id asc) as rn
  from public.menu_modifier_options o
  join public.menu_modifier_groups g on g.id = o.group_id
  where g.is_required = true
    and g.min_select = 1
    and coalesce(g.max_select, 1) = 1
    and o.is_available = true
)
update public.menu_modifier_options o
set is_default = true,
    updated_at = now()
from ranked_required_single_options r
where o.id = r.id
  and r.rn = 1
  and o.is_default = false;

create index if not exists menu_modifier_groups_kind_idx
  on public.menu_modifier_groups (restaurant_id, kind, is_active, sort_order);

create index if not exists menu_modifier_options_default_idx
  on public.menu_modifier_options (group_id, is_default, is_available, sort_order);

create or replace function public.replace_menu_modifier_setup(
  p_restaurant_id uuid,
  p_source_item_id uuid,
  p_target_item_ids uuid[]
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_target_item_id uuid;
  v_group record;
  v_new_group_id uuid;
  v_replaced_count integer := 0;
begin
  if coalesce(array_length(p_target_item_ids, 1), 0) = 0 then
    return 0;
  end if;

  if p_source_item_id = any(p_target_item_ids) then
    raise exception 'Source item cannot be a target item';
  end if;

  perform 1
  from public.menu_items
  where id = p_source_item_id
    and restaurant_id = p_restaurant_id
  for update;

  if not found then
    raise exception 'Source menu item not found';
  end if;

  if exists (
    select 1
    from unnest(p_target_item_ids) as target_item_id
    where not exists (
      select 1
      from public.menu_items
      where id = target_item_id
        and restaurant_id = p_restaurant_id
    )
  ) then
    raise exception 'Target menu item not found';
  end if;

  perform 1
  from public.menu_items
  where id = any(p_target_item_ids)
    and restaurant_id = p_restaurant_id
  for update;

  if not exists (
    select 1
    from public.menu_modifier_groups
    where restaurant_id = p_restaurant_id
      and menu_item_id = p_source_item_id
      and is_active = true
  ) then
    raise exception 'Source menu item has no modifier setup';
  end if;

  update public.menu_modifier_groups
  set is_active = false,
      updated_at = now()
  where restaurant_id = p_restaurant_id
    and menu_item_id = any(p_target_item_ids)
    and is_active = true;

  foreach v_target_item_id in array p_target_item_ids loop
    v_replaced_count := v_replaced_count + 1;

    for v_group in
      select *
      from public.menu_modifier_groups
      where restaurant_id = p_restaurant_id
        and menu_item_id = p_source_item_id
        and is_active = true
      order by sort_order asc, name asc, id asc
    loop
      insert into public.menu_modifier_groups (
        restaurant_id,
        menu_item_id,
        name,
        kind,
        selection_type,
        allow_quantity,
        is_required,
        min_select,
        max_select,
        sort_order,
        is_active
      ) values (
        p_restaurant_id,
        v_target_item_id,
        v_group.name,
        coalesce(v_group.kind, 'CUSTOM'),
        coalesce(v_group.selection_type, case when v_group.max_select = 1 then 'SINGLE' else 'MULTIPLE' end),
        coalesce(v_group.allow_quantity, false),
        v_group.is_required,
        v_group.min_select,
        v_group.max_select,
        v_group.sort_order,
        true
      ) returning id into v_new_group_id;

      insert into public.menu_modifier_options (
        restaurant_id,
        group_id,
        name,
        price_delta,
        pricing_mode,
        price_value,
        is_default,
        is_available,
        sort_order
      )
      select
        p_restaurant_id,
        v_new_group_id,
        o.name,
        o.price_delta,
        coalesce(o.pricing_mode, 'DELTA'),
        o.price_value,
        coalesce(o.is_default, false),
        o.is_available,
        o.sort_order
      from public.menu_modifier_options o
      where o.restaurant_id = p_restaurant_id
        and o.group_id = v_group.id
      order by o.sort_order asc, o.name asc, o.id asc;
    end loop;
  end loop;

  return v_replaced_count;
end;
$$;

revoke all on function public.replace_menu_modifier_setup(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.replace_menu_modifier_setup(uuid, uuid, uuid[]) to authenticated, service_role;
