import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const callbackSource = readFileSync("app/auth/callback/route.ts", "utf8");
const googleRouteSource = readFileSync("app/auth/google/route.ts", "utf8");
const googleCallbackSource = readFileSync("app/auth/google/callback/route.ts", "utf8");
const googleSupabaseFallbackSource = readFileSync("app/auth/google/supabase/route.ts", "utf8");
const googleDirectOAuthSource = readFileSync("lib/google-direct-oauth.ts", "utf8");
const postLoginSource = readFileSync("lib/auth-post-login.ts", "utf8");
const emailStatusRouteSource = readFileSync("app/api/auth/email-status/route.ts", "utf8");
const staffPinServiceSource = readFileSync("features/staff/services/staff-pin-service.ts", "utf8");
const onboardingFlowSource = readFileSync("components/dashboard-v2/onboarding/restaurant-onboarding-flow-v2.tsx", "utf8");
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
  const consumeIndex = postLoginSource.indexOf("consumeRegistrationIntentForUser({ userId: user.id, email: user.email })");
  const fallbackIndex = postLoginSource.indexOf("getRestaurantForUser(user.id, user.email)");

  assert.ok(consumeIndex > 0);
  assert.ok(fallbackIndex > consumeIndex);
  assert.match(postLoginSource, /safeProtectedDashboardNextPath\(next\)/);
  assert.match(postLoginSource, /buildUrlForAuthReturnHost\(request, returnHost, getDashboardDestinationForHost\(restaurant\.slug, host\)\)/);
  assert.match(postLoginSource, /next === "\/dashboard" \? "\/dashboard\/onboarding" : next/);
  assert.match(callbackSource, /getPostLoginDashboardDestination/);
});

test("Google OAuth starts directly on Google and exchanges ID token with Supabase", () => {
  assert.match(googleRouteSource, /buildGoogleDirectAuthorizeRequest/);
  assert.doesNotMatch(googleRouteSource, /signInWithOAuth/);
  assert.doesNotMatch(googleRouteSource, /new URL\("\/auth\/google\/supabase"/);
  assert.match(googleRouteSource, /setGoogleOAuthStateCookie/);
  assert.match(googleSupabaseFallbackSource, /legacySupabaseOAuthEnabled/);
  assert.match(googleSupabaseFallbackSource, /GOOGLE_LEGACY_SUPABASE_OAUTH_ENABLED/);
  assert.match(googleSupabaseFallbackSource, /signInWithOAuth/);
  assert.match(googleDirectOAuthSource, /accounts\.google\.com\/o\/oauth2\/v2\/auth/);
  assert.match(googleDirectOAuthSource, /oauth2\.googleapis\.com\/token/);
  assert.match(googleDirectOAuthSource, /createHmac\("sha256"/);
  assert.match(googleDirectOAuthSource, /createHash\("sha256"/);
  assert.match(googleDirectOAuthSource, /hashGoogleOAuthNonce\(payload\.nonce\)/);
  assert.match(googleDirectOAuthSource, /logivn_google_oauth_state/);
  assert.match(googleDirectOAuthSource, /requiresExplicitGoogleOAuthStateSecret/);
  assert.match(googleDirectOAuthSource, /process\.env\.NODE_ENV === "production"/);
  assert.match(googleDirectOAuthSource, /url\.searchParams\.get\("prompt"\) === "select_account"/);
  assert.match(googleCallbackSource, /readGoogleDirectOAuthState/);
  assert.match(googleCallbackSource, /readGoogleDirectOAuthStateCookie/);
  assert.match(googleCallbackSource, /isValidGoogleDirectOAuthStateCookie/);
  assert.match(googleCallbackSource, /appendExpiredGoogleOAuthStateCookie/);
  assert.match(googleCallbackSource, /exchangeGoogleCodeForTokens/);
  assert.match(googleCallbackSource, /signInWithIdToken/);
  assert.match(googleCallbackSource, /nonce: state\.nonce/);
  assert.doesNotMatch(googleCallbackSource, /exchangeCodeForSession/);
});

test("Google OAuth return host is canonicalized before being signed into state", () => {
  assert.match(postLoginSource, /normalizeTrustedAuthHost\(request\.headers\.get\("x-forwarded-host"\)\)/);
  assert.match(postLoginSource, /normalizeTrustedAuthHost\(request\.headers\.get\("host"\)\)/);
  assert.ok(postLoginSource.includes("/[\\s/@]/.test(host)"));
  assert.match(postLoginSource, /isValidPort/);
  assert.match(postLoginSource, /hasValidDnsHostname/);
  assert.match(postLoginSource, /hostname\.endsWith\(`\.\$\{ROOT_DOMAIN\}`\)/);
});

test("production smoke rejects forged Google OAuth callback state", () => {
  const productionSmokeSource = readFileSync("scripts/infra/production-smoke.mjs", "utf8");

  assert.match(productionSmokeSource, /Google OAuth callback rejects forged state/);
  assert.match(productionSmokeSource, /\/auth\/google\/callback\?code=fake&state=fake/);
  assert.match(productionSmokeSource, /authError"\) === "google_state"/);
  assert.match(productionSmokeSource, /logivn_google_oauth_state=;/);
  assert.match(productionSmokeSource, /sb-\[\^=;\]\*-auth-token/);
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
