import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const payrollServiceSource = readFileSync("features/staff/services/staff-payroll-service.ts", "utf8");
const staffAdminPageSource = readFileSync("app/dashboard/staff/page.tsx", "utf8");
const staffMobilePageSource = readFileSync("app/dashboard/staff/mobile/page.tsx", "utf8");
const staffWorkspaceSource = readFileSync("components/dashboard-v2/real/staff-workspace-v2.tsx", "utf8");
const staffMobileWorkspaceSource = readFileSync("features/staff/components/staff-mobile-redesign-workspace.tsx", "utf8");
const staffActionsSource = readFileSync("app/dashboard/actions/staff.ts", "utf8");
const payrollPeriodsMigration = readFileSync("supabase/migrations/20260619090000_staff_payroll_periods.sql", "utf8");

test("staff payroll service fails loud on Supabase query errors", () => {
  assert.match(payrollServiceSource, /throwIfSupabaseError\(error, "Không tải được cấu hình lương"\)/);
  assert.match(payrollServiceSource, /throwIfSupabaseError\(error, "Không tải được hồ sơ lương nhân viên"\)/);
  assert.match(payrollServiceSource, /throwIfSupabaseError\(memberResult\.error, "Không xác thực được hồ sơ nhân viên"\)/);
  assert.doesNotMatch(payrollServiceSource, /if \(error \|\| !data\) return DEFAULT_PAYROLL_DEDUCTIONS/);
  assert.doesNotMatch(payrollServiceSource, /if \(error \|\| !data\) return \[\]/);
});

test("staff payroll UI does not hide production data errors behind empty payroll", () => {
  assert.match(staffAdminPageSource, /Promise\.allSettled/);
  assert.match(staffAdminPageSource, /payrollDataError=\{payroll\.error\}/);
  assert.doesNotMatch(staffAdminPageSource, /catch\(\(\) => DEFAULT_PAYROLL_DEDUCTIONS\)/);
  assert.doesNotMatch(staffAdminPageSource, /catch\(\(\) => \[\]\)/);
  assert.match(staffWorkspaceSource, /Không thể hiển thị lương thưởng bằng dữ liệu thật/);
});

test("staff mobile keeps attendance available while surfacing payroll load errors", () => {
  assert.match(staffMobilePageSource, /loadStaffPayrollSelf/);
  assert.match(staffMobilePageSource, /payrollDataError=\{payroll\.error\}/);
  assert.doesNotMatch(staffMobilePageSource, /getStaffPayrollSelfView\([\s\S]*?catch\(\(\) => null\)/);
  assert.match(payrollServiceSource, /from\("staff_payslips"\)/);
  assert.match(payrollServiceSource, /eq\("staff_member_id", member\.id\)/);
  assert.match(staffMobileWorkspaceSource, /Phiếu lương gần nhất/);
  assert.match(staffMobileWorkspaceSource, /Không tải được dữ liệu lương thật/);
});

test("staff mobile permission failures are visible instead of silently hiding modules", () => {
  assert.match(staffMobilePageSource, /loadStaffMobilePermissions/);
  assert.match(staffMobilePageSource, /permissionDataError=\{permissions\.error\}/);
  assert.doesNotMatch(staffMobilePageSource, /getStaffEffectivePermissions\(session\)[\s\S]*?catch\(\(\) => \[\] as string\[\]\)/);
  assert.match(staffMobileWorkspaceSource, /permissionDataError/);
});

test("staff payroll has real period and payslip workflow instead of client-only totals", () => {
  assert.match(payrollPeriodsMigration, /create table if not exists public\.staff_payroll_periods/);
  assert.match(payrollPeriodsMigration, /create table if not exists public\.staff_payslips/);
  assert.match(payrollPeriodsMigration, /grant select on table public\.staff_payslips to authenticated/);
  assert.match(payrollPeriodsMigration, /enforce_staff_payroll_period_transition/);
  assert.match(payrollPeriodsMigration, /enforce_staff_payslip_period_lock/);
  assert.match(payrollPeriodsMigration, /Kỳ lương đã chốt, chỉ được đánh dấu phiếu đã trả/);
  assert.match(payrollServiceSource, /createStaffPayrollPeriodDraft/);
  assert.match(payrollServiceSource, /updateStaffPayrollPeriodStatus/);
  assert.match(payrollServiceSource, /updateStaffPayslipStatus/);
  assert.match(payrollServiceSource, /from\("attendance_logs"\)/);
  assert.match(payrollServiceSource, /role_code !== "owner"/);
  assert.match(payrollServiceSource, /Cần duyệt tất cả phiếu lương trước khi chốt kỳ/);
  assert.match(payrollServiceSource, /period\.status === "closed"/);
  assert.match(payrollServiceSource, /if \(period\.status !== "closed"\) \{\s*await refreshPayrollPeriodTotals/);
  assert.match(staffActionsSource, /generateStaffPayrollPeriodAction/);
  assert.match(staffActionsSource, /updateStaffPayrollPeriodStatusAction/);
  assert.match(staffActionsSource, /updateStaffPayslipStatusAction/);
  assert.match(staffActionsSource, /createStaffPayrollPeriodDraft/);
  assert.match(staffWorkspaceSource, /generateStaffPayrollPeriodAction/);
  assert.match(staffWorkspaceSource, /updateStaffPayrollPeriodStatusAction/);
  assert.match(staffWorkspaceSource, /updateStaffPayslipStatusAction/);
  assert.match(staffWorkspaceSource, /Không lấy tổng tiền từ UI/);
});
