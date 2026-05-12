import assert from "node:assert/strict";
import { test } from "node:test";
import { roundUpToSlotBoundary } from "./reservation-time";

test("roundUpToSlotBoundary snaps to the next 30-minute slot", () => {
  const value = roundUpToSlotBoundary(new Date("2026-05-12T10:17:24+07:00"));
  assert.equal(value.toISOString(), "2026-05-12T03:30:00.000Z");
});

test("roundUpToSlotBoundary keeps aligned slot times unchanged", () => {
  const value = roundUpToSlotBoundary(new Date("2026-05-12T10:30:00+07:00"));
  assert.equal(value.toISOString(), "2026-05-12T03:30:00.000Z");
});
