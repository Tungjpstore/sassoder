import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const callbackSource = readFileSync("app/auth/callback/route.ts", "utf8");
const emailStatusRouteSource = readFileSync("app/api/auth/email-status/route.ts", "utf8");
const staffPinServiceSource = readFileSync("features/staff/services/staff-pin-service.ts", "utf8");
const onboardingFlowSource = readFileSync("components/dashboard/restaurant-onboarding-flow.tsx", "utf8");
const restaurantServiceSource = readFileSync("services/restaurant-service.ts", "utf8");
const onboardingRpcMigration = readFileSync("supabase/migrations/20260517160000_atomic_restaurant_onboarding_rpc.sql", "utf8");
const authServiceSource = readFileSync("services/auth-service.ts", "utf8");

function sourceBlock(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `Missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("OAuth callback consumes onboarding intent before falling back to account merge", () => {
  const consumeIndex = callbackSource.indexOf("consumeRegistrationIntentForUser({ userId: user.id, email: user.email })");
  const fallbackIndex = callbackSource.indexOf("getRestaurantForUser(user.id, user.email)");

  assert.ok(consumeIndex > 0);
  assert.ok(fallbackIndex > consumeIndex);
  assert.match(callbackSource, /safeProtectedDashboardNextPath\(next\)/);
  assert.match(callbackSource, /next === "\/dashboard" \? "\/dashboard\/onboarding" : next/);
});

test("public email status route does not expose account registration state", () => {
  assert.doesNotMatch(emailStatusRouteSource, /getAuthEmailRegistrationStatus/);
  assert.doesNotMatch(emailStatusRouteSource, /registrationStatus/);
  assert.doesNotMatch(emailStatusRouteSource, /email:\s*parsed\.data\.email/);
  assert.match(emailStatusRouteSource, /buildPublicAuthEmailStatusPayload\(emailDeliveryStatus\)/);
  assert.match(emailStatusRouteSource, /checkPersistentAuthRateLimit/);
});

test("staff PIN login rate-limits every valid PIN attempt before member lookup", () => {
  const loginBlock = sourceBlock(staffPinServiceSource, "export async function loginWithStaffPin", "\n  return {");
  const budgetIndex = loginBlock.indexOf("await assertStaffPinAttemptBudget(restaurant.id, context);");
  const lookupIndex = loginBlock.indexOf("const lookupHash = staffPinLookupHash");
  const noMemberIndex = loginBlock.indexOf("if (!member)");
  const unknownFailureIndex = loginBlock.indexOf("await recordUnknownPinFailure");

  assert.ok(budgetIndex > 0);
  assert.ok(lookupIndex > budgetIndex);
  assert.ok(unknownFailureIndex > noMemberIndex);
  assert.match(loginBlock, /throw new AppError\("PIN hoặc mã quán không đúng\.", 401\)/);
});

test("onboarding and staff login share restaurant identity semantics", () => {
  const resolverBlock = sourceBlock(staffPinServiceSource, "async function resolveRestaurantBySlug", "async function assertStaffPinAttemptBudget");

  assert.match(onboardingFlowSource, /import \{ createSlug \} from "@\/lib\/slug"/);
  assert.match(onboardingFlowSource, /\/api\/restaurants\/slug\?slug=/);
  assert.match(onboardingFlowSource, /name="slug" value=\{slug\}/);
  assert.match(onboardingFlowSource, /slugReady/);
  assert.match(resolverBlock, /createSlug\(identifier\)/);
  assert.match(resolverBlock, /staffCode = identifier\.toUpperCase\(\)\.replace/);
  assert.match(resolverBlock, /\.select\("id,slug,staff_code,name,platform_status"\)/);
  assert.match(resolverBlock, /slug\.eq\.\$\{slug\},staff_code\.eq\.\$\{staffCode\}/);
});

test("unknown staff PIN audit logs never include raw PIN material", () => {
  const unknownFailureBlock = sourceBlock(staffPinServiceSource, "async function recordUnknownPinFailure", "\nexport async function loginWithStaffPin");

  assert.match(unknownFailureBlock, /buildStaffPinUnknownRateLimitInput/);
  assert.match(unknownFailureBlock, /staff_auth\.pin_unknown_failed/);
  assert.match(unknownFailureBlock, /staff_auth\.pin_unknown_locked/);
  assert.doesNotMatch(unknownFailureBlock, /normalizedPin|pin:\s*|lookupHash/);
});

test("registration intent consumption is retry-safe for interrupted onboarding", () => {
  const consumeBlock = sourceBlock(
    restaurantServiceSource,
    "export async function consumeRegistrationIntentForUser",
    "\ntype MenuTemplate"
  );

  const existingRestaurantIndex = consumeBlock.indexOf("const existingRestaurant = await getRestaurantForUser");
  const completeOnboardingIndex = consumeBlock.indexOf("completeRestaurantOnboarding");

  assert.ok(existingRestaurantIndex >= 0);
  assert.ok(completeOnboardingIndex > existingRestaurantIndex);
  assert.match(consumeBlock, /\.eq\("user_id", input\.userId\)/);
  assert.match(consumeBlock, /\.eq\("email", normalizedEmail\)/);
  assert.match(consumeBlock, /\.gt\("expires_at", new Date\(\)\.toISOString\(\)\)/);
  assert.match(consumeBlock, /\.update\({ consumed_at: new Date\(\)\.toISOString\(\), user_id: input\.userId }\)/);
});

test("restaurant onboarding RPC stays service-role only", () => {
  const revokeIndex = onboardingRpcMigration.indexOf("revoke execute on function public.create_restaurant_onboarding_core");
  const grantIndex = onboardingRpcMigration.indexOf("grant execute on function public.create_restaurant_onboarding_core");

  assert.ok(revokeIndex > 0);
  assert.ok(grantIndex > revokeIndex);
  assert.match(onboardingRpcMigration, /from public, anon, authenticated;/);
  assert.match(onboardingRpcMigration, /\) to service_role;/);
  assert.match(onboardingRpcMigration, /return v_restaurant;/);
});

test("logout and password recovery revoke sessions after sensitive auth changes", () => {
  const recoveredPasswordBlock = sourceBlock(authServiceSource, "export async function updateRecoveredPassword", "export async function verifyRecoveryOtpAndUpdatePassword");
  const recoveryOtpBlock = sourceBlock(authServiceSource, "export async function verifyRecoveryOtpAndUpdatePassword", "export async function logout");
  const logoutBlock = sourceBlock(authServiceSource, "export async function logout", "export function assertAdmin");

  assert.match(recoveredPasswordBlock, /signOut\({ scope: "others" }\)/);
  assert.match(recoveryOtpBlock, /expireSupabaseAuthSessionCookies\(\)/);
  assert.match(recoveryOtpBlock, /signOut\({ scope: "others" }\)/);
  assert.match(logoutBlock, /signOut\({ scope: "global" }\)/);
  assert.match(logoutBlock, /expireSupabaseAuthSessionCookies\(\)/);
});
