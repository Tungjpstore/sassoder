import assert from "node:assert/strict";
import test from "node:test";
import { buildInventoryAuditReport } from "./inventory-audit-engine";

test("buildInventoryAuditReport scores loss, variance and control alerts", () => {
  const report = buildInventoryAuditReport({
    movements: [
      {
        id: "waste-1",
        movementType: "waste",
        quantityDelta: -4,
        unitCost: 80000,
        sourceType: "manual",
        reason: "Pha lỗi cuối ca",
        createdAt: "2026-05-17T08:00:00.000Z",
        ingredientName: "Trân châu",
        ingredientUnit: "kg"
      },
      {
        id: "adjust-1",
        movementType: "adjust_decrease",
        quantityDelta: -2,
        unitCost: 120000,
        sourceType: "",
        reason: null,
        createdAt: "2026-05-17T09:00:00.000Z",
        ingredientName: "Syrup đào",
        ingredientUnit: "chai"
      },
      {
        id: "receive-1",
        movementType: "receive",
        quantityDelta: 10,
        unitCost: 32000,
        sourceType: "purchase_order",
        reason: null,
        createdAt: "2026-05-17T10:00:00.000Z",
        ingredientName: "Sữa tươi",
        ingredientUnit: "l"
      }
    ],
    countSessions: [
      {
        id: "count-1",
        title: "Kiểm kê cuối ca",
        status: "submitted",
        locationName: "Kho lạnh",
        lineCount: 5,
        adjustedLineCount: 2,
        totalAbsVariance: 6,
        totalVarianceValue: -450000
      }
    ],
    alerts: [
      { id: "alert-1", alertType: "waste_spike", severity: "high", status: "open", title: "Waste tăng" }
    ]
  });

  assert.equal(report.lossValue, 560000);
  assert.equal(report.manualAdjustmentValue, 240000);
  assert.equal(report.unreasonedMovementCount, 1);
  assert.equal(report.openControlAlertCount, 1);
  assert.equal(report.countVarianceValue, 450000);
  assert.ok(report.auditScore < 100);
  assert.equal(report.topLossItems[0]?.ingredientName, "Trân châu");
  assert.ok(report.riskyMovements.some((movement) => movement.id === "adjust-1"));
  assert.ok(report.controls.some((control) => control.id === "loss-control"));
});

test("buildInventoryAuditReport returns clean controls for empty input", () => {
  const report = buildInventoryAuditReport({
    movements: [],
    countSessions: [],
    alerts: []
  });

  assert.equal(report.auditScore, 100);
  assert.equal(report.lossValue, 0);
  assert.equal(report.riskyMovements.length, 0);
  assert.equal(report.controls[0]?.severity, "green");
});
