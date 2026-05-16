-- Attendance must be a baseline operational capability for every active staff role.
insert into public.staff_role_permissions (restaurant_id, role_id, permission_key)
select role.restaurant_id, role.id, 'attendance.clock'
from public.staff_roles role
where role.is_active = true
on conflict (role_id, permission_key) do nothing;

alter table public.staff_contracts
  add column if not exists template_code text,
  add column if not exists contract_number text,
  add column if not exists job_title text,
  add column if not exists work_location text,
  add column if not exists salary_amount numeric(14,2),
  add column if not exists salary_currency text not null default 'VND',
  add column if not exists salary_payment_method text,
  add column if not exists working_time text,
  add column if not exists rest_time text,
  add column if not exists e_signature_status text not null default 'draft',
  add column if not exists e_contract_provider text,
  add column if not exists e_contract_id text,
  add column if not exists signed_document_url text,
  add column if not exists signature_audit jsonb not null default '[]'::jsonb,
  add column if not exists content_snapshot jsonb not null default '{}'::jsonb;

update public.staff_contracts
set template_code = case contract_type
  when 'probation' then 'restaurant_probation'
  when 'part_time' then 'restaurant_part_time'
  else 'restaurant_fixed_term'
end
where template_code is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'staff_contracts_template_code_check'
      and conrelid = 'public.staff_contracts'::regclass
  ) then
    alter table public.staff_contracts
      add constraint staff_contracts_template_code_check
      check (
        template_code is null
        or template_code in (
          'restaurant_fixed_term',
          'restaurant_indefinite',
          'restaurant_part_time',
          'restaurant_probation'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'staff_contracts_e_signature_status_check'
      and conrelid = 'public.staff_contracts'::regclass
  ) then
    alter table public.staff_contracts
      add constraint staff_contracts_e_signature_status_check
      check (e_signature_status in ('draft', 'pending_employee', 'pending_employer', 'signed', 'declined', 'voided'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'staff_contracts_salary_amount_check'
      and conrelid = 'public.staff_contracts'::regclass
  ) then
    alter table public.staff_contracts
      add constraint staff_contracts_salary_amount_check
      check (salary_amount is null or salary_amount >= 0);
  end if;
end $$;

create index if not exists staff_contracts_signature_status_idx
  on public.staff_contracts (restaurant_id, e_signature_status, created_at desc);

create index if not exists staff_contracts_template_idx
  on public.staff_contracts (restaurant_id, template_code, start_date desc);

create index if not exists staff_contracts_number_idx
  on public.staff_contracts (restaurant_id, contract_number)
  where contract_number is not null;
