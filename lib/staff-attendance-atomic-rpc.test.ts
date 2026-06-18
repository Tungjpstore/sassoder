import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationSql = readFileSync("supabase/migrations/20260618100957_staff_hr_attendance_atomic_review.sql", "utf8");
const clockAtomicMigrationSql = readFileSync("supabase/migrations/20260618103210_staff_hr_attendance_clock_atomic.sql", "utf8");
const rejectRestoreMigrationSql = readFileSync("supabase/migrations/20260618103817_staff_hr_attendance_reject_restore.sql", "utf8");
const attendanceServiceSource = readFileSync("features/attendance/services/attendance-service.ts", "utf8");

function functionBody(source: string, name: string) {
  const match = new RegExp(`(?:export\\s+)?async function ${name}\\(`).exec(source);
  assert.ok(match?.index !== undefined, `${name} should exist`);

  const paramsStart = source.indexOf("(", match.index);
  let parenDepth = 0;
  let paramsEnd = -1;
  for (let index = paramsStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth -= 1;
    if (parenDepth === 0) {
      paramsEnd = index;
      break;
    }
  }

  const bodyStart = paramsEnd >= 0 ? source.indexOf("{", paramsEnd) : -1;
  assert.ok(bodyStart > match.index, `${name} should have a body`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(bodyStart, index + 1);
  }

  throw new Error(`Could not parse body for ${name}`);
}

test("attendance atomic RPC migration keeps privileged logic service-role only", () => {
  assert.match(migrationSql, /create or replace function app_private\.adjust_staff_attendance_log_atomic/i);
  assert.match(migrationSql, /create or replace function public\.adjust_staff_attendance_log_atomic/i);
  assert.match(migrationSql, /create or replace function app_private\.review_attendance_approval_atomic/i);
  assert.match(migrationSql, /create or replace function public\.review_attendance_approval_atomic/i);
  assert.match(migrationSql, /language plpgsql[\s\S]*security definer/i);
  assert.match(migrationSql, /language sql[\s\S]*security invoker/i);
  assert.match(migrationSql, /revoke all on function app_private\.adjust_staff_attendance_log_atomic[\s\S]*from public, anon, authenticated/i);
  assert.match(migrationSql, /grant execute on function app_private\.adjust_staff_attendance_log_atomic[\s\S]*to service_role/i);
  assert.match(migrationSql, /revoke all on function public\.review_attendance_approval_atomic[\s\S]*from public, anon, authenticated/i);
  assert.match(migrationSql, /grant execute on function public\.review_attendance_approval_atomic[\s\S]*to service_role/i);
});

test("manual attendance adjustment RPC locks attendance, approval and audit together", () => {
  assert.match(migrationSql, /from public\.attendance_logs logs[\s\S]*for update/i);
  assert.match(migrationSql, /Actor cannot adjust own attendance/i);
  assert.match(migrationSql, /Staff already has another open attendance session/i);
  assert.match(migrationSql, /update public\.attendance_logs[\s\S]*approval_state = 'pending'/i);
  assert.match(migrationSql, /from public\.attendance_approval_requests approvals[\s\S]*for update/i);
  assert.match(migrationSql, /insert into public\.attendance_approval_requests/i);
  assert.match(migrationSql, /insert into public\.staff_activity_logs/i);
  assert.match(migrationSql, /'attendance\.adjusted'/i);
  assert.match(migrationSql, /'hardFailAudit', true/i);
});

test("approval review RPC atomically reviews approval and attendance log", () => {
  assert.match(migrationSql, /from public\.attendance_approval_requests approvals[\s\S]*for update/i);
  assert.match(migrationSql, /Attendance approval already reviewed/i);
  assert.match(migrationSql, /Actor cannot review own attendance request/i);
  assert.match(migrationSql, /Actor cannot review own attendance/i);
  assert.match(migrationSql, /update public\.attendance_approval_requests[\s\S]*status = p_next_status/i);
  assert.match(migrationSql, /from public\.attendance_logs logs[\s\S]*for update/i);
  assert.match(migrationSql, /update public\.attendance_logs[\s\S]*approval_state = case when p_next_status = 'approved'/i);
  assert.match(migrationSql, /insert into public\.staff_activity_logs/i);
  assert.match(migrationSql, /attendance\.approval_approved/i);
  assert.match(migrationSql, /attendance\.approval_rejected/i);
});

