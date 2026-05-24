import type { FulfillmentType } from "@/types/domain";

export type OrderBranchAssignmentSource = "delivery_quote" | "single_branch" | "primary_branch" | "manual";

export type OrderBranchCandidate = {
  id: string;
  isPrimary?: boolean | null;
  isActive?: boolean | null;
  is_primary?: boolean | null;
  is_active?: boolean | null;
};

export type OrderBranchAssignment = {
  branchId: string | null;
  source: OrderBranchAssignmentSource | null;
};

export function resolveOrderBranchAssignment(input: {
  fulfillmentType: FulfillmentType;
  branches: OrderBranchCandidate[];
  deliveryNearestStoreId?: string | null;
  requestedBranchId?: string | null;
}): OrderBranchAssignment {
  const activeBranches = input.branches.filter((branch) => (branch.isActive ?? branch.is_active) !== false);
  const activeBranchIds = new Set(activeBranches.map((branch) => branch.id));
  const nearestStoreId = input.deliveryNearestStoreId?.trim() || null;
  const requestedBranchId = input.requestedBranchId?.trim() || null;

  if (input.fulfillmentType !== "DELIVERY" && requestedBranchId && activeBranchIds.has(requestedBranchId)) {
    return {
      branchId: requestedBranchId,
      source: "manual"
    };
  }

  if (input.fulfillmentType === "DELIVERY" && nearestStoreId && activeBranchIds.has(nearestStoreId)) {
    return {
      branchId: nearestStoreId,
      source: "delivery_quote"
    };
  }

  if (activeBranches.length === 1) {
    return {
      branchId: activeBranches[0]?.id ?? null,
      source: activeBranches[0]?.id ? "single_branch" : null
    };
  }

  if (input.fulfillmentType !== "DELIVERY") {
    const primaryBranch = activeBranches.find((branch) => branch.isPrimary ?? branch.is_primary);
    if (primaryBranch) {
      return {
        branchId: primaryBranch.id,
        source: "primary_branch"
      };
    }
  }

  return {
    branchId: null,
    source: null
  };
}
