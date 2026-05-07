-- Adds restaurant onboarding fields and per-restaurant VietQR settings.

do $$
begin
  create type public.business_type as enum ('CAFE', 'RESTAURANT', 'FAST_FOOD', 'BAR', 'OTHER');
exception
  when duplicate_object then null;
end $$;

alter table public.restaurants
  add column if not exists business_type public.business_type,
  add column if not exists table_count integer,
  add column if not exists bank_code text,
  add column if not exists bank_account text,
  add column if not exists bank_account_name text;

alter table public.restaurants
  drop constraint if exists restaurants_table_count_range,
  add constraint restaurants_table_count_range
    check (table_count is null or (table_count >= 1 and table_count <= 300));

alter table public.restaurants
  drop constraint if exists restaurants_bank_code_format,
  add constraint restaurants_bank_code_format
    check (bank_code is null or bank_code ~ '^[A-Z0-9]{2,20}$');

alter table public.restaurants
  drop constraint if exists restaurants_bank_account_format,
  add constraint restaurants_bank_account_format
    check (bank_account is null or bank_account ~ '^[0-9]{4,32}$');

drop policy if exists "public can read restaurants for QR routes" on public.restaurants;
drop policy if exists "authenticated can read own restaurant" on public.restaurants;

create policy "authenticated can read own restaurant"
on public.restaurants for select
to authenticated
using (id = public.current_restaurant_id());
