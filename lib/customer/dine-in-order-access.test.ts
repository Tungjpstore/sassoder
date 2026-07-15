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

test("dine-in payment-sensitive access requires session match when identity is bound", () => {
  assert.equal(
    canAccessDineInOrder(
      {
        customerSessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        orderCustomerSessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        orderStatus: "waiting_payment",
        hasValidTableQr: true
      },
      { requireSessionMatchForBoundIdentity: true }
    ),
    false
  );
  assert.equal(
    canAccessDineInOrder(
      {
        customerSessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        orderCustomerSessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        orderStatus: "waiting_payment",
        hasValidTableQr: false
      },
      { requireSessionMatchForBoundIdentity: true }
    ),
    true
  );
  // Pending shared-table browse still allowed with QR alone.
  assert.equal(
    canAccessDineInOrder(
      {
        orderCustomerSessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        orderStatus: "pending",
        hasValidTableQr: true
      },
      { requireSessionMatchForBoundIdentity: true }
    ),
    true
  );
});
