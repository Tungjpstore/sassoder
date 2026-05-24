import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStaffPinUnknownRateLimitInput,
  buildStaffPinAttemptRateLimitInputs,
  staffPinAttemptWindowMs,
  staffPinDeviceAttemptLimit,
  staffPinRestaurantAttemptLimit,
  staffPinUnknownAttemptLimit
} from "./staff-pin-abuse";

test("staff PIN attempt budgets cover device and restaurant-wide abuse buckets", () => {
  const inputs = buildStaffPinAttemptRateLimitInputs({
    restaurantId: "restaurant-123",
    ipAddress: "203.0.113.10",
    userAgent: "LogiVN Staff App/1.0"
  });

  assert.deepEqual(
    inputs.map((input) => input.scope),
    ["staff_pin_attempt_device", "staff_pin_attempt_restaurant"]
  );
  assert.equal(inputs[0].ip, "203.0.113.10");
  assert.equal(inputs[0].limit, staffPinDeviceAttemptLimit);
  assert.equal(inputs[1].ip, "global");
  assert.equal(inputs[1].limit, staffPinRestaurantAttemptLimit);
  assert.ok(inputs.every((input) => input.windowMs === staffPinAttemptWindowMs));
});

test("staff PIN attempt buckets never include the raw PIN value", () => {
  const rawPin = "739251";
  const inputs = buildStaffPinAttemptRateLimitInputs({
    restaurantId: "restaurant-123",
    ipAddress: "203.0.113.10",
    userAgent: "LogiVN Staff App/1.0"
  });

  assert.equal(JSON.stringify(inputs).includes(rawPin), false);
});

test("staff PIN attempt buckets tolerate missing request metadata", () => {
  const inputs = buildStaffPinAttemptRateLimitInputs({
    restaurantId: "restaurant-123",
    ipAddress: null,
    userAgent: null
  });

  assert.equal(inputs[0].ip, "local");
  assert.match(inputs[0].identifier, /unknown-device/);
});

test("unknown staff PIN failures use a strict restaurant and IP bucket", () => {
  const input = buildStaffPinUnknownRateLimitInput({
    restaurantId: "restaurant-123",
    ipAddress: "203.0.113.10"
  });

  assert.equal(input.scope, "staff_pin_unknown");
  assert.equal(input.identifier, "restaurant:restaurant-123");
  assert.equal(input.ip, "203.0.113.10");
  assert.equal(input.limit, staffPinUnknownAttemptLimit);
  assert.equal(input.windowMs, staffPinAttemptWindowMs);
  assert.equal(JSON.stringify(input).includes("739251"), false);
});
