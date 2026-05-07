import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPublicOrderingSettingsBySlug, quoteDeliveryForRestaurant } from "@/services/delivery-service";
import { getPaymentInstructions } from "@/services/payment-service";
import { resolvePromotionForOrder } from "@/services/promotion-service";
import { invalidateRestaurantDashboardCache } from "@/services/restaurant-service";
import { assertFeatureEntitlement } from "@/services/subscription-service";
import type { DeliveryStatus, FulfillmentType, OrderDto, PaymentMethod, PaymentStatus, TableBillStatus } from "@/types/domain";
import type { Json } from "@/types/supabase";

export type CreateOrderInput = {
  restaurantSlug: string;
  tableId: string;
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

type RawOrder = {
  id: string;
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
  delivery_status?: DeliveryStatus | null;
  delivery_route_geometry?: Json | null;
  delivery_route_duration_minutes?: number | null;
  delivery_tracking_updated_at?: string | null;
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

type PublicOrderAccessRow = {
  id: string;
  customer_session_id: string | null;
  bill:
    | { customer_session_id: string | null; status: TableBillStatus }
    | Array<{ customer_session_id: string | null; status: TableBillStatus }>
    | null;
};

const orderSelect =
  "id,status,subtotal,discount_amount,promotion_id,promotion_code,total,fulfillment_type,bill_id,payment_method,payment_status,paid_at,customer_session_id,customer_name,customer_phone,delivery_address,delivery_lat,delivery_lng,delivery_distance_km,delivery_fee,delivery_status,delivery_route_geometry,delivery_route_duration_minutes,delivery_tracking_updated_at,created_at,updated_at,accepted_at,served_at,service_due_at,restaurant:restaurants(name,address,store_lat,store_lng,bank_code,bank_account,bank_account_name),table:tables(id,name),bill:table_bills(id,status,total,payment_method,created_at,updated_at,paid_at,closed_at),items:order_items(quantity,price,note,menuItem:menu_items(id,name))";

const kitchenOrderSelect =
  "id,status,subtotal,discount_amount,promotion_id,promotion_code,total,fulfillment_type,payment_method,payment_status,paid_at,customer_session_id,customer_name,customer_phone,delivery_address,delivery_lat,delivery_lng,delivery_distance_km,delivery_fee,delivery_status,delivery_route_geometry,delivery_route_duration_minutes,delivery_tracking_updated_at,created_at,updated_at,accepted_at,served_at,service_due_at,table:tables(id,name),items:order_items(quantity,price,note,menuItem:menu_items(id,name))";

const activePublicStatuses: OrderDto["status"][] = ["pending", "ordering", "completed", "waiting_payment", "waiting_confirm"];
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

  return {
    id: order.id,
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
    deliveryStatus: order.delivery_status ?? "none",
    deliveryRouteGeometry: routeGeometryOrNull(order.delivery_route_geometry),
    deliveryRouteDurationMinutes: order.delivery_route_duration_minutes ?? null,
    deliveryTrackingUpdatedAt: order.delivery_tracking_updated_at ?? null,
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

function mapKitchenOrder(order: Omit<RawOrder, "restaurant" | "bill">): OrderDto {
  return mapOrder({
    ...order,
    restaurant: null,
    bill: null
  });
}

async function getOrCreateOpenTableBill({
  restaurantId,
  tableId,
  customerSessionId
}: {
  restaurantId: string;
  tableId: string;
  customerSessionId?: string;
}) {
  const supabase = createAdminSupabaseClient();
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

async function getOrderDto(orderId: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("orders")
    .select(orderSelect)
    .eq("id", orderId)
    .single();

  throwIfSupabaseError(error);
  if (!data) throw new AppError("Không tìm thấy đơn hàng", 404);
  return mapOrder(data as unknown as RawOrder);
}

async function assertCustomerOrderAccess(orderId: string, access: CustomerOrderAccessInput) {
  const supabase = createAdminSupabaseClient();
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

async function assertRemoteOrderAccess(orderId: string, access: RemoteOrderAccessInput) {
  const supabase = createAdminSupabaseClient();
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
  const supabase = createAdminSupabaseClient();
  const normalizedItems = normalizeOrderItems(input.items);
  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("id,slug")
    .eq("slug", input.restaurantSlug)
    .single();

  throwIfSupabaseError(restaurantError);
  if (!restaurant) throw new AppError("Không tìm thấy quán", 404);
  await assertFeatureEntitlement(restaurant.id, "order_realtime");

  const { data: table, error: tableError } = await supabase
    .from("tables")
    .select("id")
    .eq("id", input.tableId)
    .eq("restaurant_id", restaurant.id)
    .single();

  throwIfSupabaseError(tableError);
  if (!table) throw new AppError("Không tìm thấy bàn", 404);

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
      const order = await getOrderDto(existing.id);
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
    customerSessionId: input.customerSessionId
  });

  const { data: insertedOrder, error: orderError } = await supabase
    .from("orders")
    .insert({
      restaurant_id: restaurant.id,
      table_id: table.id,
      bill_id: bill.id,
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
    })
    .select("id")
    .single();

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
      const order = await getOrderDto(existing.id);
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

  const order = await getOrderDto(insertedOrder.id);
  invalidateRestaurantOrderCache(restaurant.id);
  invalidateRestaurantDashboardCache(restaurant.id);
  return {
    order,
    payment: getPaymentInstructions(order)
  };
}

export async function createRemoteOrder(input: CreateRemoteOrderInput) {
  const supabase = createAdminSupabaseClient();
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
      const order = await getOrderDto(existing.id);
      return {
        order,
        payment: getPaymentInstructions(order),
        deliveryQuote: null
      };
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
  const subtotal = itemSubtotal + deliveryFee;
  const { promotion, discountAmount } = await resolvePromotionForOrder({
    restaurantId: settings.id,
    code: input.promotionCode,
    subtotal: itemSubtotal,
    channel: "WEBSITE"
  });
  const total = subtotal - discountAmount;
  const initialStatus: OrderDto["status"] = requiresPrepaidQr ? "waiting_payment" : "pending";
  const initialPaymentMethod: PaymentMethod | null = requiresPrepaidQr ? "QR" : null;
  const initialPaymentStatus: PaymentStatus = requiresPrepaidQr ? "waiting_payment" : "unpaid";
  const destination = deliveryQuote?.destination ?? null;
  const shouldStoreRoute = input.fulfillmentType === "DELIVERY" && settings.delivery_tracking_enabled;
  const { data: insertedOrder, error: orderError } = await supabase
    .from("orders")
    .insert({
      restaurant_id: settings.id,
      table_id: null,
      bill_id: null,
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
      delivery_status: input.fulfillmentType === "DELIVERY" ? "requested" : "none",
      delivery_route_geometry: shouldStoreRoute ? (deliveryQuote?.routeGeometry ?? null) : null,
      delivery_route_duration_minutes: shouldStoreRoute ? (deliveryQuote?.routeDurationMinutes ?? deliveryQuote?.etaMinutes ?? null) : null,
      delivery_tracking_updated_at: shouldStoreRoute ? new Date().toISOString() : null,
      idempotency_key: input.idempotencyKey || null
    })
    .select("id")
    .single();

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
      const order = await getOrderDto(existing.id);
      return {
        order,
        payment: getPaymentInstructions(order),
        deliveryQuote
      };
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
    const { error: logError } = await supabase.from("payment_logs").insert({
      order_id: insertedOrder.id,
      method: "QR",
      status: "pending",
      amount: total,
      raw_data: { source: "remote_order_prepaid_required" }
    });
    throwIfSupabaseError(logError);
  }

  const order = await getOrderDto(insertedOrder.id);
  invalidateRestaurantOrderCache(settings.id);
  invalidateRestaurantDashboardCache(settings.id);
  return {
    order,
    payment: getPaymentInstructions(order),
    deliveryQuote
  };
}

export async function getPublicOrder(orderId: string, access?: CustomerOrderAccessInput) {
  if (access) {
    await assertCustomerOrderAccess(orderId, access);
  }

  const order = await getOrderDto(orderId);
  return {
    order,
    payment: getPaymentInstructions(order)
  };
}

export async function getRemotePublicOrder(orderId: string, access: RemoteOrderAccessInput) {
  await assertRemoteOrderAccess(orderId, access);

  const order = await getOrderDto(orderId);
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
  const supabase = createAdminSupabaseClient();
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
  const [sessionOrders, tableOpenOrders] = await Promise.all([
    input.customerSessionId
      ? supabase
          .from("orders")
          .select(orderSelect)
          .eq("restaurant_id", restaurant.id)
          .eq("table_id", table.id)
          .eq("customer_session_id", input.customerSessionId)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("orders")
      .select(orderSelect)
      .eq("restaurant_id", restaurant.id)
      .eq("table_id", table.id)
      .in("status", activePublicStatuses)
      .order("created_at", { ascending: false })
      .limit(30)
  ]);

  throwIfSupabaseError(sessionOrders.error);
  throwIfSupabaseError(tableOpenOrders.error);

  const byId = new Map<string, OrderDto>();
  for (const row of [...(sessionOrders.data ?? []), ...(tableOpenOrders.data ?? [])]) {
    const order = mapOrder(row as unknown as RawOrder);
    byId.set(order.id, order);
  }

  const orders = [...byId.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const tableOpenIds = new Set(((tableOpenOrders.data ?? []) as Array<{ id: string }>).map((order) => order.id));
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
  const supabase = createAdminSupabaseClient();
  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("id")
    .eq("slug", input.restaurantSlug)
    .single();

  throwIfSupabaseError(restaurantError);
  if (!restaurant) throw new AppError("Không tìm thấy quán", 404);

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("orders")
    .select(orderSelect)
    .eq("restaurant_id", restaurant.id)
    .is("table_id", null)
    .eq("customer_session_id", input.customerSessionId)
    .in("fulfillment_type", ["PICKUP", "DELIVERY"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);

  throwIfSupabaseError(error);

  const orders = ((data ?? []) as unknown as RawOrder[]).map((row) => mapOrder(row));
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
  let query = supabase
    .from("orders")
    .select(orderSelect)
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? (options.includeHistory ? 250 : 100));

  if (!options.includeHistory) {
    query = query.not("status", "in", "(paid,cancelled)");
  }

  const { data, error } = await query;

  throwIfSupabaseError(error);
  return (data ?? []).map((order) => mapOrder(order as unknown as RawOrder));
}

export async function listKitchenOrdersForRestaurant(restaurantId: string) {
  const cached = readKitchenOrdersCache(restaurantId);
  if (cached) return cached;

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("orders")
    .select(kitchenOrderSelect)
    .eq("restaurant_id", restaurantId)
    .in("status", ["pending", "ordering"])
    .order("created_at", { ascending: true })
    .limit(120);

  throwIfSupabaseError(error);
  const orders = (data ?? []).map((order) => mapKitchenOrder(order as unknown as Omit<RawOrder, "restaurant" | "bill">));
  writeKitchenOrdersCache(restaurantId, orders);
  return orders;
}

export async function acceptOrder(restaurantId: string, orderId: string, minutes = 15) {
  const supabase = createAdminSupabaseClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("id,status")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .single();

  throwIfSupabaseError(error);
  if (!order) throw new AppError("Không tìm thấy đơn hàng", 404);
  if (order.status === "cancelled") throw new AppError("Không thể xác nhận đơn đã huỷ", 400);
  if (order.status !== "pending" && order.status !== "ordering") {
    throw new AppError("Chỉ đơn mới hoặc đang ra món mới có thể xác nhận", 400);
  }

  const now = new Date();
  const serviceDueAt = new Date(now.getTime() + minutes * 60_000).toISOString();
  const { data: updated, error: updateError } = await supabase
    .from("orders")
    .update({
      status: "ordering",
      accepted_at: now.toISOString(),
      service_due_at: serviceDueAt
    })
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .select()
    .single();

  throwIfSupabaseError(updateError);
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
  if (!["pending", "ordering", "completed"].includes(order.status)) {
    throw new AppError("Chỉ đơn đang xử lý mới có thể đánh dấu đã phục vụ", 400);
  }

  const { data: updated, error: updateError } = await supabase
    .from("orders")
    .update({ status: "completed", served_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .select()
    .single();

  throwIfSupabaseError(updateError);
  invalidateRestaurantOrderCache(restaurantId);
  invalidateRestaurantDashboardCache(restaurantId);
  return updated;
}

export async function updateOrderDeliveryStatus(
  restaurantId: string,
  orderId: string,
  deliveryStatus: Exclude<DeliveryStatus, "none" | "requested">
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
    .select()
    .single();

  throwIfSupabaseError(updateError);
  invalidateRestaurantOrderCache(restaurantId);
  invalidateRestaurantDashboardCache(restaurantId);
  return updated;
}

export async function cancelOrder(restaurantId: string, orderId: string) {
  const supabase = await createServerSupabaseClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("id,status,total,payment_method,payment_status")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .single();

  throwIfSupabaseError(error);
  if (!order) throw new AppError("Không tìm thấy đơn hàng", 404);
  if (order.status === "paid" || order.payment_status === "paid") {
    throw new AppError("Không thể huỷ đơn đã thanh toán", 400);
  }
  if (order.status === "cancelled") return order;

  if (order.payment_method) {
    const { error: logError } = await supabase.from("payment_logs").insert({
      order_id: orderId,
      method: order.payment_method,
      status: "cancelled",
      amount: order.total,
      raw_data: { source: "merchant_cancel" }
    });
    throwIfSupabaseError(logError);
  }

  const { data: updated, error: updateError } = await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .select()
    .single();

  throwIfSupabaseError(updateError);
  invalidateRestaurantOrderCache(restaurantId);
  invalidateRestaurantDashboardCache(restaurantId);
  return updated;
}
