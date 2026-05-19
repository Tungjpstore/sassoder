import "server-only";

import { AppError } from "@/lib/response";
import { getSessionProfile } from "@/lib/session";
import { assertAdmin } from "@/services/auth-service";
import { assertStaffActionPermission } from "@/services/staff-permission-service";
import { assertFeatureEntitlement, assertRestaurantEntitlement, type PlanFeatureKey } from "@/services/subscription-service";
import type { StaffPermissionKey } from "@/lib/staff-permissions";

export async function requireDashboardApiSession() {
  const session = await getSessionProfile();
  if (!session) throw new AppError("Bạn chưa đăng nhập", 401);
  return session;
}

export async function requireOperationalDashboardApiSession({
  adminOnly = false,
  feature,
  permission,
  permissionMode = "all"
}: {
  adminOnly?: boolean;
  feature?: PlanFeatureKey;
  permission?: StaffPermissionKey | StaffPermissionKey[];
  permissionMode?: "all" | "any";
} = {}) {
  const session = await requireDashboardApiSession();
  if (adminOnly) assertAdmin(session.role);
  if (feature) await assertFeatureEntitlement(session.restaurantId, feature);
  else await assertRestaurantEntitlement(session.restaurantId);
  if (permission) await assertStaffActionPermission(session, permission, { mode: permissionMode });
  return session;
}
