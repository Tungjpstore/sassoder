import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const foundationSql = readFileSync("supabase/migrations/20260514103000_staff_operations_foundation.sql", "utf8");
const pinSql = readFileSync("supabase/migrations/20260514121538_staff_pin_login_security.sql", "utf8");
const requestWorkflowSql = readFileSync("supabase/migrations/20260516113906_staff_request_workflows.sql", "utf8");
const adminWorkflowSql = readFileSync("supabase/migrations/20260516103000_staff_admin_workflows.sql", "utf8");

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
  assert.match(foundationSql, /restaurant_id = public\.current_restaurant_id\(\)/);
  assert.match(foundationSql, /public\.current_user_role\(\) = 'ADMIN'/);
});

test("staff attendance policies allow own writes and admin review without cross-tenant access", () => {
  assert.match(foundationSql, /staff_user_id = auth\.uid\(\) or public\.current_user_role\(\) = 'ADMIN'/);
  assert.match(foundationSql, /requested_by = auth\.uid\(\) or public\.current_user_role\(\) = 'ADMIN'/);
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
