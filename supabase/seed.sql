-- Demo seed data.
-- First create an Auth user in Supabase Auth:
--   email: admin@example.com
--   password: admin123456
-- Then copy that auth.users.id into the admin_user CTE below.

with demo_restaurant as (
  insert into public.restaurants (
    name,
    slug,
    business_type,
    address,
    hotline,
    online_ordering_enabled,
    pickup_enabled,
    delivery_enabled,
    store_lat,
    store_lng,
    delivery_radius_km,
    free_delivery_radius_km,
    delivery_base_fee,
    delivery_fee_per_km,
    min_order_for_delivery
  )
  values (
    'Demo Pho House',
    'demo-pho',
    'RESTAURANT',
    '135 Nam Kỳ Khởi Nghĩa, Quận 1, TP. Hồ Chí Minh',
    '0901234567',
    true,
    true,
    true,
    10.775658,
    106.700424,
    12,
    3,
    10000,
    4000,
    50000
  )
  on conflict (slug) do update set
    name = excluded.name,
    business_type = excluded.business_type,
    address = excluded.address,
    hotline = excluded.hotline,
    online_ordering_enabled = excluded.online_ordering_enabled,
    pickup_enabled = excluded.pickup_enabled,
    delivery_enabled = excluded.delivery_enabled,
    store_lat = excluded.store_lat,
    store_lng = excluded.store_lng,
    delivery_radius_km = excluded.delivery_radius_km,
    free_delivery_radius_km = excluded.free_delivery_radius_km,
    delivery_base_fee = excluded.delivery_base_fee,
    delivery_fee_per_km = excluded.delivery_fee_per_km,
    min_order_for_delivery = excluded.min_order_for_delivery
  returning id
),
admin_user as (
  select '00000000-0000-0000-0000-000000000000'::uuid as id, 'admin@example.com'::text as email
),
profile as (
  insert into public.users (id, email, role, restaurant_id)
  select admin_user.id, admin_user.email, 'ADMIN', demo_restaurant.id
  from admin_user, demo_restaurant
  on conflict (id) do update set
    email = excluded.email,
    role = excluded.role,
    restaurant_id = excluded.restaurant_id
  returning restaurant_id
),
categories as (
  insert into public.menu_categories (restaurant_id, name)
  select profile.restaurant_id, name
  from profile
  cross join (values ('Pho'), ('Rice'), ('Drinks')) as c(name)
  on conflict (restaurant_id, name) do update set name = excluded.name
  returning id, restaurant_id, name
)
insert into public.menu_items (restaurant_id, category_id, name, price, image_url)
select c.restaurant_id, c.id, item.name, item.price, item.image_url
from categories c
join (
  values
    ('Pho', 'Pho Bo Tai', 65000, 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?q=80&w=1200&auto=format&fit=crop'),
    ('Pho', 'Pho Ga', 59000, 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?q=80&w=1200&auto=format&fit=crop'),
    ('Rice', 'Com Tam Suon', 72000, 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?q=80&w=1200&auto=format&fit=crop'),
    ('Drinks', 'Tra Da', 8000, 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?q=80&w=1200&auto=format&fit=crop')
) as item(category_name, name, price, image_url)
on item.category_name = c.name
on conflict (restaurant_id, name) do update set
  category_id = excluded.category_id,
  price = excluded.price,
  image_url = excluded.image_url,
  is_available = true;

insert into public.tables (restaurant_id, name)
select id, 'Table 1'
from public.restaurants
where slug = 'demo-pho'
on conflict (restaurant_id, name) do nothing;
