import assert from "node:assert/strict";
import test from "node:test";
import { promotionDateTimeToUtcIso } from "./promotion-timezone";

test("promotion datetime-local values are interpreted in restaurant timezone", () => {
  assert.equal(promotionDateTimeToUtcIso("2026-05-19T09:30", "Asia/Ho_Chi_Minh"), "2026-05-19T02:30:00.000Z");
  assert.equal(promotionDateTimeToUtcIso("2026-05-19T09:30", "Asia/Tokyo"), "2026-05-19T00:30:00.000Z");
});

test("promotion datetime parser preserves explicit offsets", () => {
  assert.equal(promotionDateTimeToUtcIso("2026-05-19T09:30:00+07:00", "Asia/Tokyo"), "2026-05-19T02:30:00.000Z");
  assert.equal(promotionDateTimeToUtcIso("not-a-date", "Asia/Ho_Chi_Minh"), null);
});
