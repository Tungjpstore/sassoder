import assert from "node:assert/strict";
import test from "node:test";
import { searchAddress } from "@/services/maps/geocoding/geocoder-service";
import { resolveDistanceAndEta } from "@/services/maps/routing/routing-service";
import { resetProviderPolicyForTests } from "@/services/maps/provider-policy-service";

const envKeys = [
  "GOONG_API_KEY",
  "VIETMAP_API_KEY",
  "MAPBOX_ACCESS_TOKEN",
  "NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN",
  "MAPS_GEOCODER_PROVIDER",
  "MAPS_GEOCODER_FALLBACKS",
  "MAPS_ROUTING_PROVIDER",
  "MAPS_ROUTING_FALLBACKS",
  "MAPS_DISABLED_PROVIDERS",
  "MAPS_DISABLED_GEOCODERS",
  "MAPS_DISABLED_ROUTERS",
  "MAPS_DISABLED_GEOCODE_PROVIDERS",
  "MAPS_DISABLED_ROUTE_PROVIDERS",
  "MAPS_CIRCUIT_FAILURE_THRESHOLD",
  "MAPS_CACHE_NAMESPACE",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN"
] as const;

const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

function resetEnv() {
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetProviderPolicyForTests();
}

function configureFallbackEnv(namespace: string) {
  for (const key of envKeys) delete process.env[key];
  process.env.GOONG_API_KEY = "goong-test-key";
  process.env.MAPBOX_ACCESS_TOKEN = "mapbox-test-token";
  process.env.MAPS_CIRCUIT_FAILURE_THRESHOLD = "999";
  process.env.MAPS_CACHE_NAMESPACE = namespace;
  resetProviderPolicyForTests();
}

test.afterEach(resetEnv);

test("searchAddress falls back from empty Goong geocoding to Mapbox", async (t) => {
  configureFallbackEnv(`test-geocode-${Date.now()}`);
  const calls: string[] = [];

  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push(url);

    if (url.includes("rsapi.goong.io/Geocode")) {
      return Response.json({ results: [] });
    }

    if (url.includes("api.mapbox.com/search/geocode")) {
      return Response.json({
        features: [
          {
            id: "mapbox-place-1",
            properties: {
              full_address: "12 Nguyễn Huệ, Quận 1, TP.HCM",
              coordinates: { latitude: 10.7758, longitude: 106.701 }
            },
            name: "12 Nguyễn Huệ"
          }
        ]
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  });

  const results = await searchAddress("12 Nguyen Hue fallback test", { provider: "goong", limit: 1 });

  assert.equal(results[0]?.provider, "mapbox");
  assert.equal(results[0]?.lat, 10.7758);
  assert.equal(calls.some((url) => url.includes("rsapi.goong.io/Geocode")), true);
  assert.equal(calls.some((url) => url.includes("api.mapbox.com/search/geocode")), true);
});

test("resolveDistanceAndEta falls back from Goong routing to Mapbox directions", async (t) => {
  configureFallbackEnv(`test-route-${Date.now()}`);
  const calls: string[] = [];

  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push(url);

    if (url.includes("rsapi.goong.io/Direction")) {
      return Response.json({ routes: [] });
    }

    if (url.includes("api.mapbox.com/directions")) {
      return Response.json({
        routes: [
          {
            distance: 4200,
            duration: 900,
            geometry: {
              type: "LineString",
              coordinates: [
                [106.7009, 10.7769],
                [106.71, 10.79]
              ]
            }
          }
        ]
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  });

  const route = await resolveDistanceAndEta(
    { lat: 10.7769, lng: 106.7009 },
    { lat: 10.79, lng: 106.71 },
    { provider: "goong" }
  );

  assert.equal(route.provider, "mapbox");
  assert.equal(route.distanceKm, 4.2);
  assert.equal(route.durationMinutes, 15);
  assert.deepEqual(route.fallbackChain, ["goong", "mapbox"]);
  assert.equal(calls.some((url) => url.includes("rsapi.goong.io/Direction")), true);
  assert.equal(calls.some((url) => url.includes("api.mapbox.com/directions")), true);
});
