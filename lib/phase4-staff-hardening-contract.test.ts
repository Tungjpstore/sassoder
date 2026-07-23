import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sessionSource = readFileSync("lib/session.ts", "utf8");
const staffAuthSource = readFileSync("features/staff/services/staff-app-auth-service.ts", "utf8");
const staffPinSource = readFileSync("features/staff/services/staff-pin-service.ts", "utf8");
const staffSessionSource = readFileSync("features/staff/services/staff-session-service.ts", "utf8");
const payrollSource = readFileSync("features/staff/services/staff-payroll-service.ts", "utf8");
const restaurantServiceSource = readFileSync("services/restaurant-service.ts", "utf8");
const authServiceSource = readFileSync("services/auth-service.ts", "utf8");
const migrationFiles = readFileSync("supabase/migrations/20260723193000_staff_payroll_atomic_regeneration.sql", "utf8");
const authMigration = readFileSync("supabase/migrations/20260723190000_staff_auth_epoch_and_atomic_counters.sql", "utf8");
const hrRlsMigration = readFileSync("supabase/migrations/20260723191000_staff_hr_rls_scope.sql", "utf8");
const rlsHelperMigration = readFileSync("supabase/migrations/20260723192000_staff_rls_auth_epoch_and_id_scope.sql", "utf8");

test("dashboard profile resolution is bound to auth user id and never falls back by email", () => {
  assert.doesNotMatch(sessionSource, /\.eq\("email", user\.email\.toLowerCase\(\)\)/);
  const restaurantResolver = restaurantServiceSource.slice(
    restaurantServiceSource.indexOf("export async function getRestaurantForUser"),
    restaurantServiceSource.indexOf("async function getRestaurantRowForUser")
  );
  assert.doesNotMatch(restaurantResolver, /\.eq\("email"/);
  assert.match(sessionSource, /eq\("id", user\.id\)/);
  assert.doesNotMatch(sessionSource, /user\.issuedAt|claims\.iat/);
});

test("temporary-password gate fails closed and force logout revokes app auth epoch", () => {
  assert.doesNotMatch(staffAuthSource, /if \(result\.error \|\| !result\.data\) return \{ mustChangePassword: false/);
  assert.match(staffAuthSource, /throw new AppError\("Không xác thực được trạng thái mật khẩu nhân viên/);
  assert.match(staffAuthSource, /session\.role !== "STAFF"/);
  assert.match(staffSessionSource, /auth_revoked_at/);
  assert.match(authServiceSource, /auth_revoked_at: null/);
  assert.match(staffSessionSource, /updateUserById|revokeStaffAuthSession/);
  assert.doesNotMatch(staffSessionSource, /Không tìm thấy phiên đang hoạt động để buộc đăng xuất/);
  assert.match(staffSessionSource, /new Set\(\[targetUserId, \.\.\.sessions\.map/);
  assert.match(staffAuthSource, /revokeResult\.error/);
  assert.match(staffAuthSource, /sessionsResult\.error/);
  assert.match(staffAuthSource, /sessionMemberUpdate\.error/);
  assert.match(staffPinSource, /sessionMemberUpdate\.error/);
  assert.match(sessionSource, /linked staff profile \(including non-owner ADMIN staff\)/);
  assert.match(sessionSource, /else if \(profileRow\.role === "STAFF"\)/);
});

test("staff PIN and password counters use an atomic database increment", () => {
  assert.match(staffPinSource, /rpc\("record_staff_auth_failure"/);
  assert.match(staffAuthSource, /rpc\("record_staff_auth_failure"/);
  assert.match(authMigration, /for update/i);
  assert.match(authMigration, /grant execute on function public\.record_staff_auth_failure[\s\S]*to service_role/i);
  assert.match(authMigration, /guard_staff_auth_epoch_on_state_change/);
});

test("attendance session signing uses a dedicated secret domain", () => {
  const secretBlock = staffSessionSource.slice(staffSessionSource.indexOf("function attendanceSessionSecret"), staffSessionSource.indexOf("function encodeTokenPayload"));
  assert.match(secretBlock, /STAFF_ATTENDANCE_SESSION_SECRET/);
  assert.doesNotMatch(secretBlock, /STAFF_ATTENDANCE_QR_SECRET|AUTH_SECRET|NEXTAUTH_SECRET|SUPABASE_SERVICE_ROLE_KEY/);
});

test("staff PIN hashing uses a dedicated production secret", () => {
  const secretBlock = staffPinSource.slice(staffPinSource.indexOf("function pinSecret"), staffPinSource.indexOf("export function normalizeStaffPin"));
  assert.match(secretBlock, /STAFF_PIN_PEPPER/);
  assert.doesNotMatch(secretBlock, /AUTH_RATE_LIMIT_SECRET|SUPABASE_SERVICE_ROLE_KEY/);
});

test("payroll generation includes salaried staff, approved leave/overtime, and avoids overtime double counting", () => {
  assert.match(payrollSource, /attendance_approval_requests/);
  assert.match(payrollSource, /profileMap\.keys\(\)/);
  assert.match(payrollSource, /regularWorkMinutes/);
  assert.match(payrollSource, /overtimeMinutes/);
  assert.match(payrollSource, /resolvePayrollInsuranceBase/);
  assert.match(payrollSource, /baseSalary: insuranceBaseSalary/);
  assert.doesNotMatch(payrollSource, /const basePay = Math\.round\(\(workMinutes \/ 60\) \* hourlyRate\);/);
  assert.match(payrollSource, /employment_status === "active"/);
  assert.match(payrollSource, /member\.employment_status !== "active"/);
  assert.doesNotMatch(payrollSource, /const seen = new Set/);
  assert.match(payrollSource, /Mâu thuẫn nghỉ phép có lương và không lương/);
  assert.match(payrollSource, /rpc\("regenerate_staff_payroll_period_atomic"/);
});

test("payroll RLS is tenant-scoped for staff self reads", () => {
  assert.match(migrationFiles, /staff_payslips_staff_read_own[\s\S]*restaurant_id = app_private\.current_restaurant_id\(\)/i);
  assert.match(migrationFiles, /cross-tenant or mismatched period links/i);
  assert.match(migrationFiles, /v_period\.id is not null/);
  assert.match(migrationFiles, /staff_user\.id is distinct from staff\.user_id/);
  assert.match(migrationFiles, /if parent_status is null then[\s\S]*if tg_op = 'DELETE' then[\s\S]*return old/i);
});

test("sensitive HR records are self/admin scoped and direct authenticated mutation is revoked", () => {
  for (const table of ["staff_reviews", "staff_contracts", "staff_documents", "staff_devices"]) {
    assert.match(hrRlsMigration, new RegExp(`public\\.${table}`));
  }
  assert.match(hrRlsMigration, /revoke insert, update, delete on table[\s\S]*from authenticated/i);
  assert.match(hrRlsMigration, /own_member\.user_id = auth\.uid\(\)/i);
  assert.match(hrRlsMigration, /app_private\.current_user_role\(\) = 'ADMIN'/i);
});

test("RLS tenant helpers bind by auth uid and reject revoked staff JWTs", () => {
  assert.match(rlsHelperMigration, /users\.id = request_context\.jwt_user_id/);
  assert.doesNotMatch(rlsHelperMigration, /lower\(users\.email\)|jwt_email/);
  assert.match(rlsHelperMigration, /staff\.auth_revoked_at/);
  assert.match(rlsHelperMigration, /users\.account_status is distinct from 'blocked'/i);
  assert.doesNotMatch(rlsHelperMigration, /jwt_issued_at|extract\(epoch from staff\.auth_revoked_at\)/i);
});
