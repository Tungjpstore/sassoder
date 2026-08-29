import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canActorMutateStaffOwnerBoundary } from "@/lib/staff-owner-boundary";

const permissionSource = readFileSync("services/staff-permission-service.ts", "utf8");
const restaurantServiceSource = readFileSync("services/restaurant-service.ts", "utf8");
const authServiceSource = readFileSync("features/staff/services/staff-app-auth-service.ts", "utf8");
const actionsSource = readFileSync("app/dashboard/actions/staff.ts", "utf8");
const createRpcSource = readFileSync("supabase/migrations/20260618092245_staff_hr_atomic_create_profile.sql", "utf8");
const mutationRpcSource = readFileSync("supabase/migrations/20260618093351_staff_hr_atomic_account_mutations.sql", "utf8");
const boundaryServiceSource = readFileSync("services/staff-owner-boundary-service.ts", "utf8");
const roleServiceSource = readFileSync("features/roles/services/role-service.ts", "utf8");
const sessionServiceSource = readFileSync("features/staff/services/staff-session-service.ts", "utf8");
const billingActionsSource = readFileSync("app/dashboard/actions/billing.ts", "utf8");
const settingsActionsSource = readFileSync("app/dashboard/actions/settings.ts", "utf8");
const settingsPageSource = readFileSync("app/dashboard/settings/page.tsx", "utf8");
const dashboardAccessSource = readFileSync("lib/dashboard-access.ts", "utf8");
const ownerHardeningSql = readFileSync("supabase/migrations/20260722100000_staff_owner_boundary_hardening.sql", "utf8");

test("owner boundary policy allows ordinary staff changes but blocks manager owner mutations", () => {
  assert.equal(canActorMutateStaffOwnerBoundary({ targetRoleCode: "waiter" }), true);
  assert.equal(canActorMutateStaffOwnerBoundary({ actorRoleCode: "owner", requestedRoleCode: "owner" }), false);
  assert.equal(canActorMutateStaffOwnerBoundary({ actorRoleCode: "owner", targetRoleCode: "owner" }), false);
  assert.equal(canActorMutateStaffOwnerBoundary({ actorIsCanonicalOwner: true, requestedRoleCode: "owner" }), false);
  assert.equal(canActorMutateStaffOwnerBoundary({ actorIsCanonicalOwner: true, targetIsCanonicalOwner: true }), true);
  assert.equal(canActorMutateStaffOwnerBoundary({
    actorIsCanonicalOwner: true,
    targetIsCanonicalOwner: true,
    requestedRoleCode: "manager"
  }), false);
  assert.equal(canActorMutateStaffOwnerBoundary({
    actorIsCanonicalOwner: true,
    targetIsCanonicalOwner: true,
    rejectCanonicalOwnerTarget: true
  }), false);
});

test("owner role assignment is owner-only, including custom and legacy role paths", () => {
  assert.match(permissionSource, /assertCanonicalRestaurantOwner/);
  assert.match(permissionSource, /template\?\.role === "ADMIN"[\s\S]*assertCanonicalRestaurantOwner/);
  assert.match(permissionSource, /roleResult\.data\?\.role_scope === "ADMIN"[\s\S]*assertCanonicalRestaurantOwner/);
  assert.match(actionsSource, /assertCanAssignStaffRole\(session, parsed\.roleCode\)/);
  assert.match(restaurantServiceSource, /assertStaffOwnerMutationAllowed/);
  assert.match(boundaryServiceSource, /requestedRoleCode/);
  assert.match(ownerHardeningSql, /create or replace function app_private\.assert_staff_owner_boundary/i);
  assert.match(ownerHardeningSql, /p_requested_role_code = 'owner'/i);
  assert.match(ownerHardeningSql, /Only the canonical owner user can hold the owner role/i);
  assert.match(ownerHardeningSql, /rename to create_staff_user_profile_unchecked_20260722/i);
  assert.match(ownerHardeningSql, /rename to update_staff_user_profile_unchecked_20260722/i);
  assert.match(ownerHardeningSql, /rename to set_staff_account_state_unchecked_20260722/i);
  assert.match(createRpcSource, /p_role_code/);
  assert.match(mutationRpcSource, /p_role_code/);
});

test("owner accounts cannot be changed by non-owners through any staff mutation boundary", () => {
  assert.match(restaurantServiceSource, /assertStaffOwnerMutationAllowed/);
  assert.match(authServiceSource, /assertStaffOwnerMutationAllowed/);
  assert.match(sessionServiceSource, /assertStaffOwnerMutationAllowed/);
  assert.match(roleServiceSource, /assertCanonicalRestaurantOwner/);
  assert.match(boundaryServiceSource, /canActorMutateStaffOwnerBoundary/);
  assert.match(ownerHardeningSql, /select restaurants\.owner_user_id[\s\S]*for share/i);
  assert.match(ownerHardeningSql, /p_actor_user_id is null or p_actor_user_id <> v_owner_user_id/i);
  assert.match(ownerHardeningSql, /Canonical owner cannot be suspended or archived without an ownership transfer/i);
});

