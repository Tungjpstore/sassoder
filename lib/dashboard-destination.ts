import { buildTenantUrl, getTenantSlugFromHost } from "@/lib/tenant-domain";

export function getDashboardDestinationForHost(restaurantSlug: string, host: string | null | undefined) {
  const currentTenantSlug = getTenantSlugFromHost(host);

  if (!host || host.includes("localhost") || currentTenantSlug === restaurantSlug) {
    return "/dashboard";
  }

  return buildTenantUrl(restaurantSlug, "/dashboard");
}
