import assert from "node:assert/strict";
import test from "node:test";
import { buildInventoryAnalytics } from "./inventory-analytics-engine";

test("buildInventoryAnalytics summarizes stock risk, supplier delays and recipe economics", () => {
  const analytics = buildInventoryAnalytics({
    now: "2026-05-17T08:00:00.000Z",
    stockBalances: [
      {
        id: "stock-low",
        ingredientName: "Sữa tươi",
        ingredientUnit: "l",
        locationName: "Kho lạnh",
        branchName: "CN A",
        batchCode: "MILK-01",
        expirationDate: "2026-05-19",
        onHandQuantity: 4,
        availableQuantity: 3,
        reservedQuantity: 1,
        incomingQuantity: 10,
        referenceUnitCost: 32000,
        status: "low"
      },
      {
        id: "stock-ok",
        ingredientName: "Đường",
        ingredientUnit: "kg",
        locationName: "Kho khô",
        branchName: "CN A",
        batchCode: null,
        expirationDate: null,
        onHandQuantity: 25,
        availableQuantity: 25,
        reservedQuantity: 0,
        incomingQuantity: 0,
        referenceUnitCost: 18000,
        status: "available"
      }
    ],
    purchaseOrders: [
      {
        id: "po-late",
        status: "ordered",
        supplierName: "NCC A",
        totalAmount: 1200000,
        expectedDeliveryAt: "2026-05-16T08:00:00.000Z",
        lineCount: 3
      },
      {
        id: "po-open",
        status: "approved",
        supplierName: "NCC A",
        totalAmount: 800000,
        expectedDeliveryAt: "2026-05-18T08:00:00.000Z",
        lineCount: 2
      }
    ],
    countSessions: [
      {
        id: "count-1",
        title: "Kiểm kê cuối ca",
        status: "submitted",
        locationName: "Kho lạnh",
        lineCount: 4,
        totalAbsVariance: 3.5,
        totalVarianceValue: 160000
      }
    ],
    recipeItems: [
      {
        id: "drink-1",
        name: "Trà sữa",
        categoryName: "Đồ uống",
        price: 35000,
        recipeLineCount: 3,
        recipeCostPercent: 55,
        grossProfit: 15750,
        grossMarginPercent: 45,
        costStatus: "high"
      },
      {
        id: "drink-2",
        name: "Trà đào",
        categoryName: "Đồ uống",
        price: 39000,
        recipeLineCount: 0,
        recipeCostPercent: 0,
        grossProfit: 0,
        grossMarginPercent: 0,
        costStatus: "healthy"
      }
    ],
    alerts: [
      { id: "alert-1", alertType: "low_stock", severity: "high", status: "open" },
      { id: "alert-2", alertType: "supplier_delay", severity: "medium", status: "acknowledged" }
    ]
  });

  assert.equal(analytics.stockSignals.lowOrOutCount, 1);
  assert.equal(analytics.stockSignals.expiringSoonCount, 1);
  assert.equal(analytics.stockSignals.pendingImportCount, 1);
  assert.equal(analytics.workingCapital.riskValue, 128000);
  assert.equal(analytics.purchasing.openPurchaseOrderCount, 2);
  assert.equal(analytics.purchasing.latePurchaseOrderCount, 1);
  assert.equal(analytics.purchasing.supplierExposure[0]?.openValue, 2000000);
  assert.equal(analytics.recipeEconomics.highCostCount, 1);
  assert.equal(analytics.recipeEconomics.missingRecipeCount, 1);
  assert.equal(analytics.counting.largestVarianceSession?.title, "Kiểm kê cuối ca");
  assert.ok(analytics.riskScore < 100);
  assert.ok(analytics.actionQueue.some((item) => item.id === "late-po"));
});

test("buildInventoryAnalytics stays stable with empty input", () => {
  const analytics = buildInventoryAnalytics({
    now: "2026-05-17T08:00:00.000Z",
    stockBalances: [],
    purchaseOrders: [],
    countSessions: [],
    recipeItems: [],
    alerts: []
  });

  assert.equal(analytics.riskScore, 100);
  assert.equal(analytics.workingCapital.onHandValue, 0);
  assert.equal(analytics.recipeEconomics.averageFoodCostPercent, 0);
  assert.deepEqual(analytics.actionQueue, []);
});
