import assert from "node:assert/strict";
import test from "node:test";
import { getMapDeliveryReadiness } from "@/services/maps/map-delivery-readiness-service";

const envKeys = [
  "GOONG_API_KEY",
  "VIETMAP_API_KEY",
  "MAPBOX_ACCESS_TOKEN",
  "NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "NEXT_PUBLIC_MAP_STYLE_URL",
  "NEXT_PUBLIC_GOONG_MAPTILES_KEY",
  "MAPS_DB_TELEMETRY_ENABLED",
  "MAPS_RATE_LIMIT_REDIS_ENABLED"
];
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

function restoreEnv() {
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test.afterEach(restoreEnv);

test("getMapDeliveryReadiness reports critical when geocoding is missing", () => {
  for (const key of envKeys) delete process.env[key];
  const readiness = getMapDeliveryReadiness();

  assert.equal(readiness.status, "critical");
  assert.equal(readiness.items.find((item) => item.key === "geocoding")?.ready, false);
});

test("getMapDeliveryReadiness reports ready when production map dependencies exist", () => {
  process.env.GOONG_API_KEY = "goong";
  process.env.UPSTASH_REDIS_REST_URL = "https://redis";
  process.env.UPSTASH_REDIS_REST_TOKEN = "token";
  process.env.NEXT_PUBLIC_GOONG_MAPTILES_KEY = "tiles";
  process.env.MAPS_DB_TELEMETRY_ENABLED = "true";

  const readiness = getMapDeliveryReadiness();

  assert.equal(readiness.status, "ready");
  assert.equal(readiness.readyCount, readiness.totalCount);
});
