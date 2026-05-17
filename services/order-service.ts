import type { PostgrestError } from "@supabase/supabase-js";
import { AppError } from "@/lib/response";
import {
  resolveDeliveryStatusTransition,
  resolveMerchantAcceptTransition,
  type DeliveryActionStatus
} from "@/lib/orders/order-state-machine";
import { resolveOrderBranchAssignment } from "@/lib/orders/branch-attribution";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { buildDeliveryQuoteSnapshot, calculateServiceFee, getPublicOrderingSettingsBySlug, quoteDeliveryForRestaurant } from "@/services/delivery-service";
import { recordDeliveryStatusTrackingEvent } from "@/services/delivery-tracking-service";
import { ensurePaymentLogEvent, paymentTransitionKey } from "@/services/payment-log-service";
import { deductInventoryForOrder, rollbackInventoryForOrder } from "@/services/inventory-service";
import { getPaymentInstructions } from "@/services/payment-service";
import { resolvePromotionForOrder } from "@/services/promotion-service";
import { createPublicTenantAdminClient } from "@/services/public-tenant-admin-boundary";
import { invalidateRestaurantDashboardCache } from "@/services/restaurant-service";
import { assertFeatureEntitlement } from "@/services/subscription-service";
import { getPublicTable } from "@/services/table-service";
import type {
  DeliveryStatus,
  FulfillmentType,
  OrderBranchAssignmentSource,
  OrderDto,
  PaymentMethod,
  PaymentStatus,
  TableBillStatus
} from "@/types/domain";
import type { Database, Json } from "@/types/supabase";

export type CreateOrderInput = {
  restaurantSlug: string;
  tableId: string;
  tableAccessToken?: string;
  customerSessionId?: string;
  customerNote?: string;
  promotionCode?: string;
  idempotencyKey?: string;
  items: Array<{
    menuItemId: string;
    quantity: number;
    note?: string;
  }>;
};

export type CreateRemoteOrderInput = {
  restaurantSlug: string;
  branchId?: string;
  fulfillmentType: "PICKUP" | "DELIVERY";
  customerSessionId?: string;
  customerName: string;
  customerPhone: string;
  customerNote?: string;
  promotionCode?: string;
  deliveryAddress?: string;
  deliveryLat?: number;
  deliveryLng?: number;
  idempotencyKey?: string;
  items: CreateOrderInput["items"];
};

export type CustomerOrderAccessInput = {
  restaurantSlug: string;
  tableId: string;
  customerSessionId?: string;
};

export type RemoteOrderAccessInput = {
  restaurantSlug: string;
  customerSessionId: string;
};

export type OrderCleanupInput = {
  mode: "cancel" | "delete_test";
  statuses?: OrderDto["status"][];
  olderThanMinutes?: number;
  limit?: number;
};

type OrderSupabaseClient = ReturnType<typeof createAdminSupabaseClient>;
type OrderInsertRow = Database["public"]["Tables"]["orders"]["Insert"];
type RemoteDeliveryQuote = Awaited<ReturnType<typeof quoteDeliveryForRestaurant>> | null;

type RawOrder = {
  id: string;
  restaurant_id?: string;
  branch_id?: string | null;
  branch_assignment_source?: OrderBranchAssignmentSource | null;
  status: OrderDto["status"];
  subtotal?: number;
  discount_amount?: number;
  promotion_id?: string | null;
  promotion_code?: string | null;
  total: number;
  fulfillment_type?: FulfillmentType;
  bill_id?: string | null;
  payment_method: PaymentMethod | null;
  payment_status?: PaymentStatus | null;
  paid_at?: string | null;
  customer_session_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  delivery_address?: string | null;
  delivery_lat?: number | string | null;
  delivery_lng?: number | string | null;
  delivery_distance_km?: number | string | null;
  delivery_fee?: number | null;
  service_fee?: number | null;
  delivery_status?: DeliveryStatus | null;
  delivery_route_geometry?: Json | null;
  delivery_route_duration_minutes?: number | null;
  delivery_tracking_updated_at?: string | null;
  delivery_courier_id?: string | null;
  delivery_assigned_at?: string | null;
  created_at: string;
  updated_at?: string | null;
  accepted_at?: string | null;
  served_at?: string | null;
  service_due_at?: string | null;
  restaurant:
    | {
        name?: string | null;
        address?: string | null;
        store_lat?: number | null;
        store_lng?: number | null;
        bank_code: string | null;
        bank_account: string | null;
        bank_account_name: string | null;
      }
    | Array<{
        name?: string | null;
        address?: string | null;
        store_lat?: number | null;
        store_lng?: number | null;
        bank_code: string | null;
        bank_account: string | null;
        bank_account_name: string | null;
      }>
    | null;
  table: { id?: string; name: string } | { id?: string; name: string }[] | null;
  bill: RawBill | RawBill[] | null;
  deliveryCourier:
    | { id: string; name: string; phone: string | null; status: "offline" | "available" | "assigned" | "busy" | "paused" }
    | Array<{ id: string; name: string; phone: string | null; status: "offline" | "available" | "assigned" | "busy" | "paused" }>
    | null;
  items:
    | Array<{
        quantity: number;
        price: number;
        note: string | null;
        menuItem: { id?: string; name: string } | { id?: string; name: string }[] | null;
      }>
    | null;
};

type RawBill = {
  id: string;
  status: TableBillStatus;
  total: number;
  payment_method: PaymentMethod | null;
  created_at: string;
  updated_at?: string | null;
  paid_at?: string | null;
  closed_at?: string | null;
};

type CourierLocationRow = {
  order_id: string | null;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  heading_degrees: number | null;
  speed_mps: number | null;
  captured_at: string;
};

type StoreBranchAssignmentRow = {
  id: string;
  is_primary: boolean | null;
  is_active: boolean | null;
};

type PublicOrderAccessRow = {
  id: string;
  customer_session_id: string | null;
  bill:
    | { customer_session_id: string | null; status: TableBillStatus }
    | Array<{ customer_session_id: string | null; status: TableBillStatus }>
    | null;
};

type MutableOrderRow = {
  id: string;
  status: OrderDto["status"];
  total: number;
  payment_method: PaymentMethod | null;
  payment_status: PaymentStatus | null;
  paid_at?: string | null;
  fulfillment_type?: FulfillmentType | null;
  delivery_status?: DeliveryStatus | null;
  bill_id?: string | null;
  bill:
    | {
        id: string;
        status: TableBillStatus;
        payment_method: PaymentMethod | null;
        paid_at?: string | null;
      }
    | Array<{
        id: string;
        status: TableBillStatus;
        payment_method: PaymentMethod | null;
        paid_at?: string | null;
      }>
    | null;
};

const orderSelect =
  "id,restaurant_id,branch_id,branch_assignment_source,status,subtotal,discount_amount,promotion_id,promotion_code,total,fulfillment_type,bill_id,payment_method,payment_status,paid_at,customer_session_id,customer_name,customer_phone,delivery_address,delivery_lat,delivery_lng,delivery_distance_km,delivery_fee,service_fee,delivery_status,delivery_route_geometry,delivery_route_duration_minutes,delivery_tracking_updated_at,delivery_courier_id,delivery_assigned_at,created_at,updated_at,accepted_at,served_at,service_due_at,deliveryCourier:delivery_couriers(id,name,phone,status),restaurant:restaurants(name,address,store_lat,store_lng,bank_code,bank_account,bank_account_name),table:tables(id,name),bill:table_bills(id,status,total,payment_method,created_at,updated_at,paid_at,closed_at),items:order_items(quantity,price,note,menuItem:menu_items(id,name))";

