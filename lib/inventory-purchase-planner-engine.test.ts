import assert from "node:assert/strict";
import test from "node:test";
import { buildInventoryPurchasePlan } from "./inventory-purchase-planner-engine";

test("buildInventoryPurchasePlan prioritizes urgent reorder lines and supplier choice", () => {
  const plan = buildInventoryPurchasePlan({
    now: "2026-05-17T08:00:00.000Z",
    reorderSuggestions: [
      {
        ingredientId: "milk",
        name: "Sữa tươi",
        unit: "l",
        onHandQuantity: 0,
        minimumQuantity: 10,
        dailyUsage: 6,
        daysLeft: 0,
        reorderQuantity: 24,
        estimatedCost: 768000,
        urgency: "high"
      },
      {
        ingredientId: "tea",
        name: "Trà đen",
        unit: "kg",
        onHandQuantity: 4,
        minimumQuantity: 3,
        dailyUsage: 0.5,
        daysLeft: 8,
        reorderQuantity: 3,
        estimatedCost: 450000,
        urgency: "low"
      }
    ],
    suppliers: [
      { id: "supplier-a", name: "NCC A", defaultLeadDays: 3, isPreferred: false, productCount: 5 },
      { id: "supplier-b", name: "NCC B", defaultLeadDays: 2, isPreferred: true, productCount: 2 }
    ],
    purchaseOrders: [
      {
        id: "po-late",
        status: "ordered",
        supplierName: "NCC A",
        totalAmount: 1000000,
        expectedDeliveryAt: "2026-05-16T08:00:00.000Z",
        lineCount: 2
      }
    ],
    budgetLimit: 1000000
  });

  assert.equal(plan.suggestedLineCount, 2);
  assert.equal(plan.urgentLineCount, 1);
  assert.equal(plan.totalSuggestedValue, 1218000);
  assert.equal(plan.urgentSuggestedValue, 768000);
  assert.equal(plan.recommendedSupplier?.name, "NCC B");
  assert.equal(plan.latePurchaseOrderCount, 1);
  assert.equal(plan.budget.isOverBudget, true);
  assert.equal(plan.lines[0]?.ingredientId, "milk");
  assert.equal(plan.lines[0]?.unitCost, 32000);
  assert.ok(plan.warnings.some((warning) => warning.id === "urgent-reorder"));
  assert.ok(plan.warnings.some((warning) => warning.id === "late-po"));
});

test("buildInventoryPurchasePlan handles empty suppliers and no reorder lines", () => {
  const plan = buildInventoryPurchasePlan({
    now: "2026-05-17T08:00:00.000Z",
    reorderSuggestions: [],
    suppliers: [],
    purchaseOrders: [],
    budgetLimit: null
  });

  assert.equal(plan.totalSuggestedValue, 0);
  assert.equal(plan.recommendedSupplier, null);
  assert.equal(plan.supplierPlans.length, 0);
  assert.equal(plan.budget.remainingValue, null);
  assert.deepEqual(plan.warnings, []);
});
