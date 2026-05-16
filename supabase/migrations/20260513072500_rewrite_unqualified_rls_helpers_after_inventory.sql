-- Catch policies where Postgres normalized public helper calls without schema.

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
    if (coalesce(p.qual, '') || coalesce(p.with_check, '')) like '%app_private.current_restaurant_id%'
       and (coalesce(p.qual, '') || coalesce(p.with_check, '')) not like '%public.current_restaurant_id%'
       and (coalesce(p.qual, '') || coalesce(p.with_check, '')) not like '% current_restaurant_id%' then
      continue;
    end if;

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