const kitchenOrderSelect =
  "id,branch_id,branch_assignment_source,status,subtotal,discount_amount,promotion_id,promotion_code,total,fulfillment_type,payment_method,payment_status,paid_at,customer_session_id,customer_name,customer_phone,delivery_address,delivery_lat,delivery_lng,delivery_distance_km,delivery_fee,service_fee,delivery_status,delivery_route_geometry,delivery_route_duration_minutes,delivery_tracking_updated_at,delivery_courier_id,delivery_assigned_at,created_at,updated_at,accepted_at,served_at,service_due_at,deliveryCourier:delivery_couriers(id,name,phone,status),table:tables(id,name),items:order_items(quantity,price,note,menuItem:menu_items(id,name))";

const legacyOrderSelect = orderSelect.replace("branch_id,branch_assignment_source,", "");
const legacyKitchenOrderSelect = kitchenOrderSelect.replace("branch_id,branch_assignment_source,", "");

const activePublicStatuses: OrderDto["status"][] = ["pending", "ordering", "completed", "waiting_payment", "waiting_confirm"];
const defaultCleanupStatuses: OrderDto["status"][] = ["pending", "ordering", "completed", "waiting_payment", "cancelled"];
const hardDeleteTestStatuses: OrderDto["status"][] = ["pending", "ordering", "completed", "waiting_payment", "cancelled"];
const kitchenOrdersCache = new Map<string, { expiresAt: number; data: OrderDto[] }>();
const kitchenOrdersCacheTtlMs = 900;

function readKitchenOrdersCache(restaurantId: string) {
  const cached = kitchenOrdersCache.get(restaurantId);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    kitchenOrdersCache.delete(restaurantId);
    return null;
  }
  return cached.data;
}

function writeKitchenOrdersCache(restaurantId: string, data: OrderDto[]) {
  kitchenOrdersCache.set(restaurantId, {
    data,
    expiresAt: Date.now() + kitchenOrdersCacheTtlMs
  });
}

function invalidateRestaurantOrderCache(restaurantId: string) {
  kitchenOrdersCache.delete(restaurantId);
}

function isMissingOrderBranchSchema(error: PostgrestError | null | undefined) {
  if (!error) return false;
  const message = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  return (
    (error.code === "42703" || error.code === "PGRST204") &&
    /branch_id|branch_assignment_source/i.test(message)
  );
}

async function runOrderSelectWithBranchFallback<TData>(
  buildQuery: (select: string) => PromiseLike<{ data: TData | null; error: PostgrestError | null }>,
  fallbackSelect = legacyOrderSelect
) {
  const result = await buildQuery(orderSelect);
  if (!isMissingOrderBranchSchema(result.error)) return result;
  return buildQuery(fallbackSelect);
}

async function runKitchenSelectWithBranchFallback<TData>(
  buildQuery: (select: string) => PromiseLike<{ data: TData | null; error: PostgrestError | null }>
) {
  const result = await buildQuery(kitchenOrderSelect);
  if (!isMissingOrderBranchSchema(result.error)) return result;
  return buildQuery(legacyKitchenOrderSelect);
}

async function insertOrderWithBranchFallback(supabase: OrderSupabaseClient, payload: OrderInsertRow) {
  const result = await supabase.from("orders").insert(payload).select("id").single();
  if (!isMissingOrderBranchSchema(result.error)) return result;

  const { branch_id: _branchId, branch_assignment_source: _branchAssignmentSource, ...legacyPayload } = payload;
  void _branchId;
  void _branchAssignmentSource;
  return supabase.from("orders").insert(legacyPayload).select("id").single();
}

function normalizeOrderItems(items: CreateOrderInput["items"]) {
  const byMenuItem = new Map<string, CreateOrderInput["items"][number]>();

  for (const item of items) {
    const existing = byMenuItem.get(item.menuItemId);
    if (!existing) {
      byMenuItem.set(item.menuItemId, { ...item, note: item.note?.trim() || undefined });
      continue;
    }

    const quantity = existing.quantity + item.quantity;
    if (quantity > 50) {
      throw new AppError("Số lượng mỗi món không được vượt quá 50", 400);
    }

    const notes = [existing.note, item.note].map((note) => note?.trim()).filter(Boolean);
    byMenuItem.set(item.menuItemId, {
      menuItemId: item.menuItemId,
      quantity,
      note: notes.length ? [...new Set(notes)].join("; ").slice(0, 200) : undefined
    });
  }

  return [...byMenuItem.values()];
}

function firstOrNull<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function numericOrNull(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function routeGeometryOrNull(value: Json | null | undefined): OrderDto["deliveryRouteGeometry"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const geometry = value as { type?: unknown; coordinates?: unknown };
  if (geometry.type !== "LineString" || !Array.isArray(geometry.coordinates)) return null;
  const coordinates = geometry.coordinates.filter((point): point is number[] => {
    return (
      Array.isArray(point) &&
      point.length >= 2 &&
      Number.isFinite(Number(point[0])) &&
      Number.isFinite(Number(point[1]))
    );
  });
  return coordinates.length >= 2 ? { type: "LineString", coordinates } : null;
}

function mapOrder(order: RawOrder): OrderDto {
  const restaurant = firstOrNull(order.restaurant);
  const bill = firstOrNull(order.bill);
  const courier = firstOrNull(order.deliveryCourier);

  return {
    id: order.id,
    branchId: order.branch_id ?? null,
    branchAssignmentSource: order.branch_assignment_source ?? null,
    status: order.status,
    subtotal: order.subtotal ?? order.total + (order.discount_amount ?? 0),
    discountAmount: order.discount_amount ?? 0,
    promotionId: order.promotion_id ?? null,
    promotionCode: order.promotion_code ?? null,
    total: order.total,
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status ?? (order.status === "paid" ? "paid" : order.status === "waiting_payment" || order.status === "waiting_confirm" ? order.status : "unpaid"),
    paidAt: order.paid_at ?? null,
    fulfillmentType: order.fulfillment_type ?? "DINE_IN",
    customerName: order.customer_name ?? null,
    customerPhone: order.customer_phone ?? null,
    deliveryAddress: order.delivery_address ?? null,
    deliveryLat: numericOrNull(order.delivery_lat),
    deliveryLng: numericOrNull(order.delivery_lng),
    deliveryDistanceKm: numericOrNull(order.delivery_distance_km),
    deliveryFee: order.delivery_fee ?? 0,
    serviceFee: order.service_fee ?? 0,
    deliveryStatus: order.delivery_status ?? "none",
    deliveryRouteGeometry: routeGeometryOrNull(order.delivery_route_geometry),
    deliveryRouteDurationMinutes: order.delivery_route_duration_minutes ?? null,
    deliveryTrackingUpdatedAt: order.delivery_tracking_updated_at ?? null,
    deliveryCourierId: order.delivery_courier_id ?? null,
    deliveryAssignedAt: order.delivery_assigned_at ?? null,
    deliveryCourier: courier
      ? {
          id: courier.id,
          name: courier.name,
          phone: courier.phone,
          status: courier.status
        }
      : null,
    deliveryCourierLocation: null,
    bill: bill
      ? {
          id: bill.id,
          status: bill.status,
          total: bill.total,
          paymentMethod: bill.payment_method,
          createdAt: bill.created_at,
          updatedAt: bill.updated_at ?? null,
          paidAt: bill.paid_at ?? null,
          closedAt: bill.closed_at ?? null
        }
      : null,
    createdAt: order.created_at,
    updatedAt: order.updated_at ?? null,
    acceptedAt: order.accepted_at ?? null,
    servedAt: order.served_at ?? null,
    serviceDueAt: order.service_due_at ?? null,
    paymentConfig: restaurant
      ? {
          bankCode: restaurant.bank_code,
          bankAccount: restaurant.bank_account,
          bankAccountName: restaurant.bank_account_name
        }
      : undefined,
    restaurant: restaurant
      ? {
          name: restaurant.name ?? null,
          address: restaurant.address ?? null,
          storeLat: restaurant.store_lat ?? null,
          storeLng: restaurant.store_lng ?? null
        }
      : undefined,
    table: firstOrNull(order.table),
    items: (order.items ?? []).map((item) => ({
      quantity: item.quantity,
      price: item.price,
      note: item.note,
      menuItem: firstOrNull(item.menuItem)
    }))
  };
}

async function wait(ms: number) {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function getIdempotentRemoteOrderResult(
  orderId: string,
  supabase: OrderSupabaseClient,
  deliveryQuote: RemoteDeliveryQuote
) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const order = await getOrderDto(orderId, supabase);
    if (order.items.length > 0) {
      return {
        order,
        payment: getPaymentInstructions(order),
        deliveryQuote
      };
    }
    await wait(120 * (attempt + 1));
  }

  throw new AppError("Đơn đang được hệ thống xử lý. Vui lòng thử lại sau vài giây.", 409);
}

