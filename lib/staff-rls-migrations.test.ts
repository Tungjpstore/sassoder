import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const foundationSql = readFileSync("supabase/migrations/20260514103000_staff_operations_foundation.sql", "utf8");
const pinSql = readFileSync("supabase/migrations/20260514121538_staff_pin_login_security.sql", "utf8");
const requestWorkflowSql = readFileSync("supabase/migrations/20260516113906_staff_request_workflows.sql", "utf8");
const adminWorkflowSql = readFileSync("supabase/migrations/20260516103000_staff_admin_workflows.sql", "utf8");
const qrDeviceTrustSql = readFileSync("supabase/migrations/20260518190204_staff_attendance_qr_device_trust.sql", "utf8");
const hardeningSql = readFileSync("supabase/migrations/20260519103000_staff_operations_security_hardening.sql", "utf8");

const coreHrTables = [
  "staff_members",
  "staff_branch_assignments",
  "shifts",
  "shift_assignments",
  "attendance_logs",
  "attendance_approval_requests",
  "staff_activity_logs",
  "staff_sessions"
];

const adminHrTables = ["staff_reviews", "staff_contracts", "staff_documents", "staff_devices"];

function sqlPattern(text: string) {
  return new RegExp(text.replace(/\s+/g, "\\s+"), "i");
}

test("staff operations migration enables RLS for core HR tables", () => {
  for (const table of coreHrTables) {
    assert.match(foundationSql, sqlPattern(`alter table public.${table} enable row level security`), table);
  }
});

test("staff operations migration grants authenticated Data API access with RLS policies", () => {
  for (const table of coreHrTables) {
    assert.match(foundationSql, sqlPattern(`public.${table}`), table);
  }

  assert.match(foundationSql, /grant select on table[\s\S]*public\.staff_members[\s\S]*to authenticated/i);
  assert.match(foundationSql, /grant insert, update on table[\s\S]*public\.attendance_logs[\s\S]*public\.attendance_approval_requests[\s\S]*to authenticated/i);
  assert.match(foundationSql, /restaurant_id = app_private\.current_restaurant_id\(\)/);
  assert.match(foundationSql, /app_private\.current_user_role\(\) = 'ADMIN'/);
});

test("staff attendance policies allow own writes and admin review without cross-tenant access", () => {
  assert.match(foundationSql, /staff_user_id = auth\.uid\(\) or app_private\.current_user_role\(\) = 'ADMIN'/);
  assert.match(foundationSql, /requested_by = auth\.uid\(\) or app_private\.current_user_role\(\) = 'ADMIN'/);
  assert.match(foundationSql, /admins can review attendance approvals/);
});

test("staff PIN security migration revokes sensitive hash columns from authenticated clients", () => {
  assert.match(pinSql, /revoke select \(\s*pin_hash,\s*pin_lookup_hash\s*\) on public\.staff_members from authenticated/i);
  assert.match(pinSql, /revoke update \([\s\S]*pin_hash[\s\S]*pin_lookup_hash[\s\S]*pin_attempts[\s\S]*\) on public\.staff_members from authenticated/i);
});

test("staff request workflow migration keeps leave and shift swap request types additive", () => {
  assert.match(requestWorkflowSql, /'leave_request'/);
  assert.match(requestWorkflowSql, /'shift_swap'/);
  assert.match(requestWorkflowSql, /attendance_approvals_staff_type_status_idx/);
  assert.match(requestWorkflowSql, /attendance_approvals_branch_type_status_idx/);
});

test("staff admin workflow tables have RLS and admin-only mutations", () => {
  for (const table of adminHrTables) {
    assert.match(adminWorkflowSql, sqlPattern(`alter table public.${table} enable row level security`), table);
    assert.match(adminWorkflowSql, sqlPattern(`admins can mutate own ${table.replace(/_/g, " ")}`), table);
  }
});

test("staff QR attendance migration stores hashes with RLS", () => {
  assert.match(qrDeviceTrustSql, /create table if not exists public\.staff_attendance_qr_tokens/i);
  assert.match(qrDeviceTrustSql, /token_hash text not null/i);
  assert.match(qrDeviceTrustSql, /alter table public\.staff_attendance_qr_tokens enable row level security/i);
  assert.match(qrDeviceTrustSql, /admins can mutate own staff attendance qr tokens/i);
  assert.doesNotMatch(qrDeviceTrustSql, /token text not null/i);
});

test("staff device trust migration adds fingerprint binding and device approvals", () => {
  assert.match(qrDeviceTrustSql, /add column if not exists device_fingerprint text/i);
  assert.match(qrDeviceTrustSql, /add column if not exists trusted_for_attendance boolean not null default false/i);
  assert.match(qrDeviceTrustSql, /staff_devices_active_fingerprint_idx/i);
  assert.match(qrDeviceTrustSql, /'device_restriction'/i);
});

test("staff operations hardening revokes direct client mutation paths", () => {
  assert.match(hardeningSql, /revoke insert, update, delete on table[\s\S]*public\.staff_members[\s\S]*public\.shift_assignments[\s\S]*from authenticated/i);
  assert.match(hardeningSql, /revoke insert, update, delete on table[\s\S]*public\.attendance_logs[\s\S]*public\.attendance_approval_requests[\s\S]*public\.staff_sessions[\s\S]*from authenticated/i);
  assert.match(hardeningSql, /revoke insert, update, delete on table public\.notifications from authenticated/i);
  assert.match(hardeningSql, /drop policy if exists "staff can write own attendance logs"/i);
  assert.match(hardeningSql, /drop policy if exists "staff can update own open attendance logs"/i);
  assert.match(hardeningSql, /drop policy if exists "staff can create own attendance approvals"/i);
  assert.match(hardeningSql, /drop policy if exists "restaurant users can update own notifications"/i);
  assert.match(hardeningSql, /drop policy if exists "staff can write own sessions"/i);
});

test("staff operations hardening keeps self visibility scoped by auth uid", () => {
  assert.match(hardeningSql, /app_private\.current_user_role\(\) = 'ADMIN'/);
  assert.match(hardeningSql, /or user_id = auth\.uid\(\)/);
  assert.match(hardeningSql, /or staff_user_id = auth\.uid\(\)/);
  assert.match(hardeningSql, /or requested_by = auth\.uid\(\)/);
  assert.match(hardeningSql, /or actor_user_id = auth\.uid\(\)/);
});

test("staff operations hardening makes QR attendance one-time use", () => {
  assert.match(hardeningSql, /add column if not exists consumed_at timestamptz/i);
  assert.match(hardeningSql, /add column if not exists consumed_by_staff_member_id uuid references public\.staff_members\(id\)/i);
  assert.match(hardeningSql, /staff_attendance_qr_tokens_active_once_idx/i);
  assert.match(hardeningSql, /where revoked_at is null and consumed_at is null/i);
});

test("staff operations hardening blocks overlapping active shift assignments atomically", () => {
  assert.match(hardeningSql, /create or replace function public\.prevent_shift_assignment_overlap\(\)/i);
  assert.match(hardeningSql, /pg_advisory_xact_lock\(hashtext\(new\.staff_member_id::text\)\)/i);
  assert.match(hardeningSql, /existing\.status in \('scheduled', 'confirmed', 'swapped'\)/i);
  assert.match(hardeningSql, /tsrange\(new_start, new_end, '\[\)'\)/i);
  assert.match(hardeningSql, /create trigger prevent_shift_assignment_overlap/i);
  assert.match(hardeningSql, /using errcode = '23P01'/i);
});
