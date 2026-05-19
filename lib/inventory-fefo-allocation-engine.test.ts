import assert from "node:assert/strict";
import test from "node:test";
import { buildInventoryFefoAllocationPlan, buildInventoryRollbackAllocations } from "./inventory-fefo-allocation-engine";

test("buildInventoryFefoAllocationPlan allocates earliest expiring active batches first", () => {
  const plan = buildInventoryFefoAllocationPlan({
    now: new Date("2026-05-17T00:00:00.000Z"),
    demands: [{ ingredientId: "peach-syrup", quantity: 12 }],
    stock: [
      {
        ingredientId: "peach-syrup",
        batchId: "batch-late",
        locationId: "bar-a",
        branchId: "branch-a",
        availableQuantity: 10,
        expirationDate: "2026-06-01",
        batchStatus: "active",
        unitCost: 84000,
        receivedAt: "2026-05-10"
      },
      {
        ingredientId: "peach-syrup",
        batchId: "batch-early",
        locationId: "bar-a",
        branchId: "branch-a",
        availableQuantity: 5,
        expirationDate: "2026-05-20",
        batchStatus: "active",
        unitCost: 82000,
        receivedAt: "2026-05-11"
      }
    ]
  });

  assert.equal(plan.shortages.length, 0);
  assert.equal(plan.allocatedQuantity, 12);
  assert.deepEqual(
    plan.allocations.map((allocation) => [allocation.batchId, allocation.quantity, allocation.allocationIndex]),
    [
      ["batch-early", 5, 0],
      ["batch-late", 7, 1]
    ]
  );
});

test("buildInventoryFefoAllocationPlan ignores expired and quarantined batches and reports shortage", () => {
  const plan = buildInventoryFefoAllocationPlan({
    now: new Date("2026-05-17T00:00:00.000Z"),
    demands: [{ ingredientId: "milk", quantity: 9 }],
    stock: [
      {
        ingredientId: "milk",
        batchId: "expired",
        locationId: "cold-room",
        branchId: "branch-a",
        availableQuantity: 20,
        expirationDate: "2026-05-16",
        batchStatus: "active",
        unitCost: 31000
      },
      {
        ingredientId: "milk",
        batchId: "quarantine",
        locationId: "cold-room",
        branchId: "branch-a",
        availableQuantity: 20,
        expirationDate: "2026-05-20",
        batchStatus: "quarantined",
        unitCost: 30000
      },
      {
        ingredientId: "milk",
        batchId: "usable",
        locationId: "cold-room",
        branchId: "branch-a",
        availableQuantity: 4,
        expirationDate: "2026-05-22",
        batchStatus: "active",
        unitCost: 32000
      }
    ]
  });

  assert.equal(plan.allocatedQuantity, 4);
  assert.deepEqual(plan.shortages, [
    {
      ingredientId: "milk",
      requestedQuantity: 9,
      availableQuantity: 4,
      shortageQuantity: 5
    }
  ]);
});

test("buildInventoryFefoAllocationPlan supports no-batch stock after dated batches", () => {
  const plan = buildInventoryFefoAllocationPlan({
    now: new Date("2026-05-17T00:00:00.000Z"),
    demands: [{ ingredientId: "ice", quantity: 15 }],
    stock: [
      {
        ingredientId: "ice",
        batchId: null,
        locationId: "bar-a",
        branchId: "branch-a",
        availableQuantity: 20,
        expirationDate: null,
        batchStatus: null,
        unitCost: null
      },
      {
        ingredientId: "ice",
        batchId: "dated",
        locationId: "bar-a",
        branchId: "branch-a",
        availableQuantity: 6,
        expirationDate: "2026-05-18",
        batchStatus: "active",
        unitCost: 1000
      }
    ]
  });

  assert.deepEqual(
    plan.allocations.map((allocation) => [allocation.batchId, allocation.quantity]),
    [
      ["dated", 6],
      [null, 9]
    ]
  );
});

test("buildInventoryRollbackAllocations restores exact batch and location movement lines", () => {
  const plan = buildInventoryRollbackAllocations([
    {
      ingredientId: "tea",
      batchId: "batch-b",
      locationId: "bar",
      branchId: "branch-a",
      quantityDelta: -3,
      unitCost: 120000
    },
    {
      ingredientId: "tea",
      batchId: "batch-a",
      locationId: "bar",
      branchId: "branch-a",
      quantityDelta: "-2" as unknown as number,
      unitCost: 110000
    }
  ]);

  assert.deepEqual(
    plan.map((allocation) => [allocation.ingredientId, allocation.batchId, allocation.locationId, allocation.quantity, allocation.allocationIndex]),
    [
      ["tea", "batch-a", "bar", 2, 0],
      ["tea", "batch-b", "bar", 3, 1]
    ]
  );
});
