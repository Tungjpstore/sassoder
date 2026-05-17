import assert from "node:assert/strict";
import test from "node:test";
import { simplifyRouteGeometry } from "@/services/maps/route-geometry-service";

test("simplifyRouteGeometry preserves first and last points while capping payload", () => {
  const coordinates = Array.from({ length: 40 }, (_, index) => [106.7 + index * 0.001, 10.77 + Math.sin(index / 3) * 0.001]);
  const simplified = simplifyRouteGeometry({ type: "LineString", coordinates }, 10);

  assert.ok(simplified);
  assert.ok(simplified.coordinates.length <= 10);
  assert.deepEqual(simplified.coordinates[0], coordinates[0]);
  assert.deepEqual(simplified.coordinates[simplified.coordinates.length - 1], coordinates[coordinates.length - 1]);
});

test("simplifyRouteGeometry leaves short routes untouched", () => {
  const geometry = {
    type: "LineString" as const,
    coordinates: [
      [106.7, 10.77],
      [106.71, 10.78]
    ]
  };

  assert.equal(simplifyRouteGeometry(geometry, 10), geometry);
});
