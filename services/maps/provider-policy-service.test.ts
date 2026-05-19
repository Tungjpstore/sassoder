import assert from "node:assert/strict";
import test from "node:test";
import {
  getProviderPolicySnapshot,
  isProviderEnabledForOperation,
  recordProviderPolicyUsage,
  resetProviderPolicyForTests,
  shouldUseProvider
} from "@/services/maps/provider-policy-service";

const originalEnv = {
  MAPS_DISABLED_PROVIDERS: process.env.MAPS_DISABLED_PROVIDERS,
  MAPS_DISABLED_GEOCODERS: process.env.MAPS_DISABLED_GEOCODERS,
  MAPS_MAX_DAILY_GOONG_ROUTE_REQUESTS: process.env.MAPS_MAX_DAILY_GOONG_ROUTE_REQUESTS,
  MAPS_MAX_DAILY_COST_VND: process.env.MAPS_MAX_DAILY_COST_VND,
  MAPS_COST_VND_GOONG_ROUTE: process.env.MAPS_COST_VND_GOONG_ROUTE
};

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetProviderPolicyForTests();
}

test.afterEach(restoreEnv);

test("provider policy disables providers by global and operation-specific env", () => {
  process.env.MAPS_DISABLED_PROVIDERS = "mapbox";
  process.env.MAPS_DISABLED_GEOCODERS = "goong";

  assert.equal(isProviderEnabledForOperation("mapbox", "route"), false);
  assert.equal(isProviderEnabledForOperation("goong", "geocode"), false);
  assert.equal(isProviderEnabledForOperation("goong", "route"), true);
});

test("provider policy blocks a provider after its daily request cap", () => {
  process.env.MAPS_MAX_DAILY_GOONG_ROUTE_REQUESTS = "1";

  assert.equal(shouldUseProvider("goong", "route"), true);
  recordProviderPolicyUsage("goong", "route");
  assert.equal(shouldUseProvider("goong", "route"), false);
});

test("provider policy snapshot reports cost usage for ops panel", () => {
  process.env.MAPS_COST_VND_GOONG_ROUTE = "120";
  process.env.MAPS_MAX_DAILY_COST_VND = "200";

  recordProviderPolicyUsage("goong", "route");
  recordProviderPolicyUsage("goong", "route");
  const snapshot = getProviderPolicySnapshot();

  assert.equal(snapshot.maxDailyCostVnd, 200);
  assert.equal(snapshot.usage[0].requests, 2);
  assert.equal(snapshot.usage[0].estimatedCostVnd, 240);
  assert.equal(shouldUseProvider("goong", "route"), false);
});
