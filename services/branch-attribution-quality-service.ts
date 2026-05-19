import "server-only";

import {
  buildBranchAttributionQualityReport,
  type BranchAttributionQualityBranch,
  type BranchAttributionQualityOrder,
  type BranchAttributionQualityReport
} from "@/lib/ai/branch-attribution-quality";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { ensureDefaultStoreBranch } from "@/services/branch-service";

type BranchRow = {
  id: string;
  name: string;
  is_primary: boolean | null;
  is_active: boolean | null;
};

type OrderRow = {
  id: string;
  branch_id: string | null;
  branch_assignment_source: string | null;
  fulfillment_type: string | null;
  status: string | null;
  payment_status: string | null;
  total: number | string | null;
};

function isMissingBranchAttributionSchema(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST202" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    /branch_id|branch_assignment_source|store_branches|Could not find|does not exist/i.test(error.message ?? "")
  );
}

function emptyReport(windowDays: number): BranchAttributionQualityReport {
  return buildBranchAttributionQualityReport({
    branches: [],
    orders: [],
    windowDays,
    schemaReady: false
  });
}

export async function getBranchAttributionQualityReport(
  restaurantId: string,
  input: { windowDays?: number; limit?: number } = {}
): Promise<BranchAttributionQualityReport> {
  const windowDays = Math.max(1, Math.min(30, Math.floor(input.windowDays ?? 7)));
  const limit = Math.max(100, Math.min(5000, Math.floor(input.limit ?? 3000)));
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const supabase = createAdminSupabaseClient() as any;
  await ensureDefaultStoreBranch(restaurantId);

  const [branchesResult, ordersResult] = await Promise.all([
    supabase
      .from("store_branches")
      .select("id,name,is_primary,is_active")
      .eq("restaurant_id", restaurantId)
      .order("is_primary", { ascending: false })
      .order("name", { ascending: true })
      .limit(100),
    supabase
      .from("orders")
      .select("id,branch_id,branch_assignment_source,fulfillment_type,status,payment_status,total")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit)
  ]);

  if (isMissingBranchAttributionSchema(branchesResult.error) || isMissingBranchAttributionSchema(ordersResult.error)) {
    return emptyReport(windowDays);
  }

  if (branchesResult.error) throw branchesResult.error;
  if (ordersResult.error) throw ordersResult.error;

  const branches: BranchAttributionQualityBranch[] = ((branchesResult.data ?? []) as BranchRow[]).map((branch) => ({
    id: branch.id,
    name: branch.name,
    isPrimary: branch.is_primary,
    isActive: branch.is_active
  }));
  const orders: BranchAttributionQualityOrder[] = ((ordersResult.data ?? []) as OrderRow[]).map((order) => ({
    id: order.id,
    branchId: order.branch_id,
    branchAssignmentSource: order.branch_assignment_source,
    fulfillmentType: order.fulfillment_type,
    status: order.status,
    paymentStatus: order.payment_status,
    total: order.total
  }));

  return buildBranchAttributionQualityReport({
    branches,
    orders,
    windowDays
  });
}
