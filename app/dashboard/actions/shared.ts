"use server";

import { headers } from "next/headers";
import { checkPersistentAuthRateLimit } from "@/lib/auth-rate-limit";
import { getDashboardDestinationForHost } from "@/lib/dashboard-destination";
import { requireSession } from "@/lib/session";
import { assertAdmin } from "@/services/auth-service";
import { assertStaffActionPermission } from "@/services/staff-permission-service";
import { assertFeatureEntitlement, assertRestaurantEntitlement, type PlanFeatureKey } from "@/services/subscription-service";
import type { StaffPermissionKey } from "@/lib/staff-permissions";

async function actionIp() {
  const requestHeaders = await headers();
  return (
    requestHeaders.get("cf-connecting-ip") ||
    requestHeaders.get("x-real-ip") ||
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local"
  );
}

export async function checkActionRateLimit(key: string, limit = 10, windowMs = 60_000) {
  const requestHeaders = await headers();
  const ip = await actionIp();
  const [scope, ...rest] = key.split(":");
  const userAgent = requestHeaders.get("user-agent")?.slice(0, 160) || "unknown";

  return checkPersistentAuthRateLimit({
    scope: scope || "auth",
    identifier: `${rest.join(":") || "anonymous"}:${userAgent}`,
    ip,
    limit,
    windowMs
  });
}

export async function getDashboardDestination(restaurantSlug: string) {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  return getDashboardDestinationForHost(restaurantSlug, host);
}

export async function requireOperationalAdminSession(feature?: PlanFeatureKey) {
  const session = await requireSession();
  assertAdmin(session.role);
  if (feature) await assertFeatureEntitlement(session.restaurantId, feature);
  else await assertRestaurantEntitlement(session.restaurantId);
  return session;
}

export async function requireOperationalStaffSession(feature?: PlanFeatureKey) {
  const session = await requireSession();
  if (feature) await assertFeatureEntitlement(session.restaurantId, feature);
  else await assertRestaurantEntitlement(session.restaurantId);
  return session;
}

export async function requireOperationalStaffPermissionSession(
  permission: StaffPermissionKey | StaffPermissionKey[],
  options: { feature?: PlanFeatureKey; mode?: "all" | "any" } = {}
) {
  const session = await requireOperationalStaffSession(options.feature);
  await assertStaffActionPermission(session, permission, { mode: options.mode });
  return session;
}
