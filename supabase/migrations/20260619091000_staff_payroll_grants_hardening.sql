-- Tighten table-level grants for payroll tables after production apply.
-- RLS policies still own row access; grants only expose SELECT to signed-in clients.

revoke all on table public.staff_payroll_periods from anon;
revoke all on table public.staff_payslips from anon;
revoke all on table public.staff_payroll_periods from authenticated;
revoke all on table public.staff_payslips from authenticated;

grant select on table public.staff_payroll_periods to authenticated;
grant select on table public.staff_payslips to authenticated;
