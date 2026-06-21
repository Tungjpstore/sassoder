import { createServerSupabaseClient } from "@/lib/supabase/server";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { getRestaurantAdminDashboard } from "@/services/restaurant-service";
import { listTablesWithStatus } from "@/services/table-service";
import type { AdminRecentOrder, AdminTopItem } from "@/services/dashboard-report-service";
import type { FulfillmentType, OrderStatus, PaymentMethod, PaymentStatus } from "@/types/domain";

type RecentOrderRow = {
  id: string;
  status: OrderStatus;
  payment_status?: PaymentStatus | null;
  total: number;
  payment_method: PaymentMethod | null;
  fulfillment_type?: FulfillmentType;
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

type TodayOverviewOrderRow = {
  status: OrderStatus;
  payment_status?: string | null;
  payment_method: PaymentMethod | null;
  fulfillment_type?: "DINE_IN" | "PICKUP" | "DELIVERY";
  total: number;
  created_at: string;
};

export type AdminOverviewOrderSource = {
  key: "DINE_IN" | "PICKUP" | "DELIVERY";
  label: string;
  count: number;
  revenue: number;
};

export type AdminOverviewHourlyRevenue = {
  label: string;
  revenue: number;
  orderCount: number;
};

export type AdminOverviewPaymentMethod = {
  key: "QR" | "CASH" | "PENDING";
  label: string;
  value: number;
  count: number;
};

type AdminOverview = Awaited<ReturnType<typeof getRestaurantAdminDashboard>> & {
  tables: Awaited<ReturnType<typeof listTablesWithStatus>>;
  recentOrders: AdminRecentOrder[];
  topItems: AdminTopItem[];
  monthRevenue: number;
  orderSourcesToday: AdminOverviewOrderSource[];
  hourlyRevenueToday: AdminOverviewHourlyRevenue[];
  paymentMethodsToday: AdminOverviewPaymentMethod[];
};

const overviewCache = new Map<string, { expiresAt: number; value: AdminOverview }>();
const overviewCacheTtlMs = 8_000;

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

function hourLabel(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

export async function getAdminDashboardOverview(restaurantId: string): Promise<AdminOverview> {
  const cached = readCachedOverview(restaurantId);
  if (cached) return cached;

  const supabase = await createServerSupabaseClient();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const dashboardPromise = getRestaurantAdminDashboard(restaurantId);
  const tablesPromise = listTablesWithStatus(restaurantId);
  const recentOrdersPromise = supabase
    .from("orders")
    .select("id,status,payment_status,total,payment_method,fulfillment_type,created_at,table:tables(name),items:order_items(quantity,menuItem:menu_items(name))")
    .eq("restaurant_id", restaurantId)
    .not("status", "in", "(paid,cancelled)")
    .order("created_at", { ascending: false })
    .limit(8);
  const topOrdersPromise = supabase
    .from("orders")
    .select("id,status,payment_status,total,items:order_items(quantity,price,menuItem:menu_items(id,name))")
    .eq("restaurant_id", restaurantId)
    .neq("status", "cancelled")
    .gte("created_at", monthStart.toISOString())
    .order("created_at", { ascending: false })
    .limit(220);
  const todayOrdersPromise = supabase
    .from("orders")
    .select("status,payment_status,payment_method,fulfillment_type,total,created_at")
    .eq("restaurant_id", restaurantId)
    .gte("created_at", startOfDay.toISOString())
    .order("created_at", { ascending: true })
    .limit(800);

  const [dashboardBundle, tables, recentOrdersResult, topOrdersResult, todayOrdersResult] = await Promise.all([
    dashboardPromise,
    tablesPromise,
    recentOrdersPromise,
    topOrdersPromise,
    todayOrdersPromise
  ]);

  throwIfSupabaseError(recentOrdersResult.error);
  throwIfSupabaseError(topOrdersResult.error);
  throwIfSupabaseError(todayOrdersResult.error);

  const recentOrders = ((recentOrdersResult.data ?? []) as unknown as RecentOrderRow[]).map((order) => ({
    id: order.id,
    status: order.status,
    total: order.total,
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status ?? null,
    fulfillmentType: order.fulfillment_type ?? null,
    createdAt: order.created_at,
    tableName: orderLocationLabel(order),
    itemSummary: summarizeItems(order.items)
  }));

  const itemMap = new Map<string, AdminTopItem>();
  const topOrderRows = (topOrdersResult.data ?? []) as unknown as TopOrderRow[];
  const todayRows = (todayOrdersResult.data ?? []) as unknown as TodayOverviewOrderRow[];
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

  const orderSources = new Map<AdminOverviewOrderSource["key"], AdminOverviewOrderSource>([
    ["DINE_IN", { key: "DINE_IN", label: "QR tại bàn", count: 0, revenue: 0 }],
    ["PICKUP", { key: "PICKUP", label: "Đến lấy", count: 0, revenue: 0 }],
    ["DELIVERY", { key: "DELIVERY", label: "Giao hàng", count: 0, revenue: 0 }]
  ]);
  const hourlyRevenue = new Map<number, { revenue: number; orderCount: number }>();
  for (let hour = 6; hour <= 23; hour += 1) hourlyRevenue.set(hour, { revenue: 0, orderCount: 0 });

  const paymentMethods = new Map<AdminOverviewPaymentMethod["key"], AdminOverviewPaymentMethod>([
    ["QR", { key: "QR", label: "VietQR", value: 0, count: 0 }],
    ["CASH", { key: "CASH", label: "Tiền mặt", value: 0, count: 0 }],
    ["PENDING", { key: "PENDING", label: "Chưa thu", value: 0, count: 0 }]
  ]);

  for (const order of todayRows) {
    if (order.status === "cancelled") continue;

    const sourceKey = order.fulfillment_type === "PICKUP" || order.fulfillment_type === "DELIVERY" ? order.fulfillment_type : "DINE_IN";
    const source = orderSources.get(sourceKey);
    if (source) {
      source.count += 1;
      source.revenue += order.status === "paid" || order.payment_status === "paid" ? order.total : 0;
    }

    const hour = new Date(order.created_at).getHours();
    const hourEntry = hourlyRevenue.get(hour);
    if (hourEntry) {
      hourEntry.orderCount += 1;
      if (order.status === "paid" || order.payment_status === "paid") hourEntry.revenue += order.total;
    }

    const paymentKey = order.status === "paid" || order.payment_status === "paid"
      ? order.payment_method === "QR"
        ? "QR"
        : "CASH"
      : "PENDING";
    const payment = paymentMethods.get(paymentKey);
    if (payment) {
      payment.count += 1;
      payment.value += order.total;
    }
  }

  const overview = {
    ...dashboardBundle,
    tables,
    recentOrders,
    topItems: [...itemMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 8),
    monthRevenue,
    orderSourcesToday: [...orderSources.values()],
    hourlyRevenueToday: [...hourlyRevenue.entries()].map(([hour, value]) => ({
      label: hourLabel(hour),
      revenue: value.revenue,
      orderCount: value.orderCount
    })),
    paymentMethodsToday: [...paymentMethods.values()]
  };

  writeCachedOverview(restaurantId, overview);
  return overview;
}
