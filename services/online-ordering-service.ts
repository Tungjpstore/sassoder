import { createServerSupabaseClient } from "@/lib/supabase/server";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import {
  isClosedOrderProgress,
  resolveOrderPaymentStatus,
  resolveOrderProgressState
} from "@/lib/orders/order-state-machine";
import type { DeliveryStatus, OrderStatus, PaymentStatus } from "@/types/domain";
import type { Database, Json } from "@/types/supabase";

type RestaurantRow = Database["public"]["Tables"]["restaurants"]["Row"];

type OnlineOrderRow = {
  id: string;
  status: OrderStatus;
  payment_status: PaymentStatus | null;
  total: number;
  fulfillment_type: "PICKUP" | "DELIVERY";
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  delivery_distance_km: number | string | null;
  delivery_fee: number | null;
  delivery_status: DeliveryStatus | null;
  delivery_route_duration_minutes: number | null;
  delivery_quote_snapshot: Json | null;
  created_at: string;
  accepted_at: string | null;
  service_due_at: string | null;
  items:
    | Array<{
        quantity: number;
        menuItem: { name: string } | { name: string }[] | null;
      }>
    | null;
};

export type OnlineOrderingDashboard = {
  restaurant: RestaurantRow;
  menuItems: number;
  categories: number;
  stats: {
    todayOrders: number;
    todayRevenue: number;
    pending: number;
    preparing: number;
    waitingPayment: number;
    prepaidWaitingConfirm: number;
    pickupOpen: number;
    deliveryOpen: number;
    activeOnline: number;
    averageTicket: number;
  };
  recentOrders: Array<{
    id: string;
    status: OrderStatus;
    total: number;
    fulfillmentType: "PICKUP" | "DELIVERY";
    customerName: string | null;
    customerPhone: string | null;
    deliveryAddress: string | null;
    deliveryDistanceKm: number | null;
    deliveryFee: number;
    deliveryStatus: string | null;
    deliveryRouteDurationMinutes: number | null;
    deliveryQuoteSnapshot: Json | null;
    paymentStatus: string | null;
    createdAt: string;
    acceptedAt: string | null;
    serviceDueAt: string | null;
    itemSummary: string;
  }>;
};

function firstOrNull<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function orderProgress(row: OnlineOrderRow) {
  return resolveOrderProgressState({
    status: row.status,
    fulfillmentType: row.fulfillment_type,
    deliveryStatus: row.delivery_status,
    paymentStatus: row.payment_status
  });
}

function orderPayment(row: OnlineOrderRow) {
  return resolveOrderPaymentStatus({
    status: row.status,
    paymentStatus: row.payment_status
  });
}

function summarizeItems(items: OnlineOrderRow["items"]) {
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

function toNumber(value: number | string | null) {
  if (value === null) return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

export async function getOnlineOrderingDashboard(restaurantId: string): Promise<OnlineOrderingDashboard> {
  const supabase = await createServerSupabaseClient();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [restaurantResult, menuCountResult, categoryCountResult, ordersResult] = await Promise.all([
    supabase.from("restaurants").select("*").eq("id", restaurantId).single(),
    supabase.from("menu_items").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId),
    supabase.from("menu_categories").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId),
    supabase
      .from("orders")
      .select(
        "id,status,payment_status,total,fulfillment_type,customer_name,customer_phone,delivery_address,delivery_distance_km,delivery_fee,delivery_status,delivery_route_duration_minutes,delivery_quote_snapshot,created_at,accepted_at,service_due_at,items:order_items(quantity,menuItem:menu_items(name))"
      )
      .eq("restaurant_id", restaurantId)
      .in("fulfillment_type", ["PICKUP", "DELIVERY"])
      .order("created_at", { ascending: false })
      .limit(80)
  ]);

  throwIfSupabaseError(restaurantResult.error);
  throwIfSupabaseError(menuCountResult.error);
  throwIfSupabaseError(categoryCountResult.error);
  throwIfSupabaseError(ordersResult.error);

  const restaurant = restaurantResult.data as RestaurantRow;
  const rows = (ordersResult.data ?? []) as unknown as OnlineOrderRow[];
  const todayRows = rows.filter((order) => new Date(order.created_at) >= startOfDay);
  const paidToday = todayRows.filter((order) => orderPayment(order) === "paid");
  const activeRows = rows.filter((order) => !isClosedOrderProgress(orderProgress(order)));
  const waitingPaymentRows = activeRows.filter((order) => {
    const paymentStatus = orderPayment(order);
    return paymentStatus === "waiting_payment" || paymentStatus === "waiting_confirm";
  });
  const todayRevenue = paidToday.reduce((sum, order) => sum + order.total, 0);

  return {
    restaurant,
    menuItems: menuCountResult.count ?? 0,
    categories: categoryCountResult.count ?? 0,
    stats: {
      todayOrders: todayRows.length,
      todayRevenue,
      pending: activeRows.filter((order) => orderProgress(order) === "awaiting_confirmation").length,
      preparing: activeRows.filter((order) => ["preparing", "delivering"].includes(orderProgress(order))).length,
      waitingPayment: waitingPaymentRows.length,
      prepaidWaitingConfirm: activeRows.filter((order) => orderPayment(order) === "waiting_confirm").length,
      pickupOpen: activeRows.filter((order) => order.fulfillment_type === "PICKUP").length,
      deliveryOpen: activeRows.filter((order) => order.fulfillment_type === "DELIVERY").length,
      activeOnline: activeRows.length,
      averageTicket: paidToday.length > 0 ? Math.round(todayRevenue / paidToday.length) : 0
    },
    recentOrders: rows.slice(0, 12).map((order) => ({
      id: order.id,
      status: order.status,
      total: order.total,
      fulfillmentType: order.fulfillment_type,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      deliveryAddress: order.delivery_address,
      deliveryDistanceKm: toNumber(order.delivery_distance_km),
      deliveryFee: order.delivery_fee ?? 0,
      deliveryStatus: order.delivery_status,
      deliveryRouteDurationMinutes: order.delivery_route_duration_minutes ?? null,
      deliveryQuoteSnapshot: order.delivery_quote_snapshot ?? null,
      paymentStatus: order.payment_status,
      createdAt: order.created_at,
      acceptedAt: order.accepted_at,
      serviceDueAt: order.service_due_at,
      itemSummary: summarizeItems(order.items)
    }))
  };
}