async function attachLatestDeliveryLocations(
  restaurantId: string,
  orders: OrderDto[],
  supabase: OrderSupabaseClient = createAdminSupabaseClient()
) {
  const deliveryOrderIds = orders
    .filter((order) => order.fulfillmentType === "DELIVERY")
    .map((order) => order.id);
  if (deliveryOrderIds.length === 0) return orders;

  const { data, error } = await supabase
    .from("courier_locations")
    .select("order_id,latitude,longitude,accuracy_meters,heading_degrees,speed_mps,captured_at")
    .eq("restaurant_id", restaurantId)
    .in("order_id", deliveryOrderIds)
    .order("captured_at", { ascending: false })
    .limit(Math.min(deliveryOrderIds.length * 3, 500));

  throwIfSupabaseError(error);
  const latestByOrderId = new Map<string, CourierLocationRow>();
  for (const row of (data ?? []) as CourierLocationRow[]) {
    if (row.order_id && !latestByOrderId.has(row.order_id)) latestByOrderId.set(row.order_id, row);
  }

  return orders.map((order) => {
    const location = latestByOrderId.get(order.id);
    if (!location) return order;
    return {
      ...order,
      deliveryCourierLocation: {
        lat: Number(location.latitude),
        lng: Number(location.longitude),
        accuracyMeters: location.accuracy_meters,
        headingDegrees: location.heading_degrees,
        speedMps: location.speed_mps,
        capturedAt: location.captured_at
      }
    };
  });
}

function mapKitchenOrder(order: Omit<RawOrder, "restaurant" | "bill">): OrderDto {
  return mapOrder({
    ...order,
    restaurant: null,
    bill: null
  });
}

async function resolveOrderBranchAssignmentForRestaurant(input: {
  supabase: OrderSupabaseClient;
  restaurantId: string;
  fulfillmentType: FulfillmentType;
  deliveryNearestStoreId?: string | null;
  requestedBranchId?: string | null;
  requireRequestedBranch?: boolean;
}) {
  const { data, error } = await input.supabase
    .from("store_branches")
    .select("id,is_primary,is_active")
    .eq("restaurant_id", input.restaurantId)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .order("name", { ascending: true })
    .limit(24);

  throwIfSupabaseError(error);

  const requestedBranchId = input.requestedBranchId?.trim() || null;
  const assignment = resolveOrderBranchAssignment({
    fulfillmentType: input.fulfillmentType,
    branches: (data ?? []) as StoreBranchAssignmentRow[],
    deliveryNearestStoreId: input.deliveryNearestStoreId,
    requestedBranchId
  });

  if (input.requireRequestedBranch && requestedBranchId && assignment.branchId !== requestedBranchId) {
    throw new AppError("Chi nhánh nhận món không khả dụng.", 400);
  }

  return assignment;
}

function orderBranchInsertFields(assignment: Awaited<ReturnType<typeof resolveOrderBranchAssignmentForRestaurant>>) {
  return {
    branch_id: assignment.branchId,
    branch_assignment_source: assignment.source
  };
}

async function closeBillIfNoActiveOrders(supabase: OrderSupabaseClient, restaurantId: string, billId?: string | null) {
  if (!billId) return false;

  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .eq("bill_id", billId)
    .neq("status", "cancelled");

  throwIfSupabaseError(error);
  if ((count ?? 0) > 0) return false;

  const now = new Date().toISOString();
  const { data, error: updateError } = await supabase
    .from("table_bills")
    .update({ status: "cancelled", payment_method: null, closed_at: now })
    .eq("id", billId)
    .eq("restaurant_id", restaurantId)
    .in("status", ["open", "waiting_payment"])
    .select("id")
    .maybeSingle();

  throwIfSupabaseError(updateError);
  return Boolean(data);
}

async function getOrCreateOpenTableBill({
  restaurantId,
  tableId,
  customerSessionId,
  supabase = createAdminSupabaseClient()
}: {
  restaurantId: string;
  tableId: string;
  customerSessionId?: string;
  supabase?: OrderSupabaseClient;
}) {
  const { data: waitingBill, error: waitingBillError } = await supabase
    .from("table_bills")
    .select("id,status")
    .eq("restaurant_id", restaurantId)
    .eq("table_id", tableId)
    .in("status", ["waiting_payment", "waiting_confirm"])
    .maybeSingle();

  throwIfSupabaseError(waitingBillError);
  if (waitingBill) {
    throw new AppError("Bàn đang chờ thanh toán. Vui lòng hoàn tất hoặc huỷ thanh toán trước khi gọi thêm món.", 409);
  }

  const { data: existingBill, error: existingBillError } = await supabase
    .from("table_bills")
    .select("id,status,total,customer_session_id")
    .eq("restaurant_id", restaurantId)
    .eq("table_id", tableId)
    .eq("status", "open")
    .maybeSingle();

  throwIfSupabaseError(existingBillError);
  if (existingBill) return existingBill;

  const { data: insertedBill, error: insertBillError } = await supabase
    .from("table_bills")
    .insert({
      restaurant_id: restaurantId,
      table_id: tableId,
      customer_session_id: customerSessionId || null
    })
    .select("id,status,total,customer_session_id")
    .single();

  if ((insertBillError as { code?: string } | null)?.code === "23505") {
    const { data: concurrentBill, error: concurrentBillError } = await supabase
      .from("table_bills")
      .select("id,status,total,customer_session_id")
      .eq("restaurant_id", restaurantId)
      .eq("table_id", tableId)
      .eq("status", "open")
      .single();

    throwIfSupabaseError(concurrentBillError);
    if (concurrentBill) return concurrentBill;
  }

  throwIfSupabaseError(insertBillError);
  if (!insertedBill) throw new AppError("Không tạo được hóa đơn bàn", 400);
  return insertedBill;
}

async function getOrderDto(orderId: string, supabase: OrderSupabaseClient = createAdminSupabaseClient()) {
  const { data, error } = await runOrderSelectWithBranchFallback((select) =>
    supabase
      .from("orders")
      .select(select)
      .eq("id", orderId)
      .single()
  );

  throwIfSupabaseError(error);
  if (!data) throw new AppError("Không tìm thấy đơn hàng", 404);
  const row = data as unknown as RawOrder;
  const order = mapOrder(row);
  const [withLocation] = row.restaurant_id
    ? await attachLatestDeliveryLocations(row.restaurant_id, [order], supabase)
    : [order];
  return withLocation ?? order;
}

