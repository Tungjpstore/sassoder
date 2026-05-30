import "server-only";

import { invalidateVpsTenantCache, readVpsTenantCache, writeVpsTenantCache } from "@/lib/vps-tenant-cache";

export type DashboardWorkspaceCacheScope =
  | "inventory"
  | "menu"
  | "online"
  | "overview"
  | "payments"
  | "reservations"
  | "tables";

type CacheKeyInput = {
  restaurantId: string;
  workspace: DashboardWorkspaceCacheScope;
  identifier?: string;
};

type ReadThroughInput<T> = CacheKeyInput & {
  ttlSeconds: number;
  load: () => Promise<T>;
};

export async function readThroughDashboardWorkspaceCache<T>({
  restaurantId,
  workspace,
  identifier = "default",
  ttlSeconds,
  load
}: ReadThroughInput<T>): Promise<T> {
  const cacheKey = dashboardWorkspaceCacheKey({ restaurantId, workspace, identifier });
  const cached = await readVpsTenantCache<T>(cacheKey);
  if (cached) return cached;

  const value = await load();
  void writeVpsTenantCache({ ...cacheKey, value, ttlSeconds });
  return value;
}

export async function invalidateDashboardWorkspaceCache({
  restaurantId,
  workspace,
  identifier = "*"
}: CacheKeyInput) {
  return invalidateVpsTenantCache(dashboardWorkspaceCacheKey({ restaurantId, workspace, identifier }));
}

export async function invalidateDashboardWorkspaceCaches(
  restaurantId: string,
  workspaces: DashboardWorkspaceCacheScope[]
) {
  await Promise.all(workspaces.map((workspace) => invalidateDashboardWorkspaceCache({ restaurantId, workspace })));
}

function dashboardWorkspaceCacheKey({ restaurantId, workspace, identifier = "default" }: CacheKeyInput) {
  return {
    tenantId: restaurantId,
    scope: `dashboard:${workspace}:v1`,
    identifier
  };
}
