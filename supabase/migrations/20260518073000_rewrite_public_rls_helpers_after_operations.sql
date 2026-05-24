-- Repair active RLS policies created after the first private-helper rewrite.
-- Authenticated users cannot execute the public helper functions, so RLS
-- policies must call the app_private equivalents.

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
    where (
      qual is not null
      and qual ~ '(^|[^.[:alnum:]_])(public[.])?current_(restaurant_id|user_role)\(\)'
    )
    or (
      with_check is not null
      and with_check ~ '(^|[^.[:alnum:]_])(public[.])?current_(restaurant_id|user_role)\(\)'
    )
  loop
    select string_agg(
      case when role_name = 'public' then 'public' else format('%I', role_name) end,
      ', '
    )
    into v_roles
    from unnest(p.roles) role_name;

    v_qual := p.qual;
    v_check := p.with_check;

    if v_qual is not null then
      v_qual := regexp_replace(
        v_qual,
        '(^|[^.[:alnum:]_])(public[.])?current_restaurant_id\(\)',
        '\1app_private.current_restaurant_id()',
        'g'
      );
      v_qual := regexp_replace(
        v_qual,
        '(^|[^.[:alnum:]_])(public[.])?current_user_role\(\)',
        '\1app_private.current_user_role()',
        'g'
      );
    end if;

    if v_check is not null then
      v_check := regexp_replace(
        v_check,
        '(^|[^.[:alnum:]_])(public[.])?current_restaurant_id\(\)',
        '\1app_private.current_restaurant_id()',
        'g'
      );
      v_check := regexp_replace(
        v_check,
        '(^|[^.[:alnum:]_])(public[.])?current_user_role\(\)',
        '\1app_private.current_user_role()',
        'g'
      );
    end if;

    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);

    v_sql := format(
      'create policy %I on %I.%I as %s for %s to %s',
      p.policyname,
      p.schemaname,
      p.tablename,
      p.permissive,
      p.cmd,
      coalesce(v_roles, 'public')
    );

    if v_qual is not null then
      v_sql := v_sql || ' using (' || v_qual || ')';
    end if;

    if v_check is not null then
      v_sql := v_sql || ' with check (' || v_check || ')';
    end if;

    execute v_sql;
  end loop;

  if exists (
    select 1
    from pg_policies
    where (
      qual is not null
      and qual ~ '(^|[^.[:alnum:]_])(public[.])?current_(restaurant_id|user_role)\(\)'
    )
    or (
      with_check is not null
      and with_check ~ '(^|[^.[:alnum:]_])(public[.])?current_(restaurant_id|user_role)\(\)'
    )
  ) then
    raise exception 'RLS policies still reference public tenant helper functions';
  end if;
end;
$$;