async function assertCustomerOrderAccess(
  orderId: string,
  access: CustomerOrderAccessInput,
  supabase: OrderSupabaseClient = createPublicTenantAdminClient("customer_order_access")
) {
  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("id")
    .eq("slug", access.restaurantSlug)
    .single();

  throwIfSupabaseError(restaurantError);
  if (!restaurant) throw new AppError("Không tìm thấy quán", 404);
  await assertFeatureEntitlement(restaurant.id, "order_realtime");

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id,customer_session_id,bill:table_bills(customer_session_id,status)")
    .eq("id", orderId)
    .eq("restaurant_id", restaurant.id)
    .eq("table_id", access.tableId)
    .maybeSingle();

  throwIfSupabaseError(orderError);
  const accessOrder = order as unknown as PublicOrderAccessRow | null;
  if (!accessOrder) throw new AppError("Không tìm thấy đơn hàng cho bàn này", 404);

  const bill = firstOrNull(accessOrder.bill);

  const sessionMatchesOrder = Boolean(access.customerSessionId && accessOrder.customer_session_id === access.customerSessionId);
  const sessionMatchesBill = Boolean(access.customerSessionId && bill?.customer_session_id === access.customerSessionId);
  const billIsActiveForTable = Boolean(bill && ["open", "waiting_payment", "waiting_confirm"].includes(bill.status));

  if (!sessionMatchesOrder && !sessionMatchesBill && !billIsActiveForTable) {
    throw new AppError("Phiên gọi món không khớp với đơn hàng này", 403);
  }
}

async function getMutableOrder(supabase: OrderSupabaseClient, restaurantId: string, orderId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("id,status,total,payment_method,payment_status,paid_at,fulfillment_type,delivery_status,bill_id,bill:table_bills(id,status,payment_method,paid_at)")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .single();

  throwIfSupabaseError(error);
  if (!data) throw new AppError("Không tìm thấy đơn hàng", 404);
  return data as unknown as MutableOrderRow;
}

export async function getOrderLifecycleSnapshot(restaurantId: string, orderId: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id,status,total,fulfillment_type,payment_method,payment_status,paid_at,delivery_status,bill_id,created_at,updated_at,accepted_at,served_at,service_due_at,bill:table_bills(id,status,total,payment_method,paid_at,closed_at)"
    )
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  throwIfSupabaseError(error);
  return data ?? null;
}

function assertOrderNotPaid(order: MutableOrderRow) {
  const bill = firstOrNull(order.bill);
  if (order.status === "paid" || order.payment_status === "paid" || order.paid_at || bill?.status === "paid" || bill?.paid_at) {
    throw new AppError("Không thể xoá hoặc huỷ đơn đã thanh toán", 400);
  }
}

async function assertRemoteOrderAccess(
  orderId: string,
  access: RemoteOrderAccessInput,
  supabase: OrderSupabaseClient = createPublicTenantAdminClient("remote_order_access")
) {
  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("id")
    .eq("slug", access.restaurantSlug)
    .single();

  throwIfSupabaseError(restaurantError);
  if (!restaurant) throw new AppError("Không tìm thấy quán", 404);
  await assertFeatureEntitlement(restaurant.id, "online_ordering");

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .eq("restaurant_id", restaurant.id)
    .is("table_id", null)
    .eq("customer_session_id", access.customerSessionId)
    .maybeSingle();

  throwIfSupabaseError(orderError);
  if (!order) throw new AppError("Không tìm thấy đơn online của bạn", 404);
}

export async function createOrder(input: CreateOrderInput) {
  const supabase = createPublicTenantAdminClient("customer_order_create");
  const normalizedItems = normalizeOrderItems(input.items);
  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("id,slug")
    .eq("slug", input.restaurantSlug)
    .single();

  throwIfSupabaseError(restaurantError);
  if (!restaurant) throw new AppError("Không tìm thấy quán", 404);
  await assertFeatureEntitlement(restaurant.id, "order_realtime");

  const table = await getPublicTable(restaurant.id, input.tableId, input.tableAccessToken);
  if (!table) throw new AppError("Không tìm thấy bàn hoặc mã QR đã hết hiệu lực. Vui lòng quét lại mã tại bàn.", 403);

  if (input.idempotencyKey) {
    const { data: existing, error: existingError } = await supabase
      .from("orders")
      .select("id,total,payment_method")
      .eq("restaurant_id", restaurant.id)
      .eq("table_id", table.id)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();

    throwIfSupabaseError(existingError);
    if (existing) {
      const order = await getOrderDto(existing.id, supabase);
      return {
        order,
        payment: getPaymentInstructions(order)
      };
    }
  }

  const requestedIds = normalizedItems.map((item) => item.menuItemId);
  const { data: menuItems, error: itemError } = await supabase
    .from("menu_items")
    .select("id,price")
    .eq("restaurant_id", restaurant.id)
    .eq("is_available", true)
    .in("id", requestedIds);

  throwIfSupabaseError(itemError);
  if ((menuItems ?? []).length !== requestedIds.length) {
    throw new AppError("Một hoặc nhiều món hiện không khả dụng", 400);
  }

  const byId = new Map((menuItems ?? []).map((item) => [item.id, item]));
  const subtotal = normalizedItems.reduce((sum, item) => {
    const menuItem = byId.get(item.menuItemId);
    return sum + (menuItem?.price ?? 0) * item.quantity;
  }, 0);

  if (subtotal <= 0) throw new AppError("Tổng tiền đơn hàng phải lớn hơn 0", 400);
  const { promotion, discountAmount } = await resolvePromotionForOrder({
    restaurantId: restaurant.id,
    code: input.promotionCode,
    subtotal,
    channel: "QR_MENU"
  });
  const total = subtotal - discountAmount;
  const bill = await getOrCreateOpenTableBill({
    restaurantId: restaurant.id,
    tableId: table.id,
    customerSessionId: input.customerSessionId,
    supabase
  });
  const branchAssignment = await resolveOrderBranchAssignmentForRestaurant({
    supabase,
    restaurantId: restaurant.id,
    fulfillmentType: "DINE_IN",
    requestedBranchId: table.branch_id ?? null
  });

  const { data: insertedOrder, error: orderError } = await insertOrderWithBranchFallback(supabase, {
    restaurant_id: restaurant.id,
    table_id: table.id,
    bill_id: bill.id,
    ...orderBranchInsertFields(branchAssignment),
    status: "pending",
    subtotal,
    discount_amount: discountAmount,
    promotion_id: promotion?.id ?? null,
    promotion_code: promotion?.code ?? null,
    total,
    payment_method: null,
    customer_session_id: input.customerSessionId || null,
    customer_note: input.customerNote || null,
    idempotency_key: input.idempotencyKey || null
  });

  if ((orderError as { code?: string } | null)?.code === "23505" && input.idempotencyKey) {
    const { data: existing, error: existingError } = await supabase
      .from("orders")
      .select("id")
      .eq("restaurant_id", restaurant.id)
      .eq("table_id", table.id)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();

    throwIfSupabaseError(existingError);
    if (existing) {
      const order = await getOrderDto(existing.id, supabase);
      return {
        order,
        payment: getPaymentInstructions(order)
      };
    }
  }

  if (orderError || !insertedOrder) {
    throw new AppError(orderError?.message ?? "Không tạo được đơn hàng", 400);
  }

  const orderItems = normalizedItems.map((item) => {
    const menuItem = byId.get(item.menuItemId);
    if (!menuItem) throw new AppError("Không tìm thấy món", 400);

    return {
      order_id: insertedOrder.id,
      menu_item_id: item.menuItemId,
      quantity: item.quantity,
      price: menuItem.price,
      note: item.note || null
    };
  });

  const { error: orderItemError } = await supabase.from("order_items").insert(orderItems);

  if (orderItemError) {
    await supabase.from("orders").delete().eq("id", insertedOrder.id);
    throw new AppError(orderItemError.message ?? "Không tạo được món trong đơn", 400);
  }

  const order = await getOrderDto(insertedOrder.id, supabase);
  invalidateRestaurantOrderCache(restaurant.id);
  invalidateRestaurantDashboardCache(restaurant.id);
  return {
    order,
    payment: getPaymentInstructions(order)
  };
}

