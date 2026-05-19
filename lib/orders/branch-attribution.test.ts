import assert from "node:assert/strict";
import test from "node:test";
import { resolveOrderBranchAssignment } from "./branch-attribution";

const branches = [
  { id: "branch-a", isPrimary: true, isActive: true },
  { id: "branch-b", isPrimary: false, isActive: true }
];

test("resolveOrderBranchAssignment trusts accepted delivery nearest store", () => {
  assert.deepEqual(
    resolveOrderBranchAssignment({
      fulfillmentType: "DELIVERY",
      branches,
      deliveryNearestStoreId: "branch-b"
    }),
    {
      branchId: "branch-b",
      source: "delivery_quote"
    }
  );
});

test("resolveOrderBranchAssignment does not let manual branch override delivery nearest store", () => {
  assert.deepEqual(
    resolveOrderBranchAssignment({
      fulfillmentType: "DELIVERY",
      branches,
      requestedBranchId: "branch-a",
      deliveryNearestStoreId: "branch-b"
    }),
    {
      branchId: "branch-b",
      source: "delivery_quote"
    }
  );
});

test("resolveOrderBranchAssignment accepts explicit pickup branch when active", () => {
  assert.deepEqual(
    resolveOrderBranchAssignment({
      fulfillmentType: "PICKUP",
      branches,
      requestedBranchId: "branch-b"
    }),
    {
      branchId: "branch-b",
      source: "manual"
    }
  );
});

test("resolveOrderBranchAssignment uses the only active branch for any fulfillment type", () => {
  assert.deepEqual(
    resolveOrderBranchAssignment({
      fulfillmentType: "DELIVERY",
      branches: [{ id: "branch-a", isPrimary: true, isActive: true }]
    }),
    {
      branchId: "branch-a",
      source: "single_branch"
    }
  );
});

test("resolveOrderBranchAssignment uses primary branch for pickup and dine-in fallbacks", () => {
  assert.deepEqual(
    resolveOrderBranchAssignment({
      fulfillmentType: "PICKUP",
      branches
    }),
    {
      branchId: "branch-a",
      source: "primary_branch"
    }
  );
});

test("resolveOrderBranchAssignment supports Supabase snake_case branch rows", () => {
  assert.deepEqual(
    resolveOrderBranchAssignment({
      fulfillmentType: "PICKUP",
      branches: [
        { id: "branch-a", is_primary: true, is_active: true },
        { id: "branch-b", is_primary: false, is_active: true }
      ]
    }),
    {
      branchId: "branch-a",
      source: "primary_branch"
    }
  );
});

test("resolveOrderBranchAssignment ignores inactive requested branches and falls back", () => {
  assert.deepEqual(
    resolveOrderBranchAssignment({
      fulfillmentType: "DINE_IN",
      branches: [
        { id: "branch-a", isPrimary: true, isActive: true },
        { id: "branch-c", isPrimary: false, isActive: true },
        { id: "branch-b", isPrimary: false, isActive: false }
      ],
      requestedBranchId: "branch-b"
    }),
    {
      branchId: "branch-a",
      source: "primary_branch"
    }
  );
});

test("resolveOrderBranchAssignment leaves ambiguous multi-branch delivery unassigned", () => {
  assert.deepEqual(
    resolveOrderBranchAssignment({
      fulfillmentType: "DELIVERY",
      branches,
      deliveryNearestStoreId: "missing-branch"
    }),
    {
      branchId: null,
      source: null
    }
  );
});
