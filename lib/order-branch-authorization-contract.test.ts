import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const guardedRoutes = [
  "app/api/admin/orders/[orderId]/cancel/route.ts",
  "app/api/admin/orders/[orderId]/delivery-status/route.ts",
  "app/api/admin/orders/[orderId]/delivery-courier/route.ts",
  "app/api/admin/orders/[orderId]/delivery-location/route.ts",
  "app/api/admin/orders/[orderId]/dispatch-candidates/route.ts"
];

test("order cancellation and delivery APIs enforce branch-scoped access", () => {
  for (const route of guardedRoutes) {
    const source = readFileSync(route, "utf8");
    assert.match(source, /assertStaffCanAccessOrder\(session, orderId\)/, route);
  }
});

test("delivery APIs require explicit order permissions", () => {
  for (const route of guardedRoutes.slice(1, 4)) {
    assert.match(readFileSync(route, "utf8"), /permission: "orders\.update"/, route);
  }
  assert.match(readFileSync(guardedRoutes[4], "utf8"), /permission: "orders\.view"/);
});