export async function createRemoteOrder(input: CreateRemoteOrderInput) {
  const supabase = createPublicTenantAdminClient("remote_order_create");
  const normalizedItems = normalizeOrderItems(input.items);
  const settings = await getPublicOrderingSettingsBySlug(input.restaurantSlug);

  if (!settings) throw new AppError("Không tìm thấy quán", 404);
  await assertFeatureEntitlement(settings.id, "online_ordering");
  if (!settings.online_ordering_enabled) throw new AppError("Quán chưa bật đặt món online.", 400);
  if (input.fulfillmentType === "PICKUP" && !settings.pickup_enabled) {
    throw new AppError("Quán chưa bật đơn khách đến lấy.", 400);
  }
  if (input.fulfillmentType === "DELIVERY" && !settings.delivery_enabled) {
    throw new AppError("Quán chưa bật đơn giao hàng.", 400);
  }
  if (input.fulfillmentType === "DELIVERY") {
    await assertFeatureEntitlement(settings.id, "delivery_basic");
  }

  const requiresPrepaidQr = settings.online_payment_mode === "QR_PREPAID";
  if (requiresPrepaidQr && (!settings.bank_code || !settings.bank_account)) {
    throw new AppError("Quán đang yêu cầu chuyển khoản trước nhưng chưa cấu hình ngân hàng VietQR.", 400);
  }

  if (input.idempotencyKey) {
    const { data: existing, error: existingError } = await supabase
      .from("orders")
      .select("id")
      .eq("restaurant_id", settings.id)
      .is("table_id", null)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();

    throwIfSupabaseError(existingError);
    if (existing) {
      return getIdempotentRemoteOrderResult(existing.id, supabase, null);
    }
  }

  const requestedIds = normalizedItems.map((item) => item.menuItemId);
  const { data: menuItems, error: itemError } = await supabase
    .from("menu_items")
    .select("id,price")
    .eq("restaurant_id", settings.id)
    .eq("is_available", true)
    .in("id", requestedIds);

  throwIfSupabaseError(itemError);
  if ((menuItems ?? []).length !== requestedIds.length) {
    throw new AppError("Một hoặc nhiều món hiện không khả dụng", 400);
  }

  const byId = new Map((menuItems ?? []).map((item) => [item.id, item]));
  const itemSubtotal = normalizedItems.reduce((sum, item) => {
    const menuItem = byId.get(item.menuItemId);
    return sum + (menuItem?.price ?? 0) * item.quantity;
  }, 0);

  if (itemSubtotal <= 0) throw new AppError("Tổng tiền đơn hàng phải lớn hơn 0", 400);

  const deliveryQuote =
    input.fulfillmentType === "DELIVERY"
      ? await quoteDeliveryForRestaurant(settings, {
          subtotal: itemSubtotal,
          deliveryAddress: input.deliveryAddress,
          deliveryLat: input.deliveryLat,
          deliveryLng: input.deliveryLng
        })
      : null;

  if (deliveryQuote && !deliveryQuote.accepted) {
    throw new AppError(deliveryQuote.reason ?? "Địa chỉ này chưa nằm trong vùng nhận đơn.", 400);
  }

  const deliveryFee = deliveryQuote?.fee ?? 0;
  const serviceFee = deliveryQuote?.serviceFee ?? calculateServiceFee(settings, itemSubtotal);
  const subtotal = itemSubtotal + deliveryFee + serviceFee;
  const { promotion, discountAmount } = await resolvePromotionForOrder({
    restaurantId: settings.id,
    code: input.promotionCode,
    subtotal: itemSubtotal,
    deliveryFee,
    channel: "WEBSITE"
  });
  const total = subtotal - discountAmount;
  const initialStatus: OrderDto["status"] = requiresPrepaidQr ? "waiting_payment" : "pending";
  const initialPaymentMethod: PaymentMethod | null = requiresPrepaidQr ? "QR" : null;
  const initialPaymentStatus: PaymentStatus = requiresPrepaidQr ? "waiting_payment" : "unpaid";
  const destination = deliveryQuote?.destination ?? null;
  const shouldStoreRoute = input.fulfillmentType === "DELIVERY" && settings.delivery_tracking_enabled;
  const branchAssignment = await resolveOrderBranchAssignmentForRestaurant({
    supabase,
    restaurantId: settings.id,
    fulfillmentType: input.fulfillmentType,
    deliveryNearestStoreId: deliveryQuote?.nearestStore?.id ?? null,
    requestedBranchId: input.fulfillmentType === "PICKUP" ? input.branchId ?? null : null,
    requireRequestedBranch: input.fulfillmentType === "PICKUP" && Boolean(input.branchId?.trim())
  });
  const { data: insertedOrder, error: orderError } = await insertOrderWithBranchFallback(supabase, {
    restaurant_id: settings.id,
    table_id: null,
    bill_id: null,
    ...orderBranchInsertFields(branchAssignment),
    fulfillment_type: input.fulfillmentType,
    status: initialStatus,
    subtotal,
    discount_amount: discountAmount,
    promotion_id: promotion?.id ?? null,
    promotion_code: promotion?.code ?? null,
    total,
    payment_method: initialPaymentMethod,
    payment_status: initialPaymentStatus,
    customer_session_id: input.customerSessionId || null,
    customer_note: input.customerNote || null,
    customer_name: input.customerName.trim(),
    customer_phone: input.customerPhone.trim(),
    delivery_address: input.fulfillmentType === "DELIVERY" ? input.deliveryAddress?.trim() || null : null,
    delivery_lat: input.fulfillmentType === "DELIVERY" ? input.deliveryLat ?? destination?.lat ?? null : null,
    delivery_lng: input.fulfillmentType === "DELIVERY" ? input.deliveryLng ?? destination?.lng ?? null : null,
    delivery_distance_km: deliveryQuote?.distanceKm ?? null,
    delivery_fee: deliveryFee,
    service_fee: serviceFee,
    delivery_status: input.fulfillmentType === "DELIVERY" ? "requested" : "none",
    delivery_route_geometry: shouldStoreRoute ? (deliveryQuote?.routeGeometry ?? null) : null,
    delivery_route_duration_minutes: shouldStoreRoute ? (deliveryQuote?.routeDurationMinutes ?? deliveryQuote?.etaMinutes ?? null) : null,
    delivery_route_provider: deliveryQuote?.routeProvider ?? null,
    delivery_route_confidence: deliveryQuote?.confidence ?? null,
    delivery_quote_version: deliveryQuote?.quoteVersion ?? null,
    delivery_quote_snapshot: deliveryQuote ? buildDeliveryQuoteSnapshot(settings, deliveryQuote) : null,
    delivery_tracking_updated_at: shouldStoreRoute ? new Date().toISOString() : null,
    idempotency_key: input.idempotencyKey || null
  });

  if ((orderError as { code?: string } | null)?.code === "23505" && input.idempotencyKey) {
    const { data: existing, error: existingError } = await supabase
      .from("orders")
      .select("id")
      .eq("restaurant_id", settings.id)
      .is("table_id", null)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();

    throwIfSupabaseError(existingError);
    if (existing) {
      return getIdempotentRemoteOrderResult(existing.id, supabase, deliveryQuote);
    }
  }

  if (orderError || !insertedOrder) {
    throw new AppError(orderError?.message ?? "Không tạo được đơn hàng online", 400);
  }

  const orderItems = normalizedItems.map((item) => {
    const menuItem = byId.get(item.menuItemId);
    if (!menuItem) throw new AppError("Không tìm thấy món", 400);

    return {
      order_id: insertedOrder.id,
      menu_item_id: item.menuItemId,
      quantity: item.quantity,
      price: menuItem.price,
      note: item.note || null
    };
  });

  const { error: orderItemError } = await supabase.from("order_items").insert(orderItems);

  if (orderItemError) {
    await supabase.from("orders").delete().eq("id", insertedOrder.id);
    throw new AppError(orderItemError.message ?? "Không tạo được món trong đơn online", 400);
  }

  if (requiresPrepaidQr) {
    await ensurePaymentLogEvent(supabase, {
      orderId: insertedOrder.id,
      method: "QR",
      status: "pending",
      amount: total,
      source: "remote_order_prepaid_required",
      transitionKey: paymentTransitionKey({ orderId: insertedOrder.id, stage: "start-qr-prepaid" })
    });
  }

  const order = await getOrderDto(insertedOrder.id, supabase);
  invalidateRestaurantOrderCache(settings.id);
  invalidateRestaurantDashboardCache(settings.id);
  return {
    order,
    payment: getPaymentInstructions(order),
    deliveryQuote
  };
}

