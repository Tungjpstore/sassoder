-- Split broad FOR ALL admin policies so SELECT has a single permissive policy per role.
-- This reduces RLS planner work on the hottest dashboard tables.

drop policy if exists "admins can manage own restaurant users" on public.users;
create policy "admins can insert own restaurant users"
on public.users for insert
to authenticated
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

create policy "admins can update own restaurant users"
on public.users for update
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

create policy "admins can delete own restaurant users"
on public.users for delete
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

drop policy if exists "admins can mutate own tables" on public.tables;
create policy "admins can insert own tables"
on public.tables for insert
to authenticated
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

create policy "admins can update own tables"
on public.tables for update
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

create policy "admins can delete own tables"
on public.tables for delete
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

drop policy if exists "admins can mutate own menu categories" on public.menu_categories;
create policy "admins can insert own menu categories"
on public.menu_categories for insert
to authenticated
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

create policy "admins can update own menu categories"
on public.menu_categories for update
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

create policy "admins can delete own menu categories"
on public.menu_categories for delete
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

drop policy if exists "admins can mutate own menu items" on public.menu_items;
create policy "admins can insert own menu items"
on public.menu_items for insert
to authenticated
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

create policy "admins can update own menu items"
on public.menu_items for update
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

create policy "admins can delete own menu items"
on public.menu_items for delete
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

drop policy if exists "users can read own restaurant promotions" on public.promotions;
drop policy if exists "admins can manage own restaurant promotions" on public.promotions;

create policy "users can read own restaurant promotions"
on public.promotions for select
to authenticated
using (restaurant_id = app_private.current_restaurant_id());

create policy "admins can insert own restaurant promotions"
on public.promotions for insert
to authenticated
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

create policy "admins can update own restaurant promotions"
on public.promotions for update
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN')
with check (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');

create policy "admins can delete own restaurant promotions"
on public.promotions for delete
to authenticated
using (restaurant_id = app_private.current_restaurant_id() and app_private.current_user_role() = 'ADMIN');
