import assert from "node:assert/strict";
import test from "node:test";
import { buildInventoryAlertCandidates } from "./inventory-alert-engine";

const ingredientId = "11111111-1111-4111-8111-111111111111";
const wasteIngredientId = "22222222-2222-4222-8222-222222222222";
const missingIngredientId = "33333333-3333-4333-8333-333333333333";
const branchId = "44444444-4444-4444-8444-444444444444";
const stockBalanceId = "55555555-5555-4555-8555-555555555555";
const batchId = "66666666-6666-4666-8666-666666666666";
const expiredBatchId = "77777777-7777-4777-8777-777777777777";
const purchaseOrderId = "88888888-8888-4888-8888-888888888888";
const menuItemId = "99999999-9999-4999-8999-999999999999";

test("buildInventoryAlertCandidates produces P3 operational alert classes", () => {
  const candidates = buildInventoryAlertCandidates({
    now: new Date("2026-05-17T08:00:00.000Z"),
    stockBalances: [
      {
        id: stockBalanceId,
        branchId,
        locationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        batchId: null,
        ingredientId,
        ingredientName: "Sữa tươi",
        ingredientUnit: "l",
        onHandQuantity: 0,
        reservedQuantity: 0,
        incomingQuantity: 0,
        minimumQuantity: 10,
        referenceUnitCost: 32000
      }
    ],
    batches: [
      {
        id: batchId,
        ingredientId,
        ingredientName: "Sữa tươi",
        ingredientUnit: "l",
        batchCode: "MILK-01",
        expirationDate: "2026-05-19",
        remainingQuantity: 4,
        unitCost: 32000,
        status: "active"
      },
      {
        id: expiredBatchId,
        ingredientId: wasteIngredientId,
        ingredientName: "Trân châu",
        ingredientUnit: "kg",
        batchCode: "TOPPING-OLD",
        expirationDate: "2026-05-15",
        remainingQuantity: 2,
        unitCost: 45000,
        status: "active"
      }
    ],
    movements: [
      {
        ingredientId: wasteIngredientId,
        branchId,
        ingredientName: "Trân châu",
        ingredientUnit: "kg",
        movementType: "waste",
        quantityDelta: -3,
        unitCost: 80000,
        referenceUnitCost: 80000,
        createdAt: "2026-05-16T08:00:00.000Z"
      },
      {
        ingredientId: wasteIngredientId,
        branchId,
        ingredientName: "Trân châu",
        ingredientUnit: "kg",
        movementType: "expired",
        quantityDelta: -1,
        unitCost: 80000,
        referenceUnitCost: 80000,
        createdAt: "2026-05-15T08:00:00.000Z"
      },
      {
        ingredientId,
        branchId,
        ingredientName: "Sữa tươi",
        ingredientUnit: "l",
        movementType: "deduct_sale",
        quantityDelta: -12,
        unitCost: 32000,
        referenceUnitCost: 32000,
        createdAt: "2026-05-16T08:00:00.000Z"
      },
      {
        ingredientId,
        branchId,
        ingredientName: "Sữa tươi",
        ingredientUnit: "l",
        movementType: "receive",
        quantityDelta: 10,
        unitCost: 48000,
        referenceUnitCost: 48000,
        createdAt: "2026-05-16T08:00:00.000Z"
      },
      {
        ingredientId,
        branchId,
        ingredientName: "Sữa tươi",
        ingredientUnit: "l",
        movementType: "receive",
        quantityDelta: 10,
        unitCost: 32000,
        referenceUnitCost: 32000,
        createdAt: "2026-05-05T08:00:00.000Z"
      }
    ],
    purchaseOrders: [
      {
        id: purchaseOrderId,
        branchId,
        supplierName: "NCC A",
        poNumber: "PO-001",
        status: "ordered",
        expectedDeliveryAt: "2026-05-14T02:00:00.000Z",
        totalAmount: 1200000,
        firstIngredientId: ingredientId,
        firstIngredientName: "Sữa tươi",
        lineCount: 2
      }
    ],
    ingredients: [
      {
        id: ingredientId,
        name: "Sữa tươi",
        unit: "l",
        onHandQuantity: 0,
        minimumQuantity: 10
      },
      {
        id: missingIngredientId,
        name: "Đào ngâm",
        unit: "hộp",
        onHandQuantity: 5,
        minimumQuantity: 2
      }
    ],
    recipeGaps: [
      {
        menuItemId,
        name: "Trà đào cam sả",
        isAvailable: true,
        recipeLineCount: 0
      }
    ]
  });

  const alertTypes = new Set(candidates.map((candidate) => candidate.alertType));
  assert.ok(alertTypes.has("out_of_stock"));
  assert.ok(alertTypes.has("expiring_soon"));
  assert.ok(alertTypes.has("expired"));
  assert.ok(alertTypes.has("supplier_delay"));
  assert.ok(alertTypes.has("waste_spike"));
  assert.ok(alertTypes.has("abnormal_usage"));
  assert.ok(alertTypes.has("price_spike"));
  assert.ok(alertTypes.has("missing_inventory"));
  assert.ok(alertTypes.has("recipe_gap"));

  const supplierDelay = candidates.find((candidate) => candidate.alertType === "supplier_delay");
  assert.equal(supplierDelay?.severity, "critical");
  assert.equal(supplierDelay?.sourceId, purchaseOrderId);

  const abnormalUsage = candidates.find((candidate) => candidate.alertType === "abnormal_usage");
  assert.match(abnormalUsage?.sourceId ?? "", /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
