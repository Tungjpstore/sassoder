/* load-action-stream — server-side loader gom data tối thiểu cho ActionRail.
 * Chỉ pull slice nhẹ + cached 5s qua dashboard workspace cache để không
 * gánh tải cho mỗi page render.
 */

import { readThroughDashboardWorkspaceCache } from "@/lib/dashboard-workspace-cache";
import { buildDashboardActionStream, type DashboardActionInputs } from "./action-stream";
import { getAdminDashboardOverview } from "@/services/dashboard-overview-service";
import { getInventorySnapshot } from "@/services/inventory-service";
import type { ActionStreamItem } from "@/components/dashboard-v2/action-rail";

export async function loadDashboardActionStream(restaurantId: string): Promise<ActionStreamItem[]> {
  const inputs = await readThroughDashboardWorkspaceCache<DashboardActionInputs>({
    restaurantId,
    workspace: "overview",
    identifier: "action-stream",
    ttlSeconds: 5,
    load: async () => {
      const [overview, inventory] = await Promise.all([
        getAdminDashboardOverview(restaurantId).catch(() => null),
        getInventorySnapshot(restaurantId).catch(() => null)
      ]);
      const operations = overview?.operations ?? null;
      const tables = overview?.tables ?? null;
      const overdueTables = tables ? tables.filter((t) => t.status === "overdue").length : 0;
      const recentOrders = operations?.recentOrders?.map((o) => ({
        id: o.id,
        status: o.status,
        total: o.total,
        tableName: o.tableName,
        createdAt: o.createdAt
      })) ?? [];

      return {
        operations: operations
          ? {
              pending: operations.pending,
              waitingPayment: operations.waitingPayment,
              waitingConfirm: operations.waitingConfirm,
              openOrderTotal: operations.openOrderTotal,
              todayOrders: operations.todayOrders,
              todayRevenue: operations.todayRevenue
            }
          : null,
        recentOrders,
        inventory: inventory
          ? {
              schemaReady: inventory.schemaReady,
              lowStockCount: inventory.lowStockCount,
              lowStockIngredients: inventory.lowStockIngredients?.map((i) => ({
                name: i.name,
                unit: i.unit,
                onHandQuantity: i.onHandQuantity,
                minimumQuantity: i.minimumQuantity
              }))
            }
          : null,
        tables: { overdueTables },
        reservations: null,
        staff: null
      } satisfies DashboardActionInputs;
    }
  });

  return buildDashboardActionStream(inputs);
}
