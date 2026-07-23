import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("delivery quotes never price directly from client-supplied coordinates", () => {
  const source = readFileSync("services/delivery-service.ts", "utf8");
  const start = source.indexOf("export async function quoteDeliveryForRestaurant");
  assert.notEqual(start, -1);
  const body = source.slice(start);

  assert.match(body, /validateCanonicalDeliveryDestination/);
  assert.match(body, /resolvedCoordinates: destination/);
  assert.match(body, /destination = canonicalDestination\.coordinates/);
  assert.doesNotMatch(body, /let destination = hasCoordinate\(input\.deliveryLat, input\.deliveryLng\)/);
  assert.match(body, /Quán chưa cấu hình geocoding để xác minh địa chỉ giao hàng an toàn/);
});
