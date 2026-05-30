alter table public.restaurants
  add column if not exists staff_code text,
  add column if not exists staff_code_generated_at timestamptz;

create or replace function public.generate_restaurant_staff_code(
  p_name text,
  p_slug text default null,
  p_restaurant_id uuid default null
)
returns text
language plpgsql
set search_path = public, extensions
as $$
declare
  v_base text;
  v_candidate text;
  v_attempt integer := 0;
begin
  v_base := upper(regexp_replace(coalesce(nullif(p_slug, ''), p_name, ''), '[^a-zA-Z0-9]+', '', 'g'));
  v_base := substring(coalesce(nullif(v_base, ''), 'LOGI') || 'LOGI' from 1 for 4);

  loop
    v_attempt := v_attempt + 1;
    v_candidate := v_base || lpad(floor(random() * 100)::integer::text, 2, '0');

    if not exists (
      select 1
      from public.restaurants restaurants
      where restaurants.staff_code = v_candidate
        and (p_restaurant_id is null or restaurants.id <> p_restaurant_id)
    ) then
      return v_candidate;
    end if;

    if v_attempt >= 40 then
      v_candidate := 'LV' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 6));
      if not exists (
        select 1
        from public.restaurants restaurants
        where restaurants.staff_code = v_candidate
          and (p_restaurant_id is null or restaurants.id <> p_restaurant_id)
      ) then
        return v_candidate;
      end if;
    end if;
  end loop;
end;
$$;

do $$
declare
  restaurant_record record;
begin
  for restaurant_record in
    select id, name, slug
    from public.restaurants
    where staff_code is null
    order by created_at, id
  loop
    update public.restaurants restaurants
    set
      staff_code = public.generate_restaurant_staff_code(restaurant_record.name, restaurant_record.slug, restaurant_record.id),
      staff_code_generated_at = coalesce(restaurants.staff_code_generated_at, now())
    where restaurants.id = restaurant_record.id
      and restaurants.staff_code is null;
  end loop;
end $$;

alter table public.restaurants
  alter column staff_code set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'restaurants_staff_code_format'
      and conrelid = 'public.restaurants'::regclass
  ) then
    alter table public.restaurants
      add constraint restaurants_staff_code_format check (staff_code ~ '^[A-Z0-9]{4,8}$');
  end if;
end $$;

create unique index if not exists restaurants_staff_code_unique_idx
  on public.restaurants (staff_code);

