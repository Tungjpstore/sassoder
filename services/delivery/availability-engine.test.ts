import assert from "node:assert/strict";
import test from "node:test";
import { resolveRestaurantAvailability } from "@/services/delivery/availability-engine";

test("resolveRestaurantAvailability supports normal opening windows", () => {
  const open = resolveRestaurantAvailability({
    openingTime: "09:00",
    closingTime: "21:00",
    now: new Date("2026-05-17T05:00:00.000Z"),
    enforce: true
  });
  const closed = resolveRestaurantAvailability({
    openingTime: "09:00",
    closingTime: "21:00",
    now: new Date("2026-05-17T15:00:00.000Z"),
    enforce: true
  });

  assert.equal(open.isOpen, true);
  assert.equal(closed.isOpen, false);
});

test("resolveRestaurantAvailability supports overnight service windows", () => {
  const lateNight = resolveRestaurantAvailability({
    openingTime: "18:00",
    closingTime: "02:00",
    now: new Date("2026-05-17T17:30:00.000Z"),
    enforce: true
  });
  const afternoon = resolveRestaurantAvailability({
    openingTime: "18:00",
    closingTime: "02:00",
    now: new Date("2026-05-17T07:00:00.000Z"),
    enforce: true
  });

  assert.equal(lateNight.isOpen, true);
  assert.equal(afternoon.isOpen, false);
});

test("resolveRestaurantAvailability can be disabled for rollout", () => {
  const availability = resolveRestaurantAvailability({
    openingTime: "09:00",
    closingTime: "10:00",
    now: new Date("2026-05-17T12:00:00.000Z"),
    enforce: false
  });

  assert.equal(availability.isOpen, true);
  assert.equal(availability.shouldEnforce, false);
});
