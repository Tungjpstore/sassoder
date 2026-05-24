import assert from "node:assert/strict";
import test from "node:test";
import { buildBranchOperationInsights, type AiBranchOperationSnapshot } from "./branch-operation-insights";

function snapshot(overrides: Partial<AiBranchOperationSnapshot> = {}): AiBranchOperationSnapshot {
  const base: AiBranchOperationSnapshot = {
    branchId: "branch-1",
    branchName: "Chi nhánh Quận 1",
    isPrimary: true,
    isActive: true,
    acceptingDelivery: true,
    deliveryPaused: false,
    temporarilyClosed: false,
    orders24h: 4,
    deliveryOrders24h: 3,
    paidRevenue: 420000,
    waitingPayment: 0,
    waitingConfirm: 0,
    averageDeliveryDistanceKm: 3.2,
    stockBalanceCount: 12,
    lowStockCount: 0,
    outOfStockCount: 0,
    openInventoryAlertCount: 0,
    wasteSpikeAlertCount: 0,
    priceSpikeAlertCount: 0,
    supplierDelayAlertCount: 0,
    assignedStaff: 4,
    activeStaff: 2,
    lateCount: 0,
    pendingApprovals: 0,
    coverageScore: 82
  };

  return {
    ...base,
    ...overrides,
    wasteSpikeAlertCount: overrides.wasteSpikeAlertCount ?? base.wasteSpikeAlertCount,
    priceSpikeAlertCount: overrides.priceSpikeAlertCount ?? base.priceSpikeAlertCount,
    supplierDelayAlertCount: overrides.supplierDelayAlertCount ?? base.supplierDelayAlertCount
  };
}

test("buildBranchOperationInsights flags branch inventory and payment risks", () => {
  const deck = buildBranchOperationInsights(
    snapshot({
      paidRevenue: 0,
      waitingConfirm: 2,
      lowStockCount: 3,
      outOfStockCount: 1
    }),
    new Date("2026-05-17T00:00:00.000Z")
  );

  assert.equal(deck.primaryInsightId, "payment-chi-nhanh-co-don-nhung-chua-thanh-doanh-thu");
  assert.ok(deck.insights.some((insight) => insight.kind === "inventory" && insight.severity === "critical"));
  assert.ok(deck.healthScore < 60);
});

test("buildBranchOperationInsights detects branch waste and purchasing risks", () => {
  const deck = buildBranchOperationInsights(
    snapshot({
      openInventoryAlertCount: 3,
      wasteSpikeAlertCount: 2,
      priceSpikeAlertCount: 1,
      supplierDelayAlertCount: 1
    }),
    new Date("2026-05-17T00:00:00.000Z")
  );

  assert.ok(deck.insights.some((insight) => insight.title.includes("hao hụt tăng")));
  assert.ok(deck.insights.some((insight) => insight.title.includes("rủi ro nhập hàng")));
});

test("buildBranchOperationInsights detects staffing pressure per branch", () => {
  const deck = buildBranchOperationInsights(
    snapshot({
      assignedStaff: 3,
      activeStaff: 0,
      lateCount: 1,
      pendingApprovals: 2,
      coverageScore: 38
    }),
    new Date("2026-05-17T00:00:00.000Z")
  );

  assert.ok(deck.insights.some((insight) => insight.title.includes("chưa thấy nhân sự online")));
  assert.ok(deck.insights.some((insight) => insight.metric?.label === "Coverage"));
});

test("buildBranchOperationInsights keeps stable branches as compact opportunities", () => {
  const deck = buildBranchOperationInsights(
    snapshot({
      orders24h: 0,
      deliveryOrders24h: 0,
      paidRevenue: 0,
      assignedStaff: 2,
      activeStaff: 1
    }),
    new Date("2026-05-17T00:00:00.000Z")
  );

  assert.equal(deck.insights.length, 1);
  assert.equal(deck.insights[0]?.kind, "promotion");
  assert.ok(deck.healthScore >= 70);
});
