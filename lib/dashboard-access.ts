import "server-only";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getRestaurantEntitlement, hasFeature, type PlanFeatureKey } from "@/services/subscription-service";

function billingRedirectUrl(feature?: PlanFeatureKey) {
  const searchParams = new URLSearchParams({
    section: "billing",
    gate: feature ? "feature" : "subscription"
  });

  if (feature) {
    searchParams.set("feature", feature);
  }

  return `/dashboard/settings?${searchParams.toString()}`;
}

export async function requireDashboardAccess(feature?: PlanFeatureKey) {
  const session = await requireSession();
  const entitlement = await getRestaurantEntitlement(session.restaurantId);

  if (!entitlement.allowed) {
    redirect(billingRedirectUrl());
  }

  const featureEnabled = feature ? hasFeature(entitlement, feature) : true;
  if (!featureEnabled) {
    redirect(billingRedirectUrl(feature));
  }

  return { session, entitlement, featureEnabled };
}

export async function requireDashboardAdminAccess(feature?: PlanFeatureKey) {
  const access = await requireDashboardAccess(feature);
  if (access.session.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return access;
}

export async function getDashboardAccessForSettings() {
  const { session, entitlement } = await requireDashboardAdminAccess();
  return { session, entitlement };
}
