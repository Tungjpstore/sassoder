import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const onboardingActionSource = readFileSync("app/dashboard/actions/onboarding.ts", "utf8");
const authActionSource = readFileSync("app/dashboard/actions/auth.ts", "utf8");
const legacyOnboardingFormSource = readFileSync("components/dashboard/onboarding-form.tsx", "utf8");
const onboardingFlowSource = readFileSync("components/dashboard/restaurant-onboarding-flow.tsx", "utf8");
const onboardingFlowV2Source = readFileSync("components/dashboard-v2/onboarding/restaurant-onboarding-flow-v2.tsx", "utf8");
const restaurantServiceSource = readFileSync("services/restaurant-service.ts", "utf8");
const planFeaturesSource = readFileSync("services/billing/plan-features.ts", "utf8");
const hardeningMigration = readFileSync("supabase/migrations/20260602094500_harden_onboarding_plan_limits.sql", "utf8");

test("onboarding entry points validate table count before persistence", () => {
  assert.match(onboardingActionSource, /validateOnboardingTableCount/);
  assert.match(onboardingActionSource, /if \(!tableLimit\.ok\) return \{ error: tableLimit\.message \}/);
  assert.match(authActionSource, /validateOnboardingTableCount/);
  assert.match(authActionSource, /if \(!tableLimit\.ok\) return \{ error: tableLimit\.message \}/);
  assert.match(restaurantServiceSource, /validateOnboardingTableCount/);
  assert.match(restaurantServiceSource, /if \(!tableLimit\.ok\) throw new AppError\(tableLimit\.message, 402\)/);
});

test("legacy runtime table limits match secure onboarding policy", () => {
  assert.match(planFeaturesSource, /table_qr: \{ enabled: true, limitValue: 20 \}/);
  assert.match(planFeaturesSource, /staff_management: \{ enabled: true, limitValue: 10 \}/);
  assert.match(planFeaturesSource, /table_qr: "tables"/);
});

test("database onboarding RPC wrapper fails closed on plan table limits", () => {
  assert.match(hardeningMigration, /create_restaurant_onboarding_core_unchecked_20260602/);
  assert.match(hardeningMigration, /revoke all on function public\.create_restaurant_onboarding_core[\s\S]*from public, anon, authenticated/);
  assert.match(hardeningMigration, /grant execute on function public\.create_restaurant_onboarding_core[\s\S]*to service_role/);
  assert.match(hardeningMigration, /revoke all on function public\.create_restaurant_onboarding_core_unchecked_20260602[\s\S]*from public, anon, authenticated, service_role/);
  assert.doesNotMatch(hardeningMigration, /grant execute on function public\.create_restaurant_onboarding_core_unchecked_20260602[\s\S]*to service_role/);
  assert.match(hardeningMigration, /v_table_limit := case when v_requested_plan_code = 'premium' then 300 else 20 end/);
  assert.match(hardeningMigration, /p_table_count is null or p_table_count < 1 or p_table_count > v_table_limit/);
  assert.match(hardeningMigration, /set_config\('app\.onboarding_plan_code', v_requested_plan_code, true\)/);
  assert.match(hardeningMigration, /using errcode = '23514'/);
});

test("database triggers block direct resource inserts beyond plan limits", () => {
  assert.match(hardeningMigration, /create or replace function app_private\.restaurant_feature_limit/);
  assert.match(hardeningMigration, /create or replace function public\.enforce_restaurant_cardinality_limit/);
  assert.match(hardeningMigration, /create trigger tables_enforce_plan_limit/);
  assert.match(hardeningMigration, /create trigger users_enforce_plan_limit/);
  assert.match(hardeningMigration, /create trigger menu_items_enforce_plan_limit/);
  assert.match(hardeningMigration, /create trigger promotions_enforce_plan_limit/);
  assert.match(hardeningMigration, /v_used \+ 1 > v_limit/);
});

test("database entitlement lookup is legacy-first and fail-closed", () => {
  const legacyLookupIndex = hardeningMigration.indexOf("from public.restaurant_subscriptions rs");
  const v2LookupIndex = hardeningMigration.indexOf("from public.subscriptions s");
  assert.ok(legacyLookupIndex > 0);
  assert.ok(v2LookupIndex > 0);
  assert.ok(legacyLookupIndex < v2LookupIndex);
  assert.match(hardeningMigration, /if found then return coalesce\(v_limit, 0\); end if/);
  assert.doesNotMatch(hardeningMigration, /select table_count::numeric into v_limit from public\.restaurants/);
});

test("database v2 cardinality entitlements are upserted for cutover safety", () => {
  assert.match(hardeningMigration, /insert into public\.plan_entitlements/);
  assert.match(hardeningMigration, /\('pro', 'promotions', null, 20::numeric\)/);
  assert.match(hardeningMigration, /\('premium', 'promotions', null, 200::numeric\)/);
  assert.match(hardeningMigration, /on conflict \(plan_id, feature_key\) do update set/);
  assert.match(hardeningMigration, /create index if not exists menu_items_restaurant_id_idx/);
});

test("onboarding UIs clamp table count to the selected plan limit", () => {
  assert.match(onboardingFlowSource, /RestaurantOnboardingFlowV2 as RestaurantOnboardingFlow/);
  assert.match(onboardingFlowV2Source, /getOnboardingTableLimit/);
  assert.match(onboardingFlowV2Source, /Math\.min\(nextTableLimit/);
  assert.match(legacyOnboardingFormSource, /getOnboardingTableLimit/);
  assert.match(legacyOnboardingFormSource, /tableCount: 20/);
  assert.match(legacyOnboardingFormSource, /selectedTableLimit/);
  assert.doesNotMatch(legacyOnboardingFormSource, /tableCount: 24/);
});
