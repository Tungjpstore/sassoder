import "server-only";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getRestaurantEntitlement, hasFeature, type PlanFeatureKey } from "@/services/subscription-service";

export async function requireDashboardAccess(feature?: PlanFeatureKey) {
  const session = await requireSession();
  const entitlement = await getRestaurantEntitlement(session.restaurantId);

  if (!entitlement.allowed) {
    redirect("/dashboard/settings?section=billing&gate=subscription");
  }

  if (feature && !hasFeature(entitlement, feature)) {
    redirect(`/dashboard/settings?section=billing&feature=${encodeURIComponent(feature)}`);
  }

  return { session, entitlement };
}

export async function getDashboardAccessForSettings() {
  const session = await requireSession();
  const entitlement = await getRestaurantEntitlement(session.restaurantId);
  return { session, entitlement };
}
