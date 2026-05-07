-- Move tenant helper functions behind an unexposed schema and rewrite RLS policies.
-- This keeps tenant isolation helpers available to RLS without exposing them as public RPCs.

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated, service_role;

create schema if not exists extensions;
alter extension btree_gist set schema extensions;

create or replace function app_private.current_restaurant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select restaurant_id
  from public.users
  where id = auth.uid()
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by case when id = auth.uid() then 0 else 1 end
  limit 1
$$;

create or replace function app_private.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.users
  where id = auth.uid()
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by case when id = auth.uid() then 0 else 1 end
  limit 1
$$;

revoke all on function app_private.current_restaurant_id() from public, anon;
revoke all on function app_private.current_user_role() from public, anon;
grant execute on function app_private.current_restaurant_id() to authenticated, service_role;
grant execute on function app_private.current_user_role() to authenticated, service_role;

do $$
declare
  p record;
  v_roles text;
  v_qual text;
  v_check text;
  v_sql text;
begin
  for p in
    select *
    from pg_policies
    where (qual is not null and (qual like '%current_restaurant_id%' or qual like '%current_user_role%'))
       or (with_check is not null and (with_check like '%current_restaurant_id%' or with_check like '%current_user_role%'))
  loop
    select string_agg(format('%I', role_name), ', ')
    into v_roles
    from unnest(p.roles) role_name;

    v_qual := p.qual;
    v_check := p.with_check;

    if v_qual is not null then
      v_qual := regexp_replace(v_qual, '(^|[^.[:alnum:]_])(public\.)?current_restaurant_id\(\)', '\1app_private.current_restaurant_id()', 'g');
      v_qual := regexp_replace(v_qual, '(^|[^.[:alnum:]_])(public\.)?current_user_role\(\)', '\1app_private.current_user_role()', 'g');
    end if;

    if v_check is not null then
      v_check := regexp_replace(v_check, '(^|[^.[:alnum:]_])(public\.)?current_restaurant_id\(\)', '\1app_private.current_restaurant_id()', 'g');
      v_check := regexp_replace(v_check, '(^|[^.[:alnum:]_])(public\.)?current_user_role\(\)', '\1app_private.current_user_role()', 'g');
    end if;

    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);

    v_sql := format(
      'create policy %I on %I.%I as %s for %s to %s',
      p.policyname,
      p.schemaname,
      p.tablename,
      p.permissive,
      p.cmd,
      v_roles
    );

    if v_qual is not null then
      v_sql := v_sql || ' using (' || v_qual || ')';
    end if;

    if v_check is not null then
      v_sql := v_sql || ' with check (' || v_check || ')';
    end if;

    execute v_sql;
  end loop;
end;
$$;

revoke all on function public.current_restaurant_id() from public, anon, authenticated;
revoke all on function public.current_user_role() from public, anon, authenticated;
