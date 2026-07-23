-- Payroll regeneration must replace a period snapshot in one transaction.

create schema if not exists app_private;
revoke all on schema app_private from public, anon;
grant usage on schema app_private to service_role;

create or replace function app_private.regenerate_staff_payroll_period_atomic(
  p_restaurant_id uuid,
  p_actor_user_id uuid,
  p_period_payload jsonb,
  p_payslips jsonb
)
returns table(period jsonb, payslip_count integer)
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_period public.staff_payroll_periods%rowtype;
  v_payload jsonb := coalesce(p_period_payload, '{}'::jsonb);
  v_payslips jsonb := coalesce(p_payslips, '[]'::jsonb);
begin
  if jsonb_typeof(v_payload) <> 'object' or jsonb_typeof(v_payslips) <> 'array' then
    raise exception 'Invalid payroll regeneration payload';
  end if;

  select * into v_period
  from public.staff_payroll_periods
  where restaurant_id = p_restaurant_id
    and period_start = (v_payload ->> 'period_start')::date
    and period_end = (v_payload ->> 'period_end')::date
  for update;

  if found and v_period.status <> 'draft' then
    raise exception 'Chỉ kỳ lương nháp mới được tạo lại snapshot.';
  end if;

  if not exists (
    select 1
    from public.users actor
    where actor.id = p_actor_user_id
      and actor.restaurant_id = p_restaurant_id
      and actor.account_status is distinct from 'blocked'
  ) then
    raise exception 'Payroll actor must belong to the restaurant and be active';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_payslips) as payload(
      staff_member_id uuid,
      staff_user_id uuid,
      branch_id uuid,
      period_start date,
      period_end date
    )
    left join public.staff_members staff
      on staff.id = payload.staff_member_id
     and staff.restaurant_id = p_restaurant_id
    left join public.users staff_user
      on staff_user.id = payload.staff_user_id
     and staff_user.restaurant_id = p_restaurant_id
    left join public.store_branches branch
      on branch.id = payload.branch_id
     and branch.restaurant_id = p_restaurant_id
    where staff.id is null
      or (payload.staff_user_id is not null and (staff_user.id is null or staff_user.id is distinct from staff.user_id))
      or (payload.branch_id is not null and branch.id is null)
      or payload.period_start is distinct from (v_payload ->> 'period_start')::date
      or payload.period_end is distinct from (v_payload ->> 'period_end')::date
  ) then
    raise exception 'Payroll payload contains cross-tenant or mismatched period links';
  end if;

  if v_period.id is not null then
    update public.staff_payroll_periods
    set period_label = coalesce(nullif(v_payload ->> 'period_label', ''), period_label),
        staff_count = greatest(0, coalesce((v_payload ->> 'staff_count')::integer, 0)),
        gross_total = greatest(0, coalesce((v_payload ->> 'gross_total')::integer, 0)),
        net_total = greatest(0, coalesce((v_payload ->> 'net_total')::integer, 0)),
        employee_insurance_total = greatest(0, coalesce((v_payload ->> 'employee_insurance_total')::integer, 0)),
        employer_insurance_total = greatest(0, coalesce((v_payload ->> 'employer_insurance_total')::integer, 0)),
        personal_income_tax_total = greatest(0, coalesce((v_payload ->> 'personal_income_tax_total')::integer, 0)),
        snapshot = coalesce(v_payload -> 'snapshot', '{}'::jsonb),
        updated_at = now()
    where id = v_period.id
    returning * into v_period;
  else
    insert into public.staff_payroll_periods (
      restaurant_id, period_label, period_start, period_end, status,
      staff_count, gross_total, net_total, employee_insurance_total,
      employer_insurance_total, personal_income_tax_total, snapshot, created_by
    ) values (
      p_restaurant_id,
      coalesce(nullif(v_payload ->> 'period_label', ''), (v_payload ->> 'period_start') || ' - ' || (v_payload ->> 'period_end')),
      (v_payload ->> 'period_start')::date,
      (v_payload ->> 'period_end')::date,
      'draft',
      greatest(0, coalesce((v_payload ->> 'staff_count')::integer, 0)),
      greatest(0, coalesce((v_payload ->> 'gross_total')::integer, 0)),
      greatest(0, coalesce((v_payload ->> 'net_total')::integer, 0)),
      greatest(0, coalesce((v_payload ->> 'employee_insurance_total')::integer, 0)),
      greatest(0, coalesce((v_payload ->> 'employer_insurance_total')::integer, 0)),
      greatest(0, coalesce((v_payload ->> 'personal_income_tax_total')::integer, 0)),
      coalesce(v_payload -> 'snapshot', '{}'::jsonb),
      p_actor_user_id
    ) returning * into v_period;
  end if;

  delete from public.staff_payslips
  where restaurant_id = p_restaurant_id
    and payroll_period_id = v_period.id;

  if jsonb_array_length(v_payslips) > 0 then
    insert into public.staff_payslips (
      restaurant_id, payroll_period_id, staff_member_id, staff_user_id, branch_id,
      staff_name, employee_code, period_start, period_end, attendance_count,
      work_minutes, overtime_minutes, late_minutes, gross_pay, net_pay,
      employee_insurance_total, employer_insurance_total, personal_income_tax,
      payroll_profile_snapshot, deduction_snapshot, attendance_snapshot, status
    )
    select
      p_restaurant_id,
      v_period.id,
      payload.staff_member_id,
      payload.staff_user_id,
      payload.branch_id,
      payload.staff_name,
      payload.employee_code,
      payload.period_start,
      payload.period_end,
      greatest(0, coalesce(payload.attendance_count, 0)),
      greatest(0, coalesce(payload.work_minutes, 0)),
      greatest(0, coalesce(payload.overtime_minutes, 0)),
      greatest(0, coalesce(payload.late_minutes, 0)),
      greatest(0, coalesce(payload.gross_pay, 0)),
      greatest(0, coalesce(payload.net_pay, 0)),
      greatest(0, coalesce(payload.employee_insurance_total, 0)),
      greatest(0, coalesce(payload.employer_insurance_total, 0)),
      greatest(0, coalesce(payload.personal_income_tax, 0)),
      coalesce(payload.payroll_profile_snapshot, '{}'::jsonb),
      coalesce(payload.deduction_snapshot, '{}'::jsonb),
      coalesce(payload.attendance_snapshot, '[]'::jsonb),
      'draft'
    from jsonb_to_recordset(v_payslips) as payload(
      staff_member_id uuid,
      staff_user_id uuid,
      branch_id uuid,
      staff_name text,
      employee_code text,
      period_start date,
      period_end date,
      attendance_count integer,
      work_minutes integer,
      overtime_minutes integer,
      late_minutes integer,
      gross_pay integer,
      net_pay integer,
      employee_insurance_total integer,
      employer_insurance_total integer,
      personal_income_tax integer,
      payroll_profile_snapshot jsonb,
      deduction_snapshot jsonb,
      attendance_snapshot jsonb
    );
  end if;

  period := to_jsonb(v_period);
  payslip_count := jsonb_array_length(v_payslips);
  return next;