export async function getPublicOrder(orderId: string, access?: CustomerOrderAccessInput) {
  const supabase = createPublicTenantAdminClient("customer_order_read");
  if (access) {
    await assertCustomerOrderAccess(orderId, access, supabase);
  }

  const order = await getOrderDto(orderId, supabase);
  return {
    order,
    payment: getPaymentInstructions(order)
  };
}

export async function getRemotePublicOrder(orderId: string, access: RemoteOrderAccessInput) {
  const supabase = createPublicTenantAdminClient("remote_order_read");
  await assertRemoteOrderAccess(orderId, access, supabase);

  const order = await getOrderDto(orderId, supabase);
  return {
    order,
    payment: getPaymentInstructions(order)
  };
}

export async function listPublicOrderHistory(input: {
  restaurantSlug: string;
  tableId: string;
  customerSessionId?: string;
}) {
  const supabase = createPublicTenantAdminClient("customer_order_history");
  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("id")
    .eq("slug", input.restaurantSlug)
    .single();

  throwIfSupabaseError(restaurantError);
  if (!restaurant) throw new AppError("Không tìm thấy quán", 404);

  const { data: table, error: tableError } = await supabase
    .from("tables")
    .select("id")
    .eq("id", input.tableId)
    .eq("restaurant_id", restaurant.id)
    .single();

  throwIfSupabaseError(tableError);
  if (!table) throw new AppError("Không tìm thấy bàn", 404);

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const customerSessionId = input.customerSessionId;
  const [sessionOrders, tableOpenOrders] = await Promise.all([
    customerSessionId
      ? runOrderSelectWithBranchFallback((select) =>
          supabase
            .from("orders")
            .select(select)
            .eq("restaurant_id", restaurant.id)
            .eq("table_id", table.id)
            .eq("customer_session_id", customerSessionId)
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(30)
        )
      : Promise.resolve({ data: [], error: null }),
    runOrderSelectWithBranchFallback((select) =>
      supabase
        .from("orders")
        .select(select)
        .eq("restaurant_id", restaurant.id)
        .eq("table_id", table.id)
        .in("status", activePublicStatuses)
        .order("created_at", { ascending: false })
        .limit(30)
    )
  ]);

  throwIfSupabaseError(sessionOrders.error);
  throwIfSupabaseError(tableOpenOrders.error);

  const byId = new Map<string, OrderDto>();
  for (const row of [...(sessionOrders.data ?? []), ...(tableOpenOrders.data ?? [])]) {
    const order = mapOrder(row as unknown as RawOrder);
    byId.set(order.id, order);
  }

  const orders = (await attachLatestDeliveryLocations(restaurant.id, [...byId.values()], supabase))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const tableOpenIds = new Set(((tableOpenOrders.data ?? []) as unknown as Array<{ id: string }>).map((order) => order.id));
  const openOrders = orders.filter((order) => tableOpenIds.has(order.id));

  return {
    orders: orders.map((order) => ({
      order,
      payment: getPaymentInstructions(order)
    })),
    activeCount: openOrders.length,
    openTotal: openOrders.reduce((sum, order) => sum + order.total, 0)
  };
}

export async function listRemoteOrderHistory(input: {
  restaurantSlug: string;
  customerSessionId: string;
}) {
  const supabase = createPublicTenantAdminClient("remote_order_history");
  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("id")
    .eq("slug", input.restaurantSlug)
    .single();

  throwIfSupabaseError(restaurantError);
  if (!restaurant) throw new AppError("Không tìm thấy quán", 404);

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await runOrderSelectWithBranchFallback((select) =>
    supabase
      .from("orders")
      .select(select)
      .eq("restaurant_id", restaurant.id)
      .is("table_id", null)
      .eq("customer_session_id", input.customerSessionId)
      .in("fulfillment_type", ["PICKUP", "DELIVERY"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20)
  );

  throwIfSupabaseError(error);

  const orders = await attachLatestDeliveryLocations(
    restaurant.id,
    ((data ?? []) as unknown as RawOrder[]).map((row) => mapOrder(row)),
    supabase
  );
  const openOrders = orders.filter((order) => activePublicStatuses.includes(order.status));

  return {
    orders: orders.map((order) => ({
      order,
      payment: getPaymentInstructions(order)
    })),
    activeCount: openOrders.length,
    openTotal: openOrders.reduce((sum, order) => sum + order.total, 0)
  };
}

export async function listOrdersForRestaurant(
  restaurantId: string,
  options: {
    includeHistory?: boolean;
    limit?: number;
  } = {}
) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await runOrderSelectWithBranchFallback((select) => {
    let query = supabase
      .from("orders")
      .select(select)
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(options.limit ?? (options.includeHistory ? 250 : 100));

    if (!options.includeHistory) {
      query = query.not("status", "in", "(paid,cancelled)");
    }

    return query;
  });

  throwIfSupabaseError(error);
  return attachLatestDeliveryLocations(
    restaurantId,
    (data ?? []).map((order) => mapOrder(order as unknown as RawOrder))
  );
}

export async function listKitchenOrdersForRestaurant(restaurantId: string) {
  const cached = readKitchenOrdersCache(restaurantId);
  if (cached) return cached;

  const supabase = createAdminSupabaseClient();
  const { data, error } = await runKitchenSelectWithBranchFallback((select) =>
    supabase
      .from("orders")
      .select(select)
      .eq("restaurant_id", restaurantId)
      .in("status", ["pending", "ordering"])
      .order("created_at", { ascending: true })
      .limit(120)
  );

  throwIfSupabaseError(error);
  const orders = (data ?? []).map((order) => mapKitchenOrder(order as unknown as Omit<RawOrder, "restaurant" | "bill">));
  writeKitchenOrdersCache(restaurantId, orders);
  return orders;
}