test("attendance service delegates manual adjustment writes to the atomic RPC", () => {
  const body = functionBody(attendanceServiceSource, "adjustStaffAttendanceLog");
  assert.match(body, /supabase\.rpc\("adjust_staff_attendance_log_atomic"/);
  assert.match(body, /notifyManualAdjustmentApproval\(/);
  assert.doesNotMatch(body, /\.from\("attendance_logs"\)[\s\S]*\.update\(/);
  assert.doesNotMatch(body, /\.from\("attendance_approval_requests"\)[\s\S]*\.(?:insert|update)\(/);
  assert.doesNotMatch(body, /insertActivityLog\(/);
});

test("attendance service delegates approval review writes to the atomic RPC", () => {
  const body = functionBody(attendanceServiceSource, "reviewAttendanceApproval");
  assert.match(body, /supabase\.rpc\("review_attendance_approval_atomic"/);
  assert.doesNotMatch(body, /\.from\("attendance_approval_requests"\)[\s\S]*\.update\(/);
  assert.doesNotMatch(body, /\.from\("attendance_logs"\)[\s\S]*\.update\(/);
  assert.doesNotMatch(body, /insertActivityLog\(/);
});

test("clock-out writes are conditional so concurrent requests cannot overwrite a closed session", () => {
  const body = functionBody(attendanceServiceSource, "clockOutStaffAttendance");
  assert.match(body, /supabase\.rpc\("clock_out_staff_attendance_atomic"/);
  assert.match(clockAtomicMigrationSql, /from public\.attendance_logs logs[\s\S]*for update/i);
  assert.match(clockAtomicMigrationSql, /if v_existing\.clock_out_at is not null then[\s\S]*Attendance session already closed/i);
  assert.match(clockAtomicMigrationSql, /where id = v_existing\.id[\s\S]*and clock_out_at is null[\s\S]*returning \* into v_updated/i);
  assert.match(attendanceServiceSource, /Attendance session already closed[\s\S]*Phiên chấm công này đã được kết ca bởi thao tác khác/);
});

test("manual adjustment notification helper no longer creates approval rows itself", () => {
  const body = functionBody(attendanceServiceSource, "notifyManualAdjustmentApproval");
  assert.match(body, /enqueueAttendanceApprovalEvent\(/);
  assert.match(body, /approvalId/);
  assert.doesNotMatch(body, /\.from\("attendance_approval_requests"\)[\s\S]*\.insert\(/);
});

test("clock-in and clock-out RPCs write attendance approvals and audit in one transaction", () => {
  assert.match(clockAtomicMigrationSql, /create or replace function app_private\.clock_in_staff_attendance_atomic/i);
  assert.match(clockAtomicMigrationSql, /create or replace function app_private\.clock_out_staff_attendance_atomic/i);
  assert.match(clockAtomicMigrationSql, /app_private\.apply_attendance_approval_requests/i);
  assert.match(clockAtomicMigrationSql, /insert into public\.attendance_logs/i);
  assert.match(clockAtomicMigrationSql, /update public\.attendance_logs[\s\S]*clock_out_at = p_clock_out_at/i);
  assert.match(clockAtomicMigrationSql, /insert into public\.attendance_approval_requests/i);
  assert.match(clockAtomicMigrationSql, /insert into public\.staff_activity_logs/i);
  assert.match(clockAtomicMigrationSql, /'hardFailAudit', true/i);
  assert.match(clockAtomicMigrationSql, /grant execute on function public\.clock_in_staff_attendance_atomic[\s\S]*to service_role/i);
  assert.match(clockAtomicMigrationSql, /grant execute on function public\.clock_out_staff_attendance_atomic[\s\S]*to service_role/i);
});

test("attendance service delegates clock-in and clock-out mutations to atomic RPCs", () => {
  const clockInBody = functionBody(attendanceServiceSource, "clockInStaffAttendance");
  const clockOutBody = functionBody(attendanceServiceSource, "clockOutStaffAttendance");

  assert.match(clockInBody, /supabase\.rpc\("clock_in_staff_attendance_atomic"/);
  assert.match(clockOutBody, /supabase\.rpc\("clock_out_staff_attendance_atomic"/);
  assert.match(clockInBody, /approvalDraftsForRpc\(approvalDrafts\)/);
  assert.match(clockOutBody, /approvalDraftsForRpc\(approvalDrafts\)/);
  assert.doesNotMatch(clockInBody, /\.from\("attendance_logs"\)[\s\S]*\.insert\(/);
  assert.doesNotMatch(clockOutBody, /\.from\("attendance_logs"\)[\s\S]*\.update\(/);
  assert.doesNotMatch(clockInBody, /insertActivityLog\(/);
  assert.doesNotMatch(clockOutBody, /insertActivityLog\(/);
});

test("rejected manual attendance edits restore the previous payroll-safe attendance snapshot", () => {
  assert.match(attendanceServiceSource, /previousAttendance:\s*\{/);
  assert.match(attendanceServiceSource, /previousClockInAt: existing\.clock_in_at/);
  assert.match(rejectRestoreMigrationSql, /v_previous := v_approval\.requested_payload -> 'previousAttendance'/);
  assert.match(rejectRestoreMigrationSql, /p_next_status = 'rejected'[\s\S]*v_approval\.request_type = 'attendance_edit'/);
  assert.match(rejectRestoreMigrationSql, /clock_in_at = coalesce\(nullif\(v_previous ->> 'clockInAt'/);
  assert.match(rejectRestoreMigrationSql, /approval_state = case[\s\S]*v_previous ->> 'approvalState'/);
  assert.match(rejectRestoreMigrationSql, /'restoredPreviousAttendance', v_restored_previous/);
});
