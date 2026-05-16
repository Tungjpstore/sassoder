import assert from "node:assert/strict";
import test from "node:test";
import { checkMapRateLimit } from "@/services/maps/rate-limit-service";

test("checkMapRateLimit uses memory fallback and blocks after the configured limit", async () => {
  const previousRedisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const previousRedisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const previousKvUrl = process.env.KV_REST_API_URL;
  const previousKvToken = process.env.KV_REST_API_TOKEN;
  const previousRedisEnabled = process.env.MAPS_RATE_LIMIT_REDIS_ENABLED;

  process.env.MAPS_RATE_LIMIT_REDIS_ENABLED = "false";
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;

  try {
    const key = `maps:test:${Date.now()}:${Math.random()}`;
    const first = await checkMapRateLimit(key, 2, 60_000);
    const second = await checkMapRateLimit(key, 2, 60_000);
    const third = await checkMapRateLimit(key, 2, 60_000);

    assert.equal(first.allowed, true);
    assert.equal(first.tier, "memory");
    assert.equal(second.allowed, true);
    assert.equal(third.allowed, false);
    assert.equal(third.remaining, 0);
  } finally {
    process.env.UPSTASH_REDIS_REST_URL = previousRedisUrl;
    process.env.UPSTASH_REDIS_REST_TOKEN = previousRedisToken;
    process.env.KV_REST_API_URL = previousKvUrl;
    process.env.KV_REST_API_TOKEN = previousKvToken;
    process.env.MAPS_RATE_LIMIT_REDIS_ENABLED = previousRedisEnabled;
  }
});
