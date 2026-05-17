import assert from "node:assert/strict";
import test from "node:test";
import { buildBranchAttributionQualityReport } from "./branch-attribution-quality";

const branches = [
  { id: "branch-1", name: "Quận 1", isPrimary: true, isActive: true },
  { id: "branch-2", name: "Thảo Điền", isPrimary: false, isActive: true }
];

test("buildBranchAttributionQualityReport scores explicit pickup dine-in and delivery attribution highly", () => {
  const report = buildBranchAttributionQualityReport({
    branches,
    generatedAt: new Date("2026-05-17T00:00:00.000Z"),
    orders: [
      {
        id: "order-1",
        branchId: "branch-1",
        branchAssignmentSource: "manual",
        fulfillmentType: "PICKUP",
        status: "paid",
        total: 120000
      },
      {
        id: "order-2",
        branchId: "branch-2",
        branchAssignmentSource: "manual",
        fulfillmentType: "DINE_IN",
        paymentStatus: "paid",
        total: 180000
      },
      {
        id: "order-3",
        branchId: "branch-2",
        branchAssignmentSource: "delivery_quote",
        fulfillmentType: "DELIVERY",
        status: "paid",
        total: 220000
      }
    ]
  });

  assert.equal(report.schemaReady, true);
  assert.equal(report.qualityScore, 100);
  assert.equal(report.attributionRate, 100);
  assert.equal(report.explicitOrderCount, 3);
  assert.equal(report.deliveryQuoteOrderCount, 1);
  assert.equal(report.rows.find((row) => row.branchId === "branch-2")?.paidRevenue, 400000);
});

test("buildBranchAttributionQualityReport exposes fallback and unassigned branch risks", () => {
  const report = buildBranchAttributionQualityReport({
    branches,
    generatedAt: new Date("2026-05-17T00:00:00.000Z"),
    orders: [
      {
        id: "order-1",
        branchId: "branch-1",
        branchAssignmentSource: "primary_branch",
        fulfillmentType: "PICKUP",
        total: 90000
      },
      {
        id: "order-2",
        branchId: null,
        branchAssignmentSource: null,
        fulfillmentType: "DELIVERY",
        total: 140000
      },
      {
        id: "order-3",
        branchId: "branch-2",
        branchAssignmentSource: null,
        fulfillmentType: "DELIVERY",
        total: 160000
      }
    ]
  });

  assert.equal(report.unassignedOrderCount, 1);
  assert.equal(report.primaryFallbackOrderCount, 1);
  assert.equal(report.deliveryWithoutQuoteCount, 2);
  assert.ok(report.qualityScore < 70);
  assert.ok(report.topIssue.includes("chưa gắn chi nhánh"));
  assert.equal(report.rows[0]?.riskLevel, "risk");
});

test("buildBranchAttributionQualityReport treats single-branch fallback as acceptable", () => {
  const report = buildBranchAttributionQualityReport({
    branches: [{ id: "branch-1", name: "Cửa hàng chính", isPrimary: true, isActive: true }],
    generatedAt: new Date("2026-05-17T00:00:00.000Z"),
    orders: [
      {
        id: "order-1",
        branchId: "branch-1",
        branchAssignmentSource: "single_branch",
        fulfillmentType: "DELIVERY",
        status: "paid",
        total: 100000
      }
    ]
  });

  assert.equal(report.fallbackOrderCount, 1);
  assert.equal(report.deliveryWithoutQuoteCount, 0);
  assert.equal(report.rows[0]?.riskLevel, "watch");
  assert.ok(report.qualityScore >= 80);
});
