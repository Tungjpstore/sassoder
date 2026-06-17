import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const payrollServiceSource = readFileSync("features/staff/services/staff-payroll-service.ts", "utf8");
const staffAdminPageSource = readFileSync("app/dashboard/staff/page.tsx", "utf8");
const staffMobilePageSource = readFileSync("app/dashboard/staff/mobile/page.tsx", "utf8");
const staffWorkspaceSource = readFileSync("components/dashboard-v2/real/staff-workspace-v2.tsx", "utf8");
const staffMobileWorkspaceSource = readFileSync("features/staff/components/staff-mobile-redesign-workspace.tsx", "utf8");

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
  assert.match(staffMobileWorkspaceSource, /Không tải được dữ liệu lương thật/);
});

test("staff mobile permission failures are visible instead of silently hiding modules", () => {
  assert.match(staffMobilePageSource, /loadStaffMobilePermissions/);
  assert.match(staffMobilePageSource, /permissionDataError=\{permissions\.error\}/);
  assert.doesNotMatch(staffMobilePageSource, /getStaffEffectivePermissions\(session\)[\s\S]*?catch\(\(\) => \[\] as string\[\]\)/);
  assert.match(staffMobileWorkspaceSource, /permissionDataError/);
});
