import "server-only";

import { invalidateVpsTenantCache } from "@/lib/vps-tenant-cache";

export type StaffOperationsCacheScope = "admin" | "self";

export function staffOperationsCacheKey(restaurantId: string, currentUserId?: string | null, scope?: StaffOperationsCacheScope) {
  return {
    tenantId: restaurantId,
    scope: "dashboard:staff-operations:v2",
    identifier: scope === "self" ? `self:${currentUserId ?? "unknown"}` : "admin"
  };
}

export async function invalidateStaffOperationsBundleCache(restaurantId: string) {
  await invalidateVpsTenantCache({
    tenantId: restaurantId,
    scope: "dashboard:staff-operations:v2"
  });
}
