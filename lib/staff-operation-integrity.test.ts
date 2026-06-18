import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationSql = readFileSync("supabase/migrations/20260618090710_staff_hr_operation_integrity.sql", "utf8");
const atomicCreateSql = readFileSync("supabase/migrations/20260618092245_staff_hr_atomic_create_profile.sql", "utf8");
const atomicMutationSql = readFileSync("supabase/migrations/20260618093351_staff_hr_atomic_account_mutations.sql", "utf8");
const helperSource = readFileSync("services/staff-operation-integrity-service.ts", "utf8");
const staffActionsSource = readFileSync("app/dashboard/actions/staff.ts", "utf8");
const staffWorkspaceSource = readFileSync("components/dashboard-v2/real/staff-workspace-v2.tsx", "utf8");
const restaurantServiceSource = readFileSync("services/restaurant-service.ts", "utf8");

function exportedActionBodies(source: string) {
  const matches = [...source.matchAll(/export async function (\w+Action)\(/g)];
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = index + 1 < matches.length ? matches[index + 1].index ?? source.length : source.length;
    return {
      name: match[1],
      body: source.slice(start, end)
    };
  });
}

function functionBody(source: string, name: string) {
  const match = new RegExp(`(?:export\\s+)?async function ${name}\\(`).exec(source);
  assert.ok(match?.index !== undefined, `${name} should exist`);

  const paramsStart = source.indexOf("(", match.index);
  assert.ok(paramsStart > match.index, `${name} should have parameters`);

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

test("staff operation integrity migration adds a service-role-only idempotency ledger", () => {
  assert.match(migrationSql, /create table if not exists public\.staff_operation_requests/i);
  assert.match(migrationSql, /restaurant_id uuid not null references public\.restaurants\(id\) on delete cascade/i);
  assert.match(migrationSql, /operation_key text not null/i);
  assert.match(migrationSql, /operation_type text not null/i);
  assert.match(migrationSql, /status text not null default 'started'/i);
  assert.match(migrationSql, /status in \('started', 'completed', 'failed'\)/i);
  assert.match(migrationSql, /request_hash text/i);
  assert.match(migrationSql, /result_payload jsonb not null default '\{\}'::jsonb/i);
  assert.match(migrationSql, /staff_operation_requests_restaurant_operation_key_uidx/i);
  assert.match(migrationSql, /on public\.staff_operation_requests \(restaurant_id, operation_type, operation_key\)/i);
  assert.match(migrationSql, /alter table public\.staff_operation_requests enable row level security/i);
  assert.match(migrationSql, /revoke all on public\.staff_operation_requests from anon, authenticated/i);
  assert.match(migrationSql, /grant select, insert, update on public\.staff_operation_requests to service_role/i);
  assert.match(migrationSql, /to service_role[\s\S]*using \(true\)[\s\S]*with check \(true\)/i);
});

test("staff activity logs become immutable at the database layer", () => {
  assert.match(migrationSql, /create or replace function app_private\.prevent_staff_activity_log_mutation\(\)/i);
  assert.match(migrationSql, /raise exception using[\s\S]*staff_activity_logs are immutable and cannot be updated/i);
  assert.match(migrationSql, /raise exception using[\s\S]*staff_activity_logs are immutable and cannot be deleted directly/i);
  assert.match(migrationSql, /drop trigger if exists staff_activity_logs_prevent_mutation on public\.staff_activity_logs/i);
  assert.match(migrationSql, /create trigger staff_activity_logs_prevent_mutation[\s\S]*before update or delete on public\.staff_activity_logs/i);
  assert.match(migrationSql, /for each row execute function app_private\.prevent_staff_activity_log_mutation\(\)/i);
  assert.doesNotMatch(migrationSql, /create or replace function public\.prevent_staff_activity_log_mutation/i);
});

test("staff operation helper handles duplicate requests without relying on client metadata", () => {
  assert.match(helperSource, /import "server-only"/);
  assert.match(helperSource, /createAdminSupabaseClient\(\)/);
  assert.match(helperSource, /OPERATION_KEY_PATTERN = \/\^\[A-Za-z0-9\._:-\]\{16,160\}\$\//);
  assert.match(helperSource, /FALLBACK_KEY_WINDOW_MS = 2 \* 60 \* 1000/);
  assert.match(helperSource, /createHash\("sha256"\)/);
  assert.match(helperSource, /\.from\("staff_operation_requests"\)[\s\S]*\.insert\(payload\)/);
  assert.match(helperSource, /isDuplicateKeyError\(error\)/);
  assert.match(helperSource, /existing\.request_hash && existing\.request_hash !== requestHash/);
  assert.match(helperSource, /existing\.status === "completed"/);
  assert.match(helperSource, /existing\.status === "started"/);
  assert.match(helperSource, /status: "failed"/);
  assert.match(helperSource, /persistResult\?: \(result: T\) => Record<string, unknown>/);
  assert.doesNotMatch(helperSource, /user_metadata|raw_user_meta_data|auth\.jwt\(\)/);
});

test("all dashboard HR server actions are wrapped by staff operation integrity", () => {
  const actionBodies = exportedActionBodies(staffActionsSource);
  assert.ok(actionBodies.length >= 20, "expected to detect HR action exports");

  for (const action of actionBodies) {
    assert.match(action.body, /runStaffOperation<StaffActionState>/, `${action.name} should use operation ledger`);
  }
});

test("sensitive staff password operations do not persist temporary passwords in the ledger", () => {
  assert.match(staffActionsSource, /function scrubStaffPasswordResult\(result: StaffActionState\)/);
  assert.match(staffActionsSource, /temporaryPassword: null/);
  assert.match(staffActionsSource, /temporaryCredentials: undefined/);

  for (const actionName of ["createStaffAction", "resetStaffAppPasswordAction", "resetStaffAppPasswordsAction"]) {
    const action = exportedActionBodies(staffActionsSource).find((item) => item.name === actionName);
    assert.ok(action, `${actionName} should exist`);
    assert.match(action.body, /persistResult: scrubStaffPasswordResult/, `${actionName} should scrub replay payload`);
  }
});

test("manual attendance idempotency ignores dynamic server timestamps", () => {
  for (const actionName of ["manualClockInStaffAction", "manualClockOutStaffAction"]) {
    const action = exportedActionBodies(staffActionsSource).find((item) => item.name === actionName);
    assert.ok(action, `${actionName} should exist`);
    assert.match(action.body, /requestPayload: \{ \.\.\.parsed, capturedAt: "server_now" \}/, `${actionName} should not fingerprint per-click timestamps`);
  }
});

test("staff profile manual attendance uses the current open log before clocking out", () => {
  assert.match(staffWorkspaceSource, /memberOpenAttendance/);
  assert.match(staffWorkspaceSource, /!attendance\.clockOutAt/);
  assert.match(staffWorkspaceSource, /fd\.set\("attendanceLogId", memberOpenAttendance\.id\)/);
  assert.match(staffWorkspaceSource, /memberOpenAttendance \? \([\s\S]*Kết ca hộ[\s\S]*\) : \([\s\S]*Chấm vào hộ/);
  assert.match(staffWorkspaceSource, /Trạng thái ca hiện tại/);
});

test("staff create profile RPC wraps users, staff member, branch and audit in one DB transaction", () => {
  assert.match(atomicCreateSql, /create or replace function app_private\.create_staff_user_profile/i);
  assert.match(atomicCreateSql, /security definer/i);
  assert.match(atomicCreateSql, /create or replace function public\.create_staff_user_profile/i);
  assert.match(atomicCreateSql, /security invoker/i);
  assert.match(atomicCreateSql, /grant usage on schema app_private to authenticated, service_role/i);
  assert.match(atomicCreateSql, /revoke all on function app_private\.create_staff_user_profile[\s\S]*from public, anon, authenticated/i);
  assert.match(atomicCreateSql, /grant execute on function app_private\.create_staff_user_profile[\s\S]*to service_role/i);
  assert.match(atomicCreateSql, /revoke all on function public\.create_staff_user_profile[\s\S]*from public, anon, authenticated/i);
  assert.match(atomicCreateSql, /grant execute on function public\.create_staff_user_profile[\s\S]*to service_role/i);
  assert.match(atomicCreateSql, /insert into public\.users/i);
  assert.match(atomicCreateSql, /insert into public\.staff_members/i);
  assert.match(atomicCreateSql, /insert into public\.staff_branch_assignments/i);
  assert.match(atomicCreateSql, /insert into public\.staff_activity_logs/i);
  assert.match(atomicCreateSql, /'staff\.created'/i);
  assert.match(atomicCreateSql, /'hardFailAudit', true/i);
  assert.match(atomicCreateSql, /Invalid staff role assignment/i);
  assert.match(atomicCreateSql, /Invalid staff branch assignment/i);
  assert.match(atomicCreateSql, /role\.role_scope = p_role_scope/i);
});

test("createRestaurantUser delegates DB writes to the atomic staff profile RPC", () => {
  const body = functionBody(restaurantServiceSource, "createRestaurantUser");
  assert.match(body, /app_metadata:/);
  assert.doesNotMatch(body, /user_metadata:/);
  assert.match(body, /supabase\.rpc\("create_staff_user_profile"/);
  assert.match(body, /p_actor_user_id: input\.actorUserId \?\? null/);
  assert.match(body, /p_pin_hash: "pin_hash" in pinPayload \? pinPayload\.pin_hash : null/);
  assert.match(body, /await rollbackCreatedAuthUser\(supabase, authUser\.user\.id\)/);
  assert.match(body, /throw staffCreateProfileRpcError\(error\)/);
  assert.doesNotMatch(body, /\.from\("users"\)[\s\S]*\.insert\(/);
  assert.doesNotMatch(body, /upsertStaffOperationsProfile\(/);
  assert.doesNotMatch(body, /syncStaffPrimaryBranch\(/);
});

test("staff role metadata sync uses app metadata instead of user-editable metadata", () => {
  assert.doesNotMatch(restaurantServiceSource, /user_metadata:/);
  assert.match(restaurantServiceSource, /app_metadata:/);
});

test("staff account mutation RPCs atomically update profile, role, branch, sessions and audit", () => {
  assert.match(atomicMutationSql, /create or replace function app_private\.update_staff_user_profile/i);
  assert.match(atomicMutationSql, /create or replace function public\.update_staff_user_profile/i);
  assert.match(atomicMutationSql, /create or replace function app_private\.set_staff_account_state/i);
  assert.match(atomicMutationSql, /create or replace function public\.set_staff_account_state/i);
  assert.match(atomicMutationSql, /language plpgsql[\s\S]*security definer/i);
  assert.match(atomicMutationSql, /language sql[\s\S]*security invoker/i);
  assert.match(atomicMutationSql, /revoke all on function app_private\.update_staff_user_profile[\s\S]*from public, anon, authenticated/i);
  assert.match(atomicMutationSql, /grant execute on function app_private\.update_staff_user_profile[\s\S]*to service_role/i);
  assert.match(atomicMutationSql, /revoke all on function public\.update_staff_user_profile[\s\S]*from public, anon, authenticated/i);
  assert.match(atomicMutationSql, /grant execute on function public\.update_staff_user_profile[\s\S]*to service_role/i);
  assert.match(atomicMutationSql, /revoke all on function app_private\.set_staff_account_state[\s\S]*from public, anon, authenticated/i);
  assert.match(atomicMutationSql, /grant execute on function app_private\.set_staff_account_state[\s\S]*to service_role/i);
  assert.match(atomicMutationSql, /revoke all on function public\.set_staff_account_state[\s\S]*from public, anon, authenticated/i);
  assert.match(atomicMutationSql, /grant execute on function public\.set_staff_account_state[\s\S]*to service_role/i);
  assert.match(atomicMutationSql, /update public\.users/i);
  assert.match(atomicMutationSql, /update public\.staff_members/i);
  assert.match(atomicMutationSql, /update public\.staff_branch_assignments/i);
  assert.match(atomicMutationSql, /update public\.staff_sessions/i);
  assert.match(atomicMutationSql, /insert into public\.staff_activity_logs/i);
  assert.match(atomicMutationSql, /'staff\.profile\.updated'/i);
  assert.match(atomicMutationSql, /'staff\.account_state\.updated'/i);
  assert.match(atomicMutationSql, /'hardFailAudit', true/i);
});

test("staff account mutation RPCs guard privilege downgrade, last admin and role scope consistency", () => {
  assert.match(atomicMutationSql, /create or replace function app_private\.prevent_last_active_admin/i);
  assert.match(atomicMutationSql, /for update/i);
  assert.match(atomicMutationSql, /Last active admin cannot be changed/i);
  assert.match(atomicMutationSql, /Actor cannot demote own admin account/i);
  assert.match(atomicMutationSql, /Actor cannot lock own account/i);
  assert.match(atomicMutationSql, /role\.role_scope = p_role_scope/i);
  assert.match(atomicMutationSql, /Invalid staff role assignment/i);
});

test("staff profile and account services delegate DB writes to account mutation RPCs", () => {
  const roleBody = functionBody(restaurantServiceSource, "updateRestaurantUserRole");
  const profileBody = functionBody(restaurantServiceSource, "updateRestaurantUserOperationsProfile");
  const stateBody = functionBody(restaurantServiceSource, "setRestaurantUserAccountState");

  assert.match(roleBody, /supabase\.rpc\("update_staff_user_profile"/);
  assert.match(profileBody, /supabase\.rpc\("update_staff_user_profile"/);
  assert.match(stateBody, /supabase\.rpc\("set_staff_account_state"/);
  assert.match(profileBody, /p_profile: profilePayload/);
  assert.match(stateBody, /p_next_state: input\.nextState/);

  for (const body of [roleBody, profileBody, stateBody]) {
    assert.doesNotMatch(body, /\.from\("users"\)[\s\S]*\.update\(/);
    assert.doesNotMatch(body, /\.from\("staff_members"\)[\s\S]*\.(?:update|upsert)\(/);
    assert.doesNotMatch(body, /\.from\("staff_branch_assignments"\)[\s\S]*\.(?:update|insert)\(/);
    assert.doesNotMatch(body, /\.from\("staff_sessions"\)[\s\S]*\.update\(/);
    assert.doesNotMatch(body, /upsertStaffOperationsProfile\(/);
    assert.doesNotMatch(body, /syncStaffPrimaryBranch\(/);
  }
});

test("staff auth metadata sync is best-effort and non-authoritative", () => {
  const body = functionBody(restaurantServiceSource, "syncStaffAuthAppMetadata");
  assert.match(body, /app_metadata:/);
  assert.match(body, /writeOperationalEvent\(/);
  assert.match(body, /staff_auth_app_metadata_sync_failed/);
  assert.doesNotMatch(body, /throw new AppError/);
  assert.doesNotMatch(body, /throw staffMutationRpcError/);
  assert.doesNotMatch(body, /throw error/);
});
