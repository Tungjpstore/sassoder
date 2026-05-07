import "server-only";

import { AppError } from "@/lib/response";
import { getSessionProfile } from "@/lib/session";
import { assertAdmin } from "@/services/auth-service";
import { assertFeatureEntitlement, assertRestaurantEntitlement, type PlanFeatureKey } from "@/services/subscription-service";

export async function requireDashboardApiSession() {
  const session = await getSessionProfile();
  if (!session) throw new AppError("Bạn chưa đăng nhập", 401);
  return session;
}

export async function requireOperationalDashboardApiSession({
  adminOnly = false,
  feature
}: {
  adminOnly?: boolean;
  feature?: PlanFeatureKey;
} = {}) {
  const session = await requireDashboardApiSession();
  if (adminOnly) assertAdmin(session.role);
  if (feature) await assertFeatureEntitlement(session.restaurantId, feature);
  else await assertRestaurantEntitlement(session.restaurantId);
  return session;
}
