-- Public ordering and delivery branch lookup is served through server-side
-- services/RPCs scoped by restaurant slug. Do not expose every active branch
-- row to anon clients through the Data API.

drop policy if exists "public can read active store branches" on public.store_branches;

do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'store_branches'
      and roles && array['anon'::name, 'public'::name]
  ) then
    raise exception 'store_branches still has anon/public read policy';
  end if;
end;
$$;
