-- Add free-item promotion rewards without changing order item pricing semantics.

alter table public.promotions
  add column if not exists reward_type text not null default 'DISCOUNT',
  add column if not exists free_item_menu_item_id uuid references public.menu_items(id) on delete set null,
  add column if not exists free_item_quantity integer not null default 1;

alter table public.promotions
  drop constraint if exists promotions_reward_type_check,
  add constraint promotions_reward_type_check check (reward_type in ('DISCOUNT', 'FREE_ITEM')),
  drop constraint if exists promotions_free_item_quantity_check,
  add constraint promotions_free_item_quantity_check check (free_item_quantity between 1 and 50),
  drop constraint if exists promotions_free_item_config_check,
  add constraint promotions_free_item_config_check check (
    reward_type <> 'FREE_ITEM'
    or (discount_scope = 'ORDER' and free_item_menu_item_id is not null)
  );

create index if not exists promotions_restaurant_free_item_idx
  on public.promotions (restaurant_id, free_item_menu_item_id)
  where reward_type = 'FREE_ITEM' and free_item_menu_item_id is not null;
