import assert from "node:assert/strict";
import test from "node:test";
import { buildInventoryBranchBalancingReport } from "./inventory-branch-balancer-engine";

test("buildInventoryBranchBalancingReport suggests central kitchen transfers to shortage branches", () => {
  const report = buildInventoryBranchBalancingReport({
    now: new Date("2026-05-17T00:00:00.000Z"),
    locations: [
      { id: "central", branchName: "Kho tổng", name: "Kho trung tâm", locationType: "central_warehouse", isPrimary: true },
      { id: "branch-a", branchName: "Chi nhánh A", name: "Kho bar A", locationType: "branch_stock", isPrimary: true },
      { id: "branch-b", branchName: "Chi nhánh B", name: "Kho bar B", locationType: "branch_stock", isPrimary: true }
    ],
    stockBalances: [
      {
        id: "central-peach",
        ingredientId: "peach",
        ingredientName: "Syrup đào",
        ingredientUnit: "chai",
        locationId: "central",
        branchName: "Kho tổng",
        locationName: "Kho trung tâm",
        batchCode: "P-01",
        expirationDate: "2026-05-20",
        availableQuantity: 40,
        reservedQuantity: 2,
        incomingQuantity: 0,
        minimumQuantity: 8,
        referenceUnitCost: 85000,
        status: "available"
      },
      {
        id: "branch-a-peach",
        ingredientId: "peach",
        ingredientName: "Syrup đào",
        ingredientUnit: "chai",
        locationId: "branch-a",
        branchName: "Chi nhánh A",
        locationName: "Kho bar A",
        batchCode: null,
        expirationDate: null,
        availableQuantity: 1,
        reservedQuantity: 0,
        incomingQuantity: 0,
        minimumQuantity: 10,
        referenceUnitCost: 85000,
        status: "low"
      },
      {
        id: "branch-b-milk",
        ingredientId: "milk",
        ingredientName: "Sữa tươi",
        ingredientUnit: "l",
        locationId: "branch-b",
        branchName: "Chi nhánh B",
        locationName: "Kho bar B",
        batchCode: "M-01",
        expirationDate: "2026-05-19",
        availableQuantity: 12,
        reservedQuantity: 0,
        incomingQuantity: 0,
        minimumQuantity: 4,
        referenceUnitCost: 32000,
        status: "available"
      }
    ],
    transfers: [{ id: "transfer-1", status: "requested", fromLocationId: "central", toLocationId: "branch-a", lineCount: 1, totalQuantity: 4 }]
  });

  assert.equal(report.centralKitchen.ready, true);
  assert.equal(report.centralLocationCount, 1);
  assert.equal(report.shortageValue, 765000);
  assert.ok(report.surplusValue > report.shortageValue);
  assert.equal(report.transferSuggestions[0]?.ingredientName, "Syrup đào");
  assert.equal(report.transferSuggestions[0]?.toBranchName, "Chi nhánh A");
  assert.equal(report.transferSuggestions[0]?.priority, "urgent");
  assert.ok(report.branches.some((branch) => branch.branchName === "Chi nhánh A" && branch.shortageLineCount === 1));
  assert.ok(report.risks.some((risk) => risk.id === "shortage-Chi nhánh A"));
});

test("buildInventoryBranchBalancingReport stays stable with empty data", () => {
  const report = buildInventoryBranchBalancingReport({
    locations: [],
    stockBalances: [],
    transfers: []
  });

  assert.equal(report.balanceScore, 100);
  assert.equal(report.branchCount, 0);
  assert.equal(report.transferSuggestions.length, 0);
  assert.equal(report.centralKitchen.ready, false);
});
