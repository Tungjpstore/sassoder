-- app_private.current_restaurant_id/current_user_role use lower(email) as
-- a fallback when auth.uid() is unavailable during OAuth/email identity drift.
-- Keep that lookup indexed so every authenticated RLS policy stays tenant-safe
-- without degrading into a full public.users scan.
create index if not exists users_lower_email_idx
  on public.users (lower(email));
