-- Harden admin role boundaries at the database layer.
-- Staff can read operational setup, but only ADMIN can mutate menu and table configuration.

drop policy if exists "staff can manage own tables" on public.tables;
drop policy if exists "users can read own tables" on public.tables;
drop policy if exists "admins can mutate own tables" on public.tables;

create policy "users can read own tables"
on public.tables for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

create policy "admins can mutate own tables"
on public.tables for all
to authenticated
using (
  restaurant_id = public.current_restaurant_id()
  and public.current_user_role() = 'ADMIN'
)
with check (
  restaurant_id = public.current_restaurant_id()
  and public.current_user_role() = 'ADMIN'
);

drop policy if exists "staff can manage own menu categories" on public.menu_categories;
drop policy if exists "users can read own menu categories" on public.menu_categories;
drop policy if exists "admins can mutate own menu categories" on public.menu_categories;

create policy "users can read own menu categories"
on public.menu_categories for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

create policy "admins can mutate own menu categories"
on public.menu_categories for all
to authenticated
using (
  restaurant_id = public.current_restaurant_id()
  and public.current_user_role() = 'ADMIN'
)
with check (
  restaurant_id = public.current_restaurant_id()
  and public.current_user_role() = 'ADMIN'
);

drop policy if exists "staff can manage own menu items" on public.menu_items;
drop policy if exists "users can read own menu items" on public.menu_items;
drop policy if exists "admins can mutate own menu items" on public.menu_items;

create policy "users can read own menu items"
on public.menu_items for select
to authenticated
using (restaurant_id = public.current_restaurant_id());

create policy "admins can mutate own menu items"
on public.menu_items for all
to authenticated
using (
  restaurant_id = public.current_restaurant_id()
  and public.current_user_role() = 'ADMIN'
)
with check (
  restaurant_id = public.current_restaurant_id()
  and public.current_user_role() = 'ADMIN'
);
