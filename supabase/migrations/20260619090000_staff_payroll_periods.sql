-- Payroll period workflow: immutable-ish payroll snapshots per restaurant period.
-- This turns HR payroll from a client-side calculator into a draft/review/closed workflow.

create table if not exists public.staff_payroll_periods (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  period_label text not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'draft',
  staff_count integer not null default 0,
  gross_total integer not null default 0,
  net_total integer not null default 0,
  employee_insurance_total integer not null default 0,
  employer_insurance_total integer not null default 0,
  personal_income_tax_total integer not null default 0,
  snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  closed_by uuid references public.users(id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_payroll_periods_status_check check (status in ('draft', 'reviewing', 'closed', 'void')),
  constraint staff_payroll_periods_range_check check (period_end >= period_start),
  constraint staff_payroll_periods_totals_check check (
    staff_count >= 0
    and gross_total >= 0
    and net_total >= 0
    and employee_insurance_total >= 0
    and employer_insurance_total >= 0
    and personal_income_tax_total >= 0
  ),
  constraint staff_payroll_periods_unique unique (restaurant_id, period_start, period_end)
);

create index if not exists staff_payroll_periods_restaurant_period_idx
  on public.staff_payroll_periods (restaurant_id, period_start desc, period_end desc);

create index if not exists staff_payroll_periods_restaurant_status_idx
  on public.staff_payroll_periods (restaurant_id, status, created_at desc);

drop trigger if exists staff_payroll_periods_set_updated_at on public.staff_payroll_periods;
create trigger staff_payroll_periods_set_updated_at
before update on public.staff_payroll_periods
for each row execute function public.set_updated_at();

create or replace function public.enforce_staff_payroll_period_transition()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('closed', 'void') then
    raise exception 'Kỳ lương đã chốt hoặc đã huỷ, không thể sửa.';
  end if;

  if new.status = old.status then
    return new;
  end if;

  if new.status = 'reviewing' and old.status <> 'draft' then
    raise exception 'Chỉ kỳ lương nháp mới được đưa vào đối soát.';
  end if;

  if new.status = 'closed' then
    if old.status <> 'reviewing' then
      raise exception 'Cần đưa kỳ lương vào đối soát trước khi chốt.';
    end if;
    if new.closed_at is null or new.closed_by is null then
      raise exception 'Kỳ lương đã chốt cần có người chốt và thời điểm chốt.';
    end if;
  end if;

  if new.status = 'draft' and old.status <> 'reviewing' then
    raise exception 'Chỉ kỳ đang đối soát mới có thể trả về nháp.';
  end if;

  return new;
end;
$$;

drop trigger if exists staff_payroll_periods_enforce_transition on public.staff_payroll_periods;
create trigger staff_payroll_periods_enforce_transition
before update on public.staff_payroll_periods
for each row execute function public.enforce_staff_payroll_period_transition();

create table if not exists public.staff_payslips (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  payroll_period_id uuid not null references public.staff_payroll_periods(id) on delete cascade,
  staff_member_id uuid not null references public.staff_members(id) on delete cascade,
  staff_user_id uuid references public.users(id) on delete set null,
  branch_id uuid references public.store_branches(id) on delete set null,
  staff_name text not null,
  employee_code text,
  period_start date not null,
  period_end date not null,
  attendance_count integer not null default 0,
  work_minutes integer not null default 0,
  overtime_minutes integer not null default 0,
  late_minutes integer not null default 0,
  gross_pay integer not null default 0,
  net_pay integer not null default 0,
  employee_insurance_total integer not null default 0,
  employer_insurance_total integer not null default 0,
  personal_income_tax integer not null default 0,
  payroll_profile_snapshot jsonb not null default '{}'::jsonb,
  deduction_snapshot jsonb not null default '{}'::jsonb,
  attendance_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_payslips_status_check check (status in ('draft', 'approved', 'paid', 'void')),
  constraint staff_payslips_range_check check (period_end >= period_start),
  constraint staff_payslips_totals_check check (
    attendance_count >= 0
    and work_minutes >= 0
    and overtime_minutes >= 0
    and late_minutes >= 0
    and gross_pay >= 0
    and net_pay >= 0
    and employee_insurance_total >= 0
    and employer_insurance_total >= 0
    and personal_income_tax >= 0
  ),
  constraint staff_payslips_unique unique (payroll_period_id, staff_member_id)
);

create index if not exists staff_payslips_restaurant_period_idx
  on public.staff_payslips (restaurant_id, payroll_period_id, net_pay desc);

create index if not exists staff_payslips_staff_period_idx
  on public.staff_payslips (staff_member_id, period_start desc, period_end desc);

drop trigger if exists staff_payslips_set_updated_at on public.staff_payslips;
create trigger staff_payslips_set_updated_at
before update on public.staff_payslips
for each row execute function public.set_updated_at();

create or replace function public.enforce_staff_payslip_period_lock()
returns trigger
language plpgsql
as $$
declare
  parent_status text;
  parent_period_id uuid;
begin
  if tg_op = 'DELETE' then
    parent_period_id := old.payroll_period_id;
  else
    parent_period_id := new.payroll_period_id;
  end if;

  select status into parent_status
  from public.staff_payroll_periods
  where id = parent_period_id;

  if parent_status is null then
    raise exception 'Kỳ lương của phiếu không tồn tại.';
  end if;

  if parent_status = 'void' then
    raise exception 'Kỳ lương đã huỷ, không thể sửa phiếu lương.';
  end if;

  if parent_status = 'closed' then
    if tg_op = 'DELETE' then
      raise exception 'Kỳ lương đã chốt, không thể xoá phiếu lương.';
    end if;

    if tg_op = 'INSERT' then
      raise exception 'Kỳ lương đã chốt, không thể thêm phiếu lương.';
    end if;

    if tg_op = 'UPDATE' then
      if old.status = 'approved'
        and new.status = 'paid'
        and (to_jsonb(new) - 'status' - 'updated_at') = (to_jsonb(old) - 'status' - 'updated_at') then
        return new;
      end if;

      raise exception 'Kỳ lương đã chốt, chỉ được đánh dấu phiếu đã trả.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists staff_payslips_enforce_period_lock on public.staff_payslips;
create trigger staff_payslips_enforce_period_lock
before insert or update or delete on public.staff_payslips
for each row execute function public.enforce_staff_payslip_period_lock();

alter table public.staff_payroll_periods enable row level security;
alter table public.staff_payslips enable row level security;

drop policy if exists staff_payroll_periods_admin_all on public.staff_payroll_periods;
create policy staff_payroll_periods_admin_all on public.staff_payroll_periods
  for all
  using (auth.uid() in (select id from public.users where restaurant_id = staff_payroll_periods.restaurant_id and role = 'ADMIN'))
  with check (auth.uid() in (select id from public.users where restaurant_id = staff_payroll_periods.restaurant_id and role = 'ADMIN'));

drop policy if exists staff_payslips_admin_all on public.staff_payslips;
create policy staff_payslips_admin_all on public.staff_payslips
  for all
  using (auth.uid() in (select id from public.users where restaurant_id = staff_payslips.restaurant_id and role = 'ADMIN'))
  with check (auth.uid() in (select id from public.users where restaurant_id = staff_payslips.restaurant_id and role = 'ADMIN'));

drop policy if exists staff_payslips_staff_read_own on public.staff_payslips;
create policy staff_payslips_staff_read_own on public.staff_payslips
  for select
  using (auth.uid() = staff_user_id);

revoke all on table public.staff_payroll_periods from anon;
revoke all on table public.staff_payslips from anon;
revoke all on table public.staff_payroll_periods from authenticated;
revoke all on table public.staff_payslips from authenticated;

grant select on table public.staff_payroll_periods to authenticated;
grant select on table public.staff_payslips to authenticated;