create or replace function public.ensure_restaurant_staff_code()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.staff_code is null or trim(new.staff_code) = '' then
    new.staff_code := public.generate_restaurant_staff_code(new.name, new.slug, new.id);
    new.staff_code_generated_at := now();
  else
    new.staff_code := upper(regexp_replace(new.staff_code, '[^a-zA-Z0-9]+', '', 'g'));
    if new.staff_code !~ '^[A-Z0-9]{4,8}$' then
      raise exception 'Invalid restaurant staff code';
    end if;
    new.staff_code_generated_at := coalesce(new.staff_code_generated_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists restaurants_ensure_staff_code on public.restaurants;
create trigger restaurants_ensure_staff_code
before insert on public.restaurants
for each row
execute function public.ensure_restaurant_staff_code();

alter table public.staff_members
  add column if not exists employee_number integer,
  add column if not exists employee_code text,
  add column if not exists date_of_birth date,
  add column if not exists hometown text,
  add column if not exists must_change_app_password boolean not null default false,
  add column if not exists first_login_at timestamptz,
  add column if not exists app_password_changed_at timestamptz,
  add column if not exists app_password_reset_at timestamptz,
  add column if not exists app_password_attempts smallint not null default 0,
  add column if not exists app_password_locked_until timestamptz,
  add column if not exists app_password_last_failed_at timestamptz;

with staff_number_context as (
  select
    staff.id,
    coalesce(existing.max_employee_number, 0) as max_existing,
    row_number() over (partition by staff.restaurant_id order by staff.created_at, staff.id)::integer as missing_row_number
  from public.staff_members staff
  left join (
    select restaurant_id, max(employee_number) as max_employee_number
    from public.staff_members
    where employee_number is not null
    group by restaurant_id
  ) existing on existing.restaurant_id = staff.restaurant_id
  where staff.employee_number is null
),
numbered_staff as (
  select id, (max_existing + missing_row_number)::integer as next_number
  from staff_number_context
)
update public.staff_members staff
set employee_number = numbered_staff.next_number
from numbered_staff
where staff.id = numbered_staff.id;

update public.staff_members staff
set employee_code = restaurants.staff_code || lpad(staff.employee_number::text, 6, '0')
from public.restaurants restaurants
where staff.restaurant_id = restaurants.id
  and (staff.employee_code is null or trim(staff.employee_code) = '');

alter table public.staff_members
  alter column employee_number set not null,
  alter column employee_code set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'staff_members_employee_number_range' and conrelid = 'public.staff_members'::regclass) then
    alter table public.staff_members add constraint staff_members_employee_number_range check (employee_number between 1 and 999999);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_members_employee_code_format' and conrelid = 'public.staff_members'::regclass) then
    alter table public.staff_members add constraint staff_members_employee_code_format check (employee_code ~ '^[A-Z0-9]{10,14}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_members_app_password_attempts_range' and conrelid = 'public.staff_members'::regclass) then
    alter table public.staff_members add constraint staff_members_app_password_attempts_range check (app_password_attempts between 0 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_members_hometown_length' and conrelid = 'public.staff_members'::regclass) then
    alter table public.staff_members add constraint staff_members_hometown_length check (hometown is null or length(trim(hometown)) between 2 and 120);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_members_date_of_birth_reasonable' and conrelid = 'public.staff_members'::regclass) then
    alter table public.staff_members add constraint staff_members_date_of_birth_reasonable check (
      date_of_birth is null or (date_of_birth >= date '1900-01-01' and date_of_birth <= current_date)
    );
  end if;
end $$;

create unique index if not exists staff_members_employee_code_unique_idx
  on public.staff_members (employee_code);

create unique index if not exists staff_members_restaurant_employee_number_unique_idx
  on public.staff_members (restaurant_id, employee_number);

create index if not exists staff_members_password_state_idx
  on public.staff_members (restaurant_id, must_change_app_password)
  where archived_at is null;

create index if not exists staff_members_app_password_lock_idx
  on public.staff_members (restaurant_id, app_password_locked_until)
  where archived_at is null and app_password_locked_until is not null;

create or replace function public.ensure_staff_member_identity()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  v_staff_code text;
begin
  select restaurants.staff_code
  into v_staff_code
  from public.restaurants restaurants
  where restaurants.id = new.restaurant_id
  for update;

  if v_staff_code is null then
    raise exception 'Restaurant staff code is missing';
  end if;

  if new.employee_number is null then
    select coalesce(max(staff.employee_number), 0) + 1
    into new.employee_number
    from public.staff_members staff
    where staff.restaurant_id = new.restaurant_id;
  end if;

  if new.employee_number < 1 or new.employee_number > 999999 then
    raise exception 'Invalid staff employee number';
  end if;

  if new.employee_code is null or trim(new.employee_code) = '' then
    new.employee_code := v_staff_code || lpad(new.employee_number::text, 6, '0');
  else
    new.employee_code := upper(regexp_replace(new.employee_code, '[^a-zA-Z0-9]+', '', 'g'));
  end if;

  return new;
end;
$$;

drop trigger if exists staff_members_ensure_identity on public.staff_members;
create trigger staff_members_ensure_identity
before insert on public.staff_members
for each row
execute function public.ensure_staff_member_identity();

create table if not exists public.staff_incident_reports (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_member_id uuid not null references public.staff_members(id) on delete cascade,
  branch_id uuid references public.store_branches(id) on delete set null,
  title text not null,
  description text not null,
  severity text not null default 'normal',
  status text not null default 'open',
  attachment_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null,
  constraint staff_incident_reports_title_length check (length(trim(title)) between 2 and 120),
  constraint staff_incident_reports_description_length check (length(trim(description)) between 5 and 1000),
  constraint staff_incident_reports_severity_check check (severity in ('low', 'normal', 'high', 'urgent')),
  constraint staff_incident_reports_status_check check (status in ('open', 'reviewing', 'resolved', 'dismissed'))
);

create index if not exists staff_incident_reports_restaurant_status_idx
  on public.staff_incident_reports (restaurant_id, status, created_at desc);

drop trigger if exists staff_incident_reports_set_updated_at on public.staff_incident_reports;
create trigger staff_incident_reports_set_updated_at
before update on public.staff_incident_reports
for each row execute function public.set_updated_at();

alter table public.staff_incident_reports enable row level security;

drop policy if exists "restaurant users can read own staff incidents" on public.staff_incident_reports;
create policy "restaurant users can read own staff incidents"
on public.staff_incident_reports for select
to authenticated
using (
  exists (
    select 1
    from public.users users
    where users.id = auth.uid()
      and users.restaurant_id = staff_incident_reports.restaurant_id
  )
);

drop policy if exists "restaurant staff can create own incidents" on public.staff_incident_reports;
create policy "restaurant staff can create own incidents"
on public.staff_incident_reports for insert
to authenticated
with check (
  exists (
    select 1
    from public.staff_members staff
    where staff.id = staff_incident_reports.staff_member_id
      and staff.user_id = auth.uid()
      and staff.restaurant_id = staff_incident_reports.restaurant_id
      and staff.archived_at is null
  )
);

grant select, insert on table public.staff_incident_reports to authenticated;

revoke execute on function public.generate_restaurant_staff_code(text, text, uuid) from public, anon, authenticated;
revoke execute on function public.ensure_restaurant_staff_code() from public, anon, authenticated;
revoke execute on function public.ensure_staff_member_identity() from public, anon, authenticated;