export async function acceptOrder(restaurantId: string, orderId: string, minutes = 15, actorUserId?: string | null) {
  const supabase = createAdminSupabaseClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("id,status,fulfillment_type,delivery_status")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .single();

  throwIfSupabaseError(error);
  if (!order) throw new AppError("Không tìm thấy đơn hàng", 404);
  const acceptTransition = resolveMerchantAcceptTransition({
    status: order.status,
    fulfillmentType: order.fulfillment_type,
    deliveryStatus: order.delivery_status
  });
  if (!acceptTransition.allowed) throw new AppError(acceptTransition.reason ?? "Không thể xác nhận đơn hàng", 400);

  await deductInventoryForOrder(restaurantId, orderId, actorUserId);

  const now = new Date();
  const nowIso = now.toISOString();
  const serviceDueAt = new Date(now.getTime() + minutes * 60_000).toISOString();
  const nextDeliveryStatus = acceptTransition.next;
  const shouldUpdateDeliveryStatus =
    order.fulfillment_type === "DELIVERY" &&
    nextDeliveryStatus !== null &&
    nextDeliveryStatus !== undefined &&
    order.delivery_status !== nextDeliveryStatus;

  const updatePayload: Database["public"]["Tables"]["orders"]["Update"] = {
    status: "ordering",
    accepted_at: nowIso,
    service_due_at: serviceDueAt,
    ...(shouldUpdateDeliveryStatus
      ? {
          delivery_status: nextDeliveryStatus,
          delivery_tracking_updated_at: nowIso
        }
      : {})
  };

  const { data: updated, error: updateError } = await supabase
    .from("orders")
    .update(updatePayload)
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .in("status", ["pending", "ordering"])
    .select()
    .maybeSingle();

  throwIfSupabaseError(updateError);
  if (!updated) {
    throw new AppError("Trạng thái đơn đã thay đổi. Vui lòng tải lại danh sách đơn.", 409);
  }
  if (shouldUpdateDeliveryStatus) {
    try {
      await recordDeliveryStatusTrackingEvent({
        restaurantId,
        orderId,
        deliveryStatus: nextDeliveryStatus as DeliveryActionStatus,
        actorUserId
      });
    } catch (error) {
      console.error("delivery_tracking_accept_event_failed", {
        restaurantId,
        orderId,
        error: error instanceof Error ? error.message : "unknown"
      });
    }
  }
  invalidateRestaurantOrderCache(restaurantId);
  invalidateRestaurantDashboardCache(restaurantId);
  return updated;
}

export async function updateOrderServiceTimer(restaurantId: string, orderId: string, minutes: number) {
  const supabase = createAdminSupabaseClient();
  const dueAt = new Date(Date.now() + minutes * 60_000).toISOString();
  const { data, error } = await supabase
    .from("orders")
    .update({ service_due_at: dueAt })
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .in("status", ["pending", "ordering"])
    .select()
    .single();

  throwIfSupabaseError(error);
  if (!data) throw new AppError("Không tìm thấy đơn cần hẹn giờ", 404);
  invalidateRestaurantOrderCache(restaurantId);
  return data;
}

