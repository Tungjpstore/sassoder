import assert from "node:assert/strict";
import test from "node:test";
import {
  inventoryCountRowsSchema,
  inventoryCountSchema,
  inventoryMovementSchema,
  inventoryPurchaseOrderReceiptRowsSchema,
  inventoryPurchaseOrderRowsSchema,
  inventoryPurchaseOrderSchema,
  inventoryTransferSchema
} from "./validators";

const ingredientId = "11111111-1111-4111-8111-111111111111";
const purchaseOrderLineId = "44444444-4444-4444-8444-444444444444";
const batchId = "55555555-5555-4555-8555-555555555555";
const stockBalanceId = "66666666-6666-4666-8666-666666666666";
const fromLocationId = "22222222-2222-4222-8222-222222222222";
const toLocationId = "33333333-3333-4333-8333-333333333333";

test("inventory count schema treats blank legacy quantity as optional", () => {
  const parsed = inventoryCountSchema.parse({
    title: "Kiểm kê cuối ca",
    locationId: fromLocationId,
    ingredientId,
    countedQuantity: "",
    note: ""
  });

  assert.equal(parsed.countedQuantity, undefined);
});

test("inventory transfer schema treats blank legacy quantity as optional", () => {
  const parsed = inventoryTransferSchema.parse({
    fromLocationId,
    toLocationId,
    ingredientId: "",
    quantity: "",
    unit: "",
    note: ""
  });

  assert.equal(parsed.quantity, undefined);
});

test("inventory movement schema accepts batch-aware waste and expiration operations", () => {
  const parsed = inventoryMovementSchema.parse({
    ingredientId,
    movementType: "expired",
    quantity: "3.5",
    unitCost: "12000",
    locationId: fromLocationId,
    batchId,
    stockBalanceId,
    reason: "Hết hạn cuối ca"
  });

  assert.deepEqual(parsed, {
    ingredientId,
    movementType: "expired",
    quantity: 3.5,
    unitCost: 12000,
    locationId: fromLocationId,
    batchId,
    stockBalanceId,
    reason: "Hết hạn cuối ca"
  });
});

test("inventory purchase order schema treats blank legacy line fields as optional", () => {
  const parsed = inventoryPurchaseOrderSchema.parse({
    supplierId: "",
    locationId: fromLocationId,
    ingredientId: "",
    orderQuantity: "",
    orderUnit: "",
    unitCost: "",
    expectedDeliveryAt: "",
    expirationDate: "",
    batchCode: "",
    note: ""
  });

  assert.equal(parsed.orderQuantity, undefined);
  assert.equal(parsed.unitCost, undefined);
});

test("inventory purchase order rows parse multi-line PO drafts", () => {
  const parsed = inventoryPurchaseOrderRowsSchema.parse({
    rows: JSON.stringify([
      {
        ingredientId,
        orderQuantity: 10,
        orderUnit: "kg",
        unitCost: 42000,
        expirationDate: "2026-06-30",
        batchCode: "LOT-A",
        note: "giao sáng"
      }
    ])
  });

  assert.deepEqual(parsed.rows, [
    {
      ingredientId,
      orderQuantity: 10,
      orderUnit: "kg",
      unitCost: 42000,
      expirationDate: "2026-06-30",
      batchCode: "LOT-A",
      note: "giao sáng"
    }
  ]);
});

test("inventory purchase order rows enforce the database line limit", () => {
  const row = {
    ingredientId,
    orderQuantity: 1,
    orderUnit: "kg",
    unitCost: 1000,
    expirationDate: "2026-06-30",
    batchCode: "LOT-A",
    note: "test"
  };

  assert.doesNotThrow(() => inventoryPurchaseOrderRowsSchema.parse({ rows: JSON.stringify(Array.from({ length: 100 }, () => row)) }));
  assert.throws(() => inventoryPurchaseOrderRowsSchema.parse({ rows: JSON.stringify(Array.from({ length: 101 }, () => row)) }));
});

test("inventory purchase order receipt rows parse partial receiving drafts", () => {
  const parsed = inventoryPurchaseOrderReceiptRowsSchema.parse({
    rows: JSON.stringify([
      {
        purchaseOrderLineId,
        receivedQuantity: 4.5,
        unitCost: 39000,
        expirationDate: "2026-06-15",
        batchCode: "RECV-1",
        note: "giao thiếu"
      }
    ])
  });

  assert.deepEqual(parsed.rows, [
    {
      purchaseOrderLineId,
      receivedQuantity: 4.5,
      unitCost: 39000,
      expirationDate: "2026-06-15",
      batchCode: "RECV-1",
      note: "giao thiếu"
    }
  ]);
});

test("inventory purchase order receipt rows enforce the database line limit", () => {
  const row = {
    purchaseOrderLineId,
    receivedQuantity: 1,
    unitCost: 1000,
    expirationDate: "2026-06-15",
    batchCode: "RECV-1",
    note: "test"
  };

  assert.doesNotThrow(() => inventoryPurchaseOrderReceiptRowsSchema.parse({ rows: JSON.stringify(Array.from({ length: 100 }, () => row)) }));
  assert.throws(() => inventoryPurchaseOrderReceiptRowsSchema.parse({ rows: JSON.stringify(Array.from({ length: 101 }, () => row)) }));
});

test("inventory count rows preserve per-line location for multi-location count drafts", () => {
  const parsed = inventoryCountRowsSchema.parse({
    rows: JSON.stringify([
      {
        ingredientId,
        countedQuantity: 12.5,
        locationId: fromLocationId,
        note: "bar"
      }
    ])
  });

  assert.deepEqual(parsed.rows, [
    {
      ingredientId,
      countedQuantity: 12.5,
      locationId: fromLocationId,
      note: "bar"
    }
  ]);
});
