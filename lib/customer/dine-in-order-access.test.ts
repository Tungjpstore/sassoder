import assert from "node:assert/strict";
import test from "node:test";
import { canAccessDineInOrder } from "./dine-in-order-access";

test("dine-in order access accepts matching customer sessions", () => {
  assert.equal(
    canAccessDineInOrder({
      customerSessionId: "11111111-1111-4111-8111-111111111111",
      orderCustomerSessionId: "11111111-1111-4111-8111-111111111111",
      orderStatus: "paid",
      hasValidTableQr: false
    }),
    true
  );
});

test("dine-in order access rejects active bill bypass without session or QR", () => {
  assert.equal(
    canAccessDineInOrder({
      orderStatus: "ordering",
      billStatus: "open",
      hasValidTableQr: false
    }),
    false
  );
});

test("dine-in order access allows valid table QR for active table work only", () => {
  assert.equal(
    canAccessDineInOrder({
      orderStatus: "completed",
      billStatus: "open",
      hasValidTableQr: true
    }),
    true
  );
  assert.equal(
    canAccessDineInOrder({
      orderStatus: "paid",
      billStatus: "paid",
      hasValidTableQr: true
    }),
    false
  );
});