test("owner temporary credentials are never returned through a manager mutation path", () => {
  assert.match(actionsSource, /scrubStaffPasswordResult/);
  assert.match(actionsSource, /resetStaffAppPassword\(/);
  assert.match(authServiceSource, /assertStaffOwnerMutationAllowed/);
});

test("legacy ADMIN backfill is repaired to a canonical owner identity", () => {
  assert.match(ownerHardeningSql, /add column if not exists owner_user_id uuid/i);
  assert.match(ownerHardeningSql, /foreign key \(id, owner_user_id\)[\s\S]*references public\.users\(restaurant_id, id\)/i);
  assert.match(ownerHardeningSql, /Ambiguous trial claim owners found/i);
  assert.match(ownerHardeningSql, /Trial claim owner must be an ADMIN user/i);
  assert.match(ownerHardeningSql, /Active restaurant owner is unresolved/i);
  assert.match(ownerHardeningSql, /from public\.trial_claims claims/i);
  assert.match(ownerHardeningSql, /claims\.claimed_at asc, claims\.id asc/i);
  assert.match(ownerHardeningSql, /users\.account_status is distinct from 'blocked'/i);
  assert.match(ownerHardeningSql, /insert into public\.staff_roles/i);
  for (const roleCode of ["owner", "manager", "cashier", "waiter", "kitchen", "marketing", "accountant", "delivery"]) {
    assert.match(ownerHardeningSql, new RegExp(`\\('${roleCode}'`, "i"));
  }
  assert.match(ownerHardeningSql, /is_active = true/i);
  assert.match(ownerHardeningSql, /delete from public\.staff_role_permissions[\s\S]*roles\.code = 'manager'[\s\S]*settings\.billing\.manage/i);
  assert.match(ownerHardeningSql, /set[\s\S]*role_code = 'manager'/i);
  assert.match(ownerHardeningSql, /staff_members_one_active_owner_per_restaurant_idx/i);
  assert.match(ownerHardeningSql, /create or replace function app_private\.guard_restaurant_owner_update/i);
  assert.match(ownerHardeningSql, /v_request_role is not null and v_request_role <> 'service_role'/i);
  assert.match(ownerHardeningSql, /before update of owner_user_id on public\.restaurants/i);
  assert.match(ownerHardeningSql, /sync_restaurant_owner_from_trial_claim/i);
  assert.match(ownerHardeningSql, /notify pgrst, 'reload schema'/i);
  assert.match(permissionSource, /canonicalOwner \? "owner" : storedRoleCode === "owner" \? "manager"/);
});

test("database owner guard validates actor membership before trusting service-role input", () => {
  assert.match(ownerHardeningSql, /actor\.id = p_actor_user_id/i);
  assert.match(ownerHardeningSql, /actor\.restaurant_id = p_restaurant_id/i);
  assert.match(ownerHardeningSql, /actor\.account_status is distinct from 'blocked'/i);
  assert.match(ownerHardeningSql, /Staff owner boundary actor must belong to the restaurant and be active/i);
  assert.match(ownerHardeningSql, /Staff owner boundary actor must have an active staff profile/i);
  assert.match(ownerHardeningSql, /staff\.archived_at is not null or staff\.employment_status <> 'active'/i);
  assert.match(ownerHardeningSql, /v_touches_owner and v_owner_user_id is null/i);
  assert.match(ownerHardeningSql, /p_actor_user_id is null or p_actor_user_id <> v_owner_user_id/i);
  assert.match(ownerHardeningSql, /Trial claim owner must belong to the claimed restaurant, be ADMIN and be active/i);
});

test("billing and receiving-bank mutations require the canonical owner", () => {
  assert.match(billingActionsSource, /assertCanonicalRestaurantOwner/);
  assert.match(settingsActionsSource, /updatePaymentSettingsAction[\s\S]*assertCanonicalRestaurantOwner/);
  assert.match(dashboardAccessSource, /activeSection === "billing"[\s\S]*assertCanonicalRestaurantOwner/);
  assert.doesNotMatch(billingActionsSource, /@\/lib\/supabase\/admin/);
  assert.doesNotMatch(settingsActionsSource, /@\/lib\/supabase\/admin/);
  assert.doesNotMatch(dashboardAccessSource, /@\/lib\/supabase\/admin/);
  assert.match(settingsPageSource, /canonicalOwnerEmail/);
  assert.doesNotMatch(settingsPageSource, /ownerEmail: session\.email/);
});
