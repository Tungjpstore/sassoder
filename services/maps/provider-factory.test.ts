import assert from "node:assert/strict";
import test from "node:test";
import { getRoutingFallbackChain, preferredRoutingProvider } from "@/services/maps/provider-factory";

const envKeys = [
  "GOONG_API_KEY",
  "VIETMAP_API_KEY",
  "MAPBOX_ACCESS_TOKEN",
  "NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN",
  "MAPS_ROUTING_PROVIDER",
  "MAPS_ROUTING_FALLBACKS",
  "MAPS_DISABLED_PROVIDERS",
  "MAPS_DISABLED_ROUTERS",
  "MAPS_DISABLED_ROUTE_PROVIDERS"
] as const;

const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

function resetEnv() {
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function clearRoutingEnv() {
  for (const key of envKeys) delete process.env[key];
}

test.afterEach(resetEnv);

test("routing fallback uses Mapbox after Goong when Mapbox credentials are configured", () => {
  clearRoutingEnv();
  process.env.GOONG_API_KEY = "goong-test-key";
  process.env.MAPBOX_ACCESS_TOKEN = "mapbox-test-token";

  assert.deepEqual(getRoutingFallbackChain("goong"), ["goong", "mapbox", "osrm"]);
});

test("preferredRoutingProvider selects Mapbox before public OSRM when it is the only configured router", () => {
  clearRoutingEnv();
  process.env.MAPBOX_ACCESS_TOKEN = "mapbox-test-token";

  assert.equal(preferredRoutingProvider(), "mapbox");
});
