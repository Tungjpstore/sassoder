import assert from "node:assert/strict";
import test from "node:test";
import { toCoordinate } from "@/services/maps/provider-runtime";

test("toCoordinate rejects invalid provider coordinates outside latitude and longitude bounds", () => {
  assert.equal(toCoordinate(10.7769, 106.7009)?.lat, 10.7769);
  assert.equal(toCoordinate(91, 106.7009), null);
  assert.equal(toCoordinate(10.7769, 181), null);
});