export async function markOrderCompleted(restaurantId: string, orderId: string) {
  const supabase = createAdminSupabaseClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("id,status")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .single();

  throwIfSupabaseError(error);
  if (!order) throw new AppError("Không tìm thấy đơn hàng", 404);
  if (!["ordering", "completed"].includes(order.status)) {
    throw new AppError("Chỉ đơn đã được quán xác nhận mới có thể đánh dấu đã phục vụ", 400);
  }

  const { data: updated, error: updateError } = await supabase
    .from("orders")
    .update({ status: "completed", served_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .in("status", ["ordering", "completed"])
    .select()
    .maybeSingle();

  throwIfSupabaseError(updateError);
  if (!updated) {
    throw new AppError("Trạng thái đơn đã thay đổi. Vui lòng tải lại danh sách đơn.", 409);
  }
  invalidateRestaurantOrderCache(restaurantId);
  invalidateRestaurantDashboardCache(restaurantId);
  return updated;
}

export async function updateOrderDeliveryStatus(
  restaurantId: string,
  orderId: string,
  deliveryStatus: Exclude<DeliveryStatus, "none" | "requested">,
  actorUserId?: string | null
) {
  const supabase = createAdminSupabaseClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("id,status,fulfillment_type,delivery_status")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .single();

  throwIfSupabaseError(error);
  if (!order) throw new AppError("Không tìm thấy đơn giao hàng", 404);
  if (order.fulfillment_type !== "DELIVERY") {
    throw new AppError("Chỉ đơn giao hàng mới có trạng thái vận chuyển", 400);
  }
  if (order.status === "cancelled") {
    throw new AppError("Không thể cập nhật đơn đã huỷ", 400);
  }
  const deliveryTransition = resolveDeliveryStatusTransition(order.delivery_status, deliveryStatus);
  if (!deliveryTransition.allowed) {
    throw new AppError(deliveryTransition.reason ?? "Chuyển trạng thái giao hàng không hợp lệ", 409);
  }

  const nextOrderStatus = deliveryStatus === "delivered" && order.status === "ordering" ? "completed" : order.status;
  const { data: updated, error: updateError } = await supabase
    .from("orders")
    .update({
      status: nextOrderStatus,
      delivery_status: deliveryStatus,
      delivery_tracking_updated_at: new Date().toISOString(),
      ...(deliveryStatus === "delivered" ? { served_at: new Date().toISOString() } : {})
    })
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .neq("status", "cancelled")
    .select()
    .maybeSingle();

  throwIfSupabaseError(updateError);
  if (!updated) {
    throw new AppError("Trạng thái đơn đã thay đổi. Không thể cập nhật giao hàng an toàn.", 409);
  }
  try {
    await recordDeliveryStatusTrackingEvent({ restaurantId, orderId, deliveryStatus, actorUserId });
  } catch (error) {
    console.error("delivery_tracking_status_event_failed", {
      restaurantId,
      orderId,
      deliveryStatus,
      error: error instanceof Error ? error.message : "unknown"
    });
  }
  invalidateRestaurantOrderCache(restaurantId);
  invalidateRestaurantDashboardCache(restaurantId);
  return updated;
}

async function tryRollbackOrderInventory(restaurantId: string, orderId: string, actorUserId?: string | null) {
  try {
    await rollbackInventoryForOrder(restaurantId, orderId, actorUserId);
  } catch (error) {
    console.error("inventory_order_rollback_failed", {
      restaurantId,
      orderId,
      error: error instanceof Error ? error.message : "unknown"
    });
  }
}

async function cancelOrderInternal(
  supabase: OrderSupabaseClient,
  restaurantId: string,
  orderId: string,
  actorUserId?: string | null
) {
  const order = await getMutableOrder(supabase, restaurantId, orderId);
  const cancelLogKey = paymentTransitionKey({ orderId, stage: "cancelled" });
  assertOrderNotPaid(order);

  if (order.status === "cancelled") {
    if (order.payment_method) {
      await ensurePaymentLogEvent(supabase, {
        orderId,
        method: order.payment_method,
        status: "cancelled",
        amount: order.total,
        source: "merchant_cancel",
        transitionKey: cancelLogKey
      });
    }
    await tryRollbackOrderInventory(restaurantId, orderId, actorUserId);
    await closeBillIfNoActiveOrders(supabase, restaurantId, order.bill_id);
    return order;
  }

  const { data: updated, error: updateError } = await supabase
    .from("orders")
    .update({
      status: "cancelled",
      payment_status:
        order.payment_method || order.payment_status === "waiting_payment" || order.payment_status === "waiting_confirm"
          ? "failed"
          : order.payment_status ?? "unpaid",
      delivery_status: order.fulfillment_type === "DELIVERY" ? "rejected" : order.delivery_status ?? "none"
    })
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .in("status", ["pending", "ordering", "completed", "waiting_payment"])
    .not("payment_status", "in", "(paid,waiting_confirm)")
    .is("paid_at", null)
    .select()
    .maybeSingle();

  throwIfSupabaseError(updateError);
  if (!updated) {
    const currentOrder = await getMutableOrder(supabase, restaurantId, orderId);
    if (currentOrder.status === "cancelled") {
      await closeBillIfNoActiveOrders(supabase, restaurantId, currentOrder.bill_id);
      return currentOrder;
    }
    assertOrderNotPaid(currentOrder);
    throw new AppError("Trạng thái đơn đã thay đổi. Không thể huỷ an toàn, vui lòng tải lại.", 409);
  }
  if (order.payment_method) {
    await ensurePaymentLogEvent(supabase, {
      orderId,
      method: order.payment_method,
      status: "cancelled",
      amount: order.total,
      source: "merchant_cancel",
      transitionKey: cancelLogKey
    });
  }
  await tryRollbackOrderInventory(restaurantId, orderId, actorUserId);
  await closeBillIfNoActiveOrders(supabase, restaurantId, order.bill_id);
  invalidateRestaurantOrderCache(restaurantId);
  invalidateRestaurantDashboardCache(restaurantId);
  return updated;
}

async function assertNoProtectedPaymentLog(supabase: OrderSupabaseClient, order: MutableOrderRow) {
  let query = supabase
    .from("payment_logs")
    .select("id,status")
    .eq("order_id", order.id)
    .in("status", ["waiting_confirm", "confirmed"])
    .limit(1);

  if (order.bill_id) {
    query = supabase
      .from("payment_logs")
      .select("id,status")
      .or(`order_id.eq.${order.id},bill_id.eq.${order.bill_id}`)
      .in("status", ["waiting_confirm", "confirmed"])
      .limit(1);
  }

  const { data, error } = await query;
  throwIfSupabaseError(error);
  if ((data ?? []).length > 0) {
    throw new AppError("Đơn có log thanh toán đang/đã xác nhận. Chỉ được huỷ mềm, không xoá test.", 409);
  }
}

async function deleteTestOrderInternal(supabase: OrderSupabaseClient, restaurantId: string, orderId: string) {
  const { data: atomicDelete, error: atomicDeleteError } = await (supabase as any).rpc("delete_test_order_atomic", {
    p_restaurant_id: restaurantId,
    p_order_id: orderId
  });

  if (!atomicDeleteError) {
    invalidateRestaurantOrderCache(restaurantId);
    invalidateRestaurantDashboardCache(restaurantId);
    return atomicDelete;
  }

  const functionMissing =
    atomicDeleteError.code === "42883" ||
    atomicDeleteError.code === "PGRST202" ||
    String(atomicDeleteError.message ?? "").includes("delete_test_order_atomic");

  if (!functionMissing) {
    throw new AppError(atomicDeleteError.message || "Không thể xoá test đơn hàng an toàn.", 409);
  }

  const order = await getMutableOrder(supabase, restaurantId, orderId);
  const bill = firstOrNull(order.bill);

  assertOrderNotPaid(order);

  if (!hardDeleteTestStatuses.includes(order.status)) {
    throw new AppError("Chỉ xoá test các đơn chưa hoàn tất thanh toán.", 400);
  }
  if (order.status === "waiting_confirm" || order.payment_status === "waiting_confirm" || bill?.status === "waiting_confirm") {
    throw new AppError("Đơn đang chờ xác nhận chuyển khoản. Hãy huỷ mềm để giữ dấu vết thanh toán.", 409);
  }
  if (order.delivery_status === "out_for_delivery" || order.delivery_status === "delivered") {
    throw new AppError("Đơn giao hàng đã rời quán/đã giao không được xoá test.", 409);
  }

  await assertNoProtectedPaymentLog(supabase, order);

  const { data: deleted, error: deleteError } = await supabase
    .from("orders")
    .delete()
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .in("status", hardDeleteTestStatuses)
    .not("payment_status", "in", "(paid,waiting_confirm)")
    .is("paid_at", null)
    .not("delivery_status", "in", "(out_for_delivery,delivered)")
    .select("id")
    .maybeSingle();

  throwIfSupabaseError(deleteError);
  if (!deleted) {
    throw new AppError("Trạng thái đơn đã thay đổi. Không thể xoá test an toàn, vui lòng tải lại.", 409);
  }
  const billClosed = await closeBillIfNoActiveOrders(supabase, restaurantId, order.bill_id);
  invalidateRestaurantOrderCache(restaurantId);
  invalidateRestaurantDashboardCache(restaurantId);

  return {
    orderId,
    deleted: true,
    billId: order.bill_id ?? null,
    billClosed
  };
}

export async function cancelOrder(restaurantId: string, orderId: string, actorUserId?: string | null) {
  const supabase = createAdminSupabaseClient();
  return cancelOrderInternal(supabase, restaurantId, orderId, actorUserId);
}

export async function deleteTestOrder(restaurantId: string, orderId: string) {
  const supabase = createAdminSupabaseClient();
  return deleteTestOrderInternal(supabase, restaurantId, orderId);
}

export async function cleanupTestOrders(restaurantId: string, input: OrderCleanupInput) {
  const supabase = createAdminSupabaseClient();
  const mode = input.mode;
  const statuses = input.statuses?.length ? input.statuses : defaultCleanupStatuses;
  const cutoff = new Date(Date.now() - Math.max(0, input.olderThanMinutes ?? 0) * 60_000).toISOString();
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 200);

  const { data, error } = await supabase
    .from("orders")
    .select("id,status")
    .eq("restaurant_id", restaurantId)
    .in("status", statuses)
    .neq("payment_status", "paid")
    .is("paid_at", null)
    .lte("created_at", cutoff)
    .not("delivery_status", "in", "(out_for_delivery,delivered)")
    .order("created_at", { ascending: false })
    .limit(limit);

  throwIfSupabaseError(error);
  const candidates = data ?? [];
  const results: Array<{ orderId: string; status: "cancelled" | "deleted" | "skipped"; reason?: string }> = [];

  for (const candidate of candidates) {
    try {
      if (mode === "delete_test") {
        await deleteTestOrderInternal(supabase, restaurantId, candidate.id);
        results.push({ orderId: candidate.id, status: "deleted" });
      } else {
        await cancelOrderInternal(supabase, restaurantId, candidate.id);
        results.push({ orderId: candidate.id, status: "cancelled" });
      }
    } catch (error) {
      results.push({
        orderId: candidate.id,
        status: "skipped",
        reason: error instanceof Error ? error.message : "Không xử lý được đơn"
      });
    }
  }

  return {
    mode,
    scanned: candidates.length,
    cancelled: results.filter((item) => item.status === "cancelled").length,
    deleted: results.filter((item) => item.status === "deleted").length,
    skipped: results.filter((item) => item.status === "skipped").length,
    results
  };
}
