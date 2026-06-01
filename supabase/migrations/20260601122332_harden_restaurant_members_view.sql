-- Harden public view semantics so restaurant member reads are still evaluated
-- through the caller's RLS policies instead of the view owner privileges.

create or replace view public.restaurant_members
with (security_invoker = true)
as
select
  users.id,
  users.restaurant_id,
  users.email,
  users.email as full_name,
  users.role,
  users.account_status,
  null::timestamptz as created_at,
  null::timestamptz as updated_at
from public.users;

revoke all on public.restaurant_members from public, anon;
grant select on public.restaurant_members to authenticated, service_role;
