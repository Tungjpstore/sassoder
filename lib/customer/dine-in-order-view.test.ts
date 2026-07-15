import assert from "node:assert/strict";
import test from "node:test";
import {
  dineInPayableMethod,
  dineInPayableTotal,
  isDineInOrderPaid,
  isOpenDineInOrderStatus,
  shortDineInOrderCode
} from "./dine-in-order-view";

test("open dine-in statuses include kitchen-ready and payment wait states", () => {
  assert.equal(isOpenDineInOrderStatus("pending"), true);
  assert.equal(isOpenDineInOrderStatus("completed"), true);
  assert.equal(isOpenDineInOrderStatus("paid"), false);
  assert.equal(isOpenDineInOrderStatus("cancelled"), false);
});

test("payable helpers prefer bill totals and methods", () => {
  const entry = {
    order: {
      id: "abc12345",
      status: "ordering",
      total: 10000,
      paymentMethod: "CASH" as const,
      bill: { total: 25000, paymentMethod: "QR" as const, status: "open" },
      createdAt: "2026-06-15T10:00:00.000Z"
    }
  };
  assert.equal(dineInPayableTotal(entry), 25000);
  assert.equal(dineInPayableMethod(entry), "QR");
  assert.equal(isDineInOrderPaid(entry), false);
  assert.equal(isDineInOrderPaid({ order: { ...entry.order, status: "paid" } }), true);
  assert.match(shortDineInOrderCode(entry), /^#OD/);
});
