import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import type { OrderStatus, PaymentMethod } from "@/types/domain";

type RawReportOrder = {
  id: string;
  status: OrderStatus;
  payment_status?: string | null;
  total: number;
  payment_method: PaymentMethod | null;
  fulfillment_type?: "DINE_IN" | "PICKUP" | "DELIVERY";
  created_at: string;
  table: { name: string } | { name: string }[] | null;
  items:
    | Array<{
        quantity: number;
        price: number;
        menuItem: { id: string; name: string; category_id: string } | { id: string; name: string; category_id: string }[] | null;
      }>
    | null;
};

type CategoryRow = {
  id: string;
  name: string;
};

const adminReportCache = new Map<string, { expiresAt: number; value: AdminReport }>();
const adminReportCacheTtlMs = 15_000;

type ReportPeriod = "weekly" | "monthly" | "yearly";
type AdminReportOptions = {
  period?: ReportPeriod;
  now?: Date;
};

function reportCacheKey(restaurantId: string, options: AdminReportOptions = {}) {
  return `${restaurantId}:${options.period ?? "monthly"}:${(options.now ?? new Date()).toISOString().slice(0, 10)}`;
}

function readCachedAdminReport(cacheKey: string) {
  const cached = adminReportCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    adminReportCache.delete(cacheKey);
    return null;
  }
  return cached.value;
}

function writeCachedAdminReport(cacheKey: string, value: AdminReport) {
  adminReportCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + adminReportCacheTtlMs
  });
}

export function invalidateAdminReportCache(restaurantId: string) {
  for (const key of adminReportCache.keys()) {
    if (key.startsWith(`${restaurantId}:`)) {
      adminReportCache.delete(key);
    }
  }
}

function firstOrNull<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function orderLocationLabel(order: Pick<RawReportOrder, "fulfillment_type" | "table">) {
  if (order.fulfillment_type === "DELIVERY") return "Giao hàng";
  if (order.fulfillment_type === "PICKUP") return "Đến lấy";
  return firstOrNull(order.table)?.name ?? "Không rõ bàn";
}

function dateKey(value: string) {
  return value.slice(0, 10);
}

function sameDayLabel(value: Date) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(value);
}

