-- Later feature migrations must use private tenant helpers in RLS policies.
-- The public helpers are intentionally not executable by authenticated users.

grant usage on schema app_private to authenticated, service_role;
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
    where (qual is not null and (qual like '%public.current_restaurant_id%' or qual like '%public.current_user_role%'))
       or (with_check is not null and (with_check like '%public.current_restaurant_id%' or with_check like '%public.current_user_role%'))
  loop
    select string_agg(format('%I', role_name), ', ')
    into v_roles
    from unnest(p.roles) role_name;

    v_qual := p.qual;
    v_check := p.with_check;

    if v_qual is not null then
      v_qual := replace(v_qual, 'public.current_restaurant_id()', 'app_private.current_restaurant_id()');
      v_qual := replace(v_qual, 'public.current_user_role()', 'app_private.current_user_role()');
    end if;

    if v_check is not null then
      v_check := replace(v_check, 'public.current_restaurant_id()', 'app_private.current_restaurant_id()');
      v_check := replace(v_check, 'public.current_user_role()', 'app_private.current_user_role()');
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
