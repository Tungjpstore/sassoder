import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCoordinatePair, normalizeCoordinateValue } from "@/lib/geolocation/coordinates";

test("normalizeCoordinatePair accepts valid numeric coordinates", () => {
  assert.deepEqual(normalizeCoordinatePair("10.7769", "106.7009"), {
    lat: 10.7769,
    lng: 106.7009
  });
});

test("normalizeCoordinateValue trims numeric strings and rejects blank-like values", () => {
  assert.equal(normalizeCoordinateValue(" 10.7769 ", -90, 90), 10.7769);
  assert.equal(normalizeCoordinateValue("", -90, 90), null);
  assert.equal(normalizeCoordinateValue("   ", -90, 90), null);
  assert.equal(normalizeCoordinateValue(null, -90, 90), null);
  assert.equal(normalizeCoordinateValue(false, -90, 90), null);
});

test("normalizeCoordinatePair rejects coordinates outside map bounds", () => {
  assert.equal(normalizeCoordinatePair(91, 106.7009), null);
  assert.equal(normalizeCoordinatePair(10.7769, 181), null);
  assert.equal(normalizeCoordinatePair(Number.NaN, 106.7009), null);
  assert.equal(normalizeCoordinatePair("", ""), null);
  assert.equal(normalizeCoordinatePair(null, null), null);
});