function formatHour(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function percentDelta(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function startOfWeekMonday(value: Date) {
  const start = new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  const day = start.getUTCDay();
  const isoDay = day === 0 ? 7 : day;
  start.setUTCDate(start.getUTCDate() - isoDay + 1);
  return start;
}

function reportWindow(now: Date, period: ReportPeriod) {
  if (period === "weekly") {
    const currentStart = startOfWeekMonday(now);
    const previousStart = new Date(currentStart);
    previousStart.setUTCDate(previousStart.getUTCDate() - 7);
    return { currentStart, previousStart };
  }

  if (period === "yearly") {
    return {
      currentStart: new Date(now.getFullYear(), 0, 1),
      previousStart: new Date(now.getFullYear() - 1, 0, 1)
    };
  }

  return {
    currentStart: new Date(now.getFullYear(), now.getMonth(), 1),
    previousStart: new Date(now.getFullYear(), now.getMonth() - 1, 1)
  };
}

export type AdminRecentOrder = {
  id: string;
  status: OrderStatus;
  total: number;
  paymentMethod: PaymentMethod | null;
  createdAt: string;
  tableName: string;
  itemSummary: string;
};

export type AdminTopItem = {
  id: string;
  name: string;
  quantity: number;
  revenue: number;
  categoryName: string;
};

export type AdminPaymentTransaction = {
  id: string;
  tableName: string;
  method: PaymentMethod | null;
  status: OrderStatus;
  paymentStatus: string | null;
  amount: number;
  createdAt: string;
  itemCount: number;
  itemSummary: string;
};

export type AdminReport = {
  monthRevenue: number;
  previousMonthRevenue: number;
  monthRevenueDelta: number;
  monthOrders: number;
  previousMonthOrders: number;
  monthOrdersDelta: number;
  averageTicket: number;
  averageTicketDelta: number;
  paidOrders: number;
  unpaidAmount: number;
  recentOrders: AdminRecentOrder[];
  topItems: AdminTopItem[];
  paymentTransactions: AdminPaymentTransaction[];
  dailyRevenue: Array<{ date: string; label: string; revenue: number; orderCount: number }>;
  paymentRows: Array<{ label: string; value: number; count: number; method: PaymentMethod | null; color: string }>;
  peakHours: Array<{ label: string; count: number }>;
  categoryRows: Array<{ name: string; revenue: number; orderCount: number; quantity: number; averageTicket: number }>;
};

export async function getAdminReport(restaurantId: string, options: AdminReportOptions = {}): Promise<AdminReport> {
  const cacheKey = reportCacheKey(restaurantId, options);
  const cached = readCachedAdminReport(cacheKey);
  if (cached) return cached;

  const supabase = createAdminSupabaseClient();
  const now = options.now ?? new Date();
  const period = options.period ?? "monthly";
  const { currentStart, previousStart } = reportWindow(now, period);

  const [ordersResult, categoriesResult] = await Promise.all([
    supabase
      .from("orders")
      .select("id,status,payment_status,total,payment_method,fulfillment_type,created_at,table:tables(name),items:order_items(quantity,price,menuItem:menu_items(id,name,category_id))")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", previousStart.toISOString())
      .order("created_at", { ascending: false })
      .limit(period === "yearly" ? 5000 : 1600),
    supabase.from("menu_categories").select("id,name").eq("restaurant_id", restaurantId)
  ]);

  throwIfSupabaseError(ordersResult.error);
  throwIfSupabaseError(categoriesResult.error);

  const orders = (ordersResult.data ?? []) as unknown as RawReportOrder[];
  const categoryById = new Map(((categoriesResult.data ?? []) as CategoryRow[]).map((category) => [category.id, category.name]));
  const currentMonthOrders = orders.filter((order) => new Date(order.created_at) >= currentStart);
  const previousMonthOrders = orders.filter((order) => new Date(order.created_at) >= previousStart && new Date(order.created_at) < currentStart);
  const nonCancelledCurrent = currentMonthOrders.filter((order) => order.status !== "cancelled");
  const paidCurrent = currentMonthOrders.filter((order) => order.status === "paid" || order.payment_status === "paid");
  const paidPrevious = previousMonthOrders.filter((order) => order.status === "paid" || order.payment_status === "paid");

  const monthRevenue = paidCurrent.reduce((sum, order) => sum + order.total, 0);
  const previousMonthRevenue = paidPrevious.reduce((sum, order) => sum + order.total, 0);
  const monthOrders = nonCancelledCurrent.length;
  const previousMonthOrderCount = previousMonthOrders.filter((order) => order.status !== "cancelled").length;
  const averageTicket = paidCurrent.length > 0 ? Math.round(monthRevenue / paidCurrent.length) : 0;
  const previousAverageTicket = paidPrevious.length > 0 ? Math.round(previousMonthRevenue / paidPrevious.length) : 0;
  const unpaidAmount = nonCancelledCurrent
    .filter((order) => order.status !== "paid" && order.payment_status !== "paid")
    .reduce((sum, order) => sum + order.total, 0);

  const itemMap = new Map<string, AdminTopItem>();
  const categoryMap = new Map<string, { name: string; revenue: number; quantity: number; orderIds: Set<string> }>();

  for (const order of nonCancelledCurrent) {
    for (const item of order.items ?? []) {
      const menuItem = firstOrNull(item.menuItem);
      if (!menuItem) continue;
      const revenue = item.price * item.quantity;
      const categoryName = categoryById.get(menuItem.category_id) ?? "Chưa phân loại";
      const current = itemMap.get(menuItem.id) ?? {
        id: menuItem.id,
        name: menuItem.name,
        categoryName,
        quantity: 0,
        revenue: 0
      };
      current.quantity += item.quantity;
      current.revenue += revenue;
      itemMap.set(menuItem.id, current);

      const category = categoryMap.get(menuItem.category_id) ?? {
        name: categoryName,
        revenue: 0,
        quantity: 0,
        orderIds: new Set<string>()
      };
      category.revenue += revenue;
      category.quantity += item.quantity;
      category.orderIds.add(order.id);
      categoryMap.set(menuItem.category_id, category);
    }
  }

  const dailyMap = new Map<string, { revenue: number; orderCount: number }>();
  for (let day = new Date(currentStart); day <= now; day.setDate(day.getDate() + 1)) {
    dailyMap.set(dateKey(day.toISOString()), { revenue: 0, orderCount: 0 });
  }

  for (const order of paidCurrent) {
    const key = dateKey(order.created_at);
    const daily = dailyMap.get(key) ?? { revenue: 0, orderCount: 0 };
    daily.revenue += order.total;
    daily.orderCount += 1;
    dailyMap.set(key, daily);
  }

  const hourMap = new Map<number, number>();
  for (let hour = 6; hour <= 23; hour += 1) hourMap.set(hour, 0);
  for (const order of nonCancelledCurrent) {
    const hour = new Date(order.created_at).getHours();
    if (hourMap.has(hour)) hourMap.set(hour, (hourMap.get(hour) ?? 0) + 1);
  }

  const paymentMethods: Array<{ label: string; method: PaymentMethod | null; color: string }> = [
    { label: "Tiền mặt", method: "CASH", color: "#0F4D3A" },
    { label: "VietQR", method: "QR", color: "#F28C28" },
    { label: "Chưa thanh toán", method: null, color: "#A9C5A1" }
  ];

  const report = {
    monthRevenue,
    previousMonthRevenue,
    monthRevenueDelta: percentDelta(monthRevenue, previousMonthRevenue),
    monthOrders,
    previousMonthOrders: previousMonthOrderCount,
    monthOrdersDelta: percentDelta(monthOrders, previousMonthOrderCount),
    averageTicket,
    averageTicketDelta: percentDelta(averageTicket, previousAverageTicket),
    paidOrders: paidCurrent.length,
    unpaidAmount,
    recentOrders: currentMonthOrders.slice(0, 8).map((order) => ({
      id: order.id,
      status: order.status,
      total: order.total,
      paymentMethod: order.payment_method,
      createdAt: order.created_at,
      tableName: orderLocationLabel(order),
      itemSummary:
        (order.items ?? [])
          .slice(0, 3)
          .map((item) => {
            const menuItem = firstOrNull(item.menuItem);
            return menuItem ? `${item.quantity}x ${menuItem.name}` : null;
          })
          .filter(Boolean)
          .join(", ") || "Chưa có món"
    })),
    topItems: [...itemMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 8),
    paymentTransactions: currentMonthOrders
      .filter((order) => order.status !== "cancelled")
      .slice(0, 50)
      .map((order) => ({
        id: order.id,
        tableName: orderLocationLabel(order),
        method: order.payment_method,
        status: order.status,
        paymentStatus: order.payment_status ?? null,
        amount: order.total,
        createdAt: order.created_at,
        itemCount: (order.items ?? []).reduce((sum, item) => sum + item.quantity, 0),
        itemSummary:
          (order.items ?? [])
            .slice(0, 4)
            .map((item) => {
              const menuItem = firstOrNull(item.menuItem);
              return menuItem ? `${item.quantity}x ${menuItem.name}` : null;
            })
            .filter(Boolean)
            .join(", ") || "Chưa có món"
      })),
    dailyRevenue: [...dailyMap.entries()].map(([date, value]) => ({
      date,
      label: sameDayLabel(new Date(date)),
      ...value
    })),
    paymentRows: paymentMethods.map((row) => {
      const matching = row.method
        ? paidCurrent.filter((order) => order.payment_method === row.method)
        : nonCancelledCurrent.filter((order) => order.status !== "paid");
      return {
        label: row.label,
        method: row.method,
        color: row.color,
        count: matching.length,
        value: matching.reduce((sum, order) => sum + order.total, 0)
      };
    }),
    peakHours: [...hourMap.entries()].map(([hour, count]) => ({ label: formatHour(hour), count })),
    categoryRows: [...categoryMap.values()]
      .map((category) => ({
        name: category.name,
        revenue: category.revenue,
        orderCount: category.orderIds.size,
        quantity: category.quantity,
        averageTicket: category.orderIds.size > 0 ? Math.round(category.revenue / category.orderIds.size) : 0
      }))
      .sort((a, b) => b.revenue - a.revenue)
  };

  writeCachedAdminReport(cacheKey, report);
  return report;
}
