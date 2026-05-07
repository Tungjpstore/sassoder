import { createServerSupabaseClient } from "@/lib/supabase/server";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { getRestaurantAdminDashboard } from "@/services/restaurant-service";
import { listTablesWithStatus } from "@/services/table-service";
import type { AdminRecentOrder, AdminTopItem } from "@/services/dashboard-report-service";
import type { OrderStatus, PaymentMethod } from "@/types/domain";

type RecentOrderRow = {
  id: string;
  status: OrderStatus;
  total: number;
  payment_method: PaymentMethod | null;
  fulfillment_type?: "DINE_IN" | "PICKUP" | "DELIVERY";
  created_at: string;
  table: { name: string } | { name: string }[] | null;
  items:
    | Array<{
        quantity: number;
        menuItem: { name: string } | { name: string }[] | null;
      }>
    | null;
};

type TopOrderRow = {
  id: string;
  status: OrderStatus;
  payment_status?: string | null;
  total: number;
  items:
    | Array<{
        quantity: number;
        price: number;
        menuItem: { id: string; name: string } | { id: string; name: string }[] | null;
      }>
    | null;
};

type AdminOverview = Awaited<ReturnType<typeof getRestaurantAdminDashboard>> & {
  tables: Awaited<ReturnType<typeof listTablesWithStatus>>;
  recentOrders: AdminRecentOrder[];
  topItems: AdminTopItem[];
  monthRevenue: number;
};

const overviewCache = new Map<string, { expiresAt: number; value: AdminOverview }>();
const overviewCacheTtlMs = 1_200;

function readCachedOverview(restaurantId: string) {
  const cached = overviewCache.get(restaurantId);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    overviewCache.delete(restaurantId);
    return null;
  }
  return cached.value;
}

function writeCachedOverview(restaurantId: string, value: AdminOverview) {
  overviewCache.set(restaurantId, {
    value,
    expiresAt: Date.now() + overviewCacheTtlMs
  });
}

function firstOrNull<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function orderLocationLabel(order: Pick<RecentOrderRow, "fulfillment_type" | "table">) {
  if (order.fulfillment_type === "DELIVERY") return "Giao hàng";
  if (order.fulfillment_type === "PICKUP") return "Đến lấy";
  return firstOrNull(order.table)?.name ?? "Không rõ bàn";
}

function summarizeItems(items: RecentOrderRow["items"]) {
  return (
    (items ?? [])
      .slice(0, 3)
      .map((item) => {
        const menuItem = firstOrNull(item.menuItem);
        return menuItem ? `${item.quantity}x ${menuItem.name}` : null;
      })
      .filter(Boolean)
      .join(", ") || "Chưa có món"
  );
}

export async function getAdminDashboardOverview(restaurantId: string): Promise<AdminOverview> {
  const cached = readCachedOverview(restaurantId);
  if (cached) return cached;

  const supabase = await createServerSupabaseClient();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const dashboardPromise = getRestaurantAdminDashboard(restaurantId);
  const tablesPromise = listTablesWithStatus(restaurantId);
  const recentOrdersPromise = supabase
    .from("orders")
    .select("id,status,total,payment_method,fulfillment_type,created_at,table:tables(name),items:order_items(quantity,menuItem:menu_items(name))")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(5);
  const topOrdersPromise = supabase
    .from("orders")
    .select("id,status,payment_status,total,items:order_items(quantity,price,menuItem:menu_items(id,name))")
    .eq("restaurant_id", restaurantId)
    .neq("status", "cancelled")
    .gte("created_at", monthStart.toISOString())
    .order("created_at", { ascending: false })
    .limit(220);

  const [dashboardBundle, tables, recentOrdersResult, topOrdersResult] = await Promise.all([
    dashboardPromise,
    tablesPromise,
    recentOrdersPromise,
    topOrdersPromise
  ]);

  throwIfSupabaseError(recentOrdersResult.error);
  throwIfSupabaseError(topOrdersResult.error);

  const recentOrders = ((recentOrdersResult.data ?? []) as unknown as RecentOrderRow[]).map((order) => ({
    id: order.id,
    status: order.status,
    total: order.total,
    paymentMethod: order.payment_method,
    createdAt: order.created_at,
    tableName: orderLocationLabel(order),
    itemSummary: summarizeItems(order.items)
  }));

  const itemMap = new Map<string, AdminTopItem>();
  const topOrderRows = (topOrdersResult.data ?? []) as unknown as TopOrderRow[];
  let monthRevenue = 0;

  for (const order of topOrderRows) {
    if (order.status === "paid" || order.payment_status === "paid") monthRevenue += order.total;

    for (const item of order.items ?? []) {
      const menuItem = firstOrNull(item.menuItem);
      if (!menuItem) continue;

      const current = itemMap.get(menuItem.id) ?? {
        id: menuItem.id,
        name: menuItem.name,
        quantity: 0,
        revenue: 0,
        categoryName: "Menu"
      };
      current.quantity += item.quantity;
      current.revenue += item.quantity * item.price;
      itemMap.set(menuItem.id, current);
    }
  }

  const overview = {
    ...dashboardBundle,
    tables,
    recentOrders,
    topItems: [...itemMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 8),
    monthRevenue
  };

  writeCachedOverview(restaurantId, overview);
  return overview;
}
