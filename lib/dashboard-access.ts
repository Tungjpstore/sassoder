import "server-only";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { AppError } from "@/lib/response";
import { assertStaffActionPermission } from "@/services/staff-permission-service";
import { assertCanonicalRestaurantOwnerForTenant } from "@/services/staff-owner-boundary-service";
import { getRestaurantEntitlement, hasFeature, type PlanFeatureKey } from "@/services/subscription-service";
import type { StaffPermissionKey } from "@/lib/staff-permissions";

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
    redirect("/dashboard/staff/mobile");
  }

  return access;
}

export async function requireDashboardPermissionAccess(feature: PlanFeatureKey | undefined, permission: StaffPermissionKey | StaffPermissionKey[]) {
  const access = await requireDashboardAccess(feature);
  if (access.session.role === "ADMIN") return access;

  try {
    await assertStaffActionPermission(access.session, permission, { mode: "any" });
  } catch (error) {
    if (error instanceof AppError && error.status === 403) redirect("/dashboard/staff/mobile");
    throw error;
  }

  return access;
}

export async function getDashboardAccessForSettings(activeSection?: string | null) {
  const session = await requireSession();
  const entitlement = await getRestaurantEntitlement(session.restaurantId);

  if (session.role !== "ADMIN") {
    redirect("/dashboard/staff/mobile");
  }

  let canonicalOwnerEmail: string | null = null;
  if (activeSection === "billing") {
    try {
      const owner = await assertCanonicalRestaurantOwnerForTenant({
        restaurantId: session.restaurantId,
        userId: session.userId,
        action: "xem và quản lý gói dịch vụ"
      });
      canonicalOwnerEmail = owner.email;
    } catch (error) {
      if (error instanceof AppError && error.status === 403) redirect("/dashboard");
      throw error;
    }
  }

  if (!entitlement.allowed && activeSection !== "billing") {
    redirect(billingRedirectUrl());
  }

  return { session, entitlement, canonicalOwnerEmail };
}