end;
$$;

revoke all on function app_private.regenerate_staff_payroll_period_atomic(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function app_private.regenerate_staff_payroll_period_atomic(uuid, uuid, jsonb, jsonb) to service_role;

create or replace function public.regenerate_staff_payroll_period_atomic(
  p_restaurant_id uuid,
  p_actor_user_id uuid,
  p_period_payload jsonb,
  p_payslips jsonb
)
returns table(period jsonb, payslip_count integer)
language sql
security invoker
set search_path = public, app_private
as $$
  select result.period, result.payslip_count
  from app_private.regenerate_staff_payroll_period_atomic(
    p_restaurant_id, p_actor_user_id, p_period_payload, p_payslips
  ) as result;
$$;

revoke all on function public.regenerate_staff_payroll_period_atomic(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.regenerate_staff_payroll_period_atomic(uuid, uuid, jsonb, jsonb) to service_role;

-- A restaurant delete can cascade through periods before the direct
-- restaurant FK on payslips. Let that referential cascade complete while
-- preserving the normal closed/void period mutation guards.
create or replace function public.enforce_staff_payslip_period_lock()
returns trigger
language plpgsql
set search_path = public
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
    if tg_op = 'DELETE' then
      return old;
    end if;
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

-- Self payslip reads must never cross a tenant boundary.
drop policy if exists staff_payslips_staff_read_own on public.staff_payslips;
create policy staff_payslips_staff_read_own on public.staff_payslips
  for select
  using (
    restaurant_id = app_private.current_restaurant_id()
    and auth.uid() = staff_user_id
  );

notify pgrst, 'reload schema';
