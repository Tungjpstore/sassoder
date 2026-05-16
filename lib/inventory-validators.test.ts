import assert from "node:assert/strict";
import test from "node:test";
import { inventoryCountRowsSchema, inventoryCountSchema, inventoryTransferSchema } from "./validators";

const ingredientId = "11111111-1111-4111-8111-111111111111";
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
