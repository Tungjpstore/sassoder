import assert from "node:assert/strict";
import test from "node:test";
import { buildBranchPerformanceComparisonReport } from "./branch-performance-comparison";

test("buildBranchPerformanceComparisonReport ranks stronger revenue and service branches first", () => {
  const report = buildBranchPerformanceComparisonReport({
    generatedAt: new Date("2026-05-17T12:00:00.000Z"),
    branches: [
      { id: "branch-1", name: "Quận 1", isPrimary: true, isActive: true },
      { id: "branch-2", name: "Thảo Điền", isPrimary: false, isActive: true }
    ],
    orders: [
      {
        id: "order-1",
        branchId: "branch-1",
        status: "paid",
        total: 500000,
        createdAt: "2026-05-17T10:00:00.000Z",
        servedAt: "2026-05-17T10:18:00.000Z"
      },
      {
        id: "order-2",
        branchId: "branch-2",
        status: "paid",
        total: 100000,
        createdAt: "2026-05-17T09:00:00.000Z",
        servedAt: "2026-05-17T09:55:00.000Z"
      }
    ],
    stockMetrics: [
      { branchId: "branch-1", stockBalanceCount: 8, lowStockCount: 0, outOfStockCount: 0 },
      { branchId: "branch-2", stockBalanceCount: 8, lowStockCount: 3, outOfStockCount: 1 }
    ],
    staffMetrics: [
      { branchId: "branch-1", assignedStaff: 4, activeStaff: 3, lateCount: 0, pendingApprovals: 0, coverageScore: 90 },
      { branchId: "branch-2", assignedStaff: 2, activeStaff: 0, lateCount: 1, pendingApprovals: 2, coverageScore: 32 }
    ]
  });

  assert.equal(report.strongestBranch?.branchId, "branch-1");
  assert.equal(report.weakestBranch?.branchId, "branch-2");
  assert.equal(report.lowStockCount, 3);
  assert.equal(report.outOfStockCount, 1);
  assert.ok((report.strongestBranch?.performanceScore ?? 0) > (report.weakestBranch?.performanceScore ?? 0));
});

test("buildBranchPerformanceComparisonReport flags overdue service risk", () => {
  const report = buildBranchPerformanceComparisonReport({
    generatedAt: new Date("2026-05-17T12:00:00.000Z"),
    branches: [{ id: "branch-1", name: "Quận 1", isPrimary: true, isActive: true }],
    orders: [
      {
        id: "order-1",
        branchId: "branch-1",
        status: "pending",
        total: 100000,
        createdAt: "2026-05-17T11:00:00.000Z",
        serviceDueAt: "2026-05-17T11:30:00.000Z"
      }
    ],
    staffMetrics: [{ branchId: "branch-1", assignedStaff: 1, activeStaff: 0, lateCount: 0, pendingApprovals: 0, coverageScore: 20 }]
  });

  assert.equal(report.rows[0]?.overdueOrderCount, 1);
  assert.match(report.rows[0]?.action ?? "", /giảm thời gian chờ|Cân lại/);
  assert.ok(report.weakBranchCount >= 1);
});
