import { AppError } from "@/lib/response";
import { canAccessDineInOrder } from "@/lib/customer/dine-in-order-access";
import { resolveMerchantPaymentConfirmationTransition } from "@/lib/orders/order-state-machine";
import { inferManualConfirmationMethod } from "@/lib/payments/manual-confirmation";
import { paymentMethodToEntitlementFeature } from "@/lib/payments/payment-entitlement";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { buildVietQrUrl } from "@/lib/vietqr";
import { invalidateAdminReportCache } from "@/services/dashboard-report-service";
import { invalidateRestaurantOrderCache } from "@/services/order-service";
import {
  buildFinancialStageIdempotencyKey,
  checkoutBillAtomic,
  transitionPaymentAtomic
} from "@/services/phase1-financial-rpc-service";
import { completeReservationForBill } from "@/services/reservation-service";
import { invalidateRestaurantDashboardCache } from "@/services/restaurant-service";
import { assertFeatureEntitlement } from "@/services/subscription-service";
import { getPublicTable } from "@/services/table-service";
import { assertPublicTenantActive } from "@/services/tenant-status-guard";
import { buildPaymentEventId, buildPaymentSnapshot, enqueueTelegramNotification } from "@/services/telegram-event-queue";
import { writeOperationalEvent } from "@/services/operational-observability-service";
import type { FulfillmentType, OrderDto, PaymentMethod, PaymentStatus, TableBillStatus } from "@/types/domain";

type PaymentInstructionOrder = Pick<OrderDto, "id" | "total" | "paymentMethod" | "paymentConfig" | "bill">;
type ServiceSupabaseClient = ReturnType<typeof createAdminSupabaseClient>;

type PaymentOrderRow = {
  id: string;
  restaurant_id: string;
  branch_id?: string | null;
  status: OrderDto["status"];
  total: number;
  payment_method: PaymentMethod | null;
  payment_status?: PaymentStatus | null;
  state_version: number;
  fulfillment_type?: FulfillmentType;
  bill_id?: string | null;
  customer_name?: string | null;
  customer_session_id?: string | null;
  bill:
    | {
        id: string;
        status: TableBillStatus;
        total: number;
        payment_method: PaymentMethod | null;
        state_version: number;
        paid_at?: string | null;
        customer_session_id?: string | null;
      }
    | Array<{
        id: string;
        status: TableBillStatus;
        total: number;
        payment_method: PaymentMethod | null;
        state_version: number;
        paid_at?: string | null;
        customer_session_id?: string | null;
      }>
    | null;
};

type CustomerOrderAccessInput = {
  restaurantSlug: string;
  tableId: string;
  tableAccessToken?: string;
  customerSessionId?: string;
};

type RemoteOrderAccessInput = {
  restaurantSlug: string;
  customerSessionId: string;
};

function firstOrNull<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function isPaidOrder(order: Pick<PaymentOrderRow, "status" | "payment_status">) {
  return order.status === "paid" || order.payment_status === "paid";
}

function invalidatePaymentDerivedCaches(restaurantId: string) {
  invalidateRestaurantOrderCache(restaurantId);
  invalidateRestaurantDashboardCache(restaurantId);
  invalidateAdminReportCache(restaurantId);
}

async function getRestaurantIdBySlug(slug: string) {
  const supabase = createAdminSupabaseClient();
  const { data: restaurant, error } = await supabase.from("restaurants").select("id,platform_status,deleted_at").eq("slug", slug).single();
  throwIfSupabaseError(error);
  if (!restaurant) throw new AppError("Không tìm thấy quán", 404);
  assertPublicTenantActive(restaurant);
  return restaurant.id;
}

async function getRestaurantAccessBySlug(slug: string) {
  const supabase = createAdminSupabaseClient();
  const { data: restaurant, error } = await supabase
    .from("restaurants")
    .select("id,allow_legacy_qr,platform_status,deleted_at")
    .eq("slug", slug)
    .single();
  throwIfSupabaseError(error);
  if (!restaurant) throw new AppError("Không tìm thấy quán", 404);
  assertPublicTenantActive(restaurant);
  return restaurant;
}

async function getCustomerPaymentOrder(orderId: string, access: CustomerOrderAccessInput) {
  const supabase = createAdminSupabaseClient();
  const restaurant = await getRestaurantAccessBySlug(access.restaurantSlug);
  const { data: order, error } = await supabase
    .from("orders")
    .select("id,restaurant_id,branch_id,status,total,payment_method,payment_status,state_version,fulfillment_type,bill_id,customer_name,customer_session_id,bill:table_bills(id,status,total,payment_method,state_version,paid_at,customer_session_id)")
    .eq("id", orderId)
    .eq("restaurant_id", restaurant.id)
    .eq("table_id", access.tableId)
    .single();

  throwIfSupabaseError(error);
  if (!order) throw new AppError("Không tìm thấy đơn hàng cho bàn này", 404);
  const typedOrder = order as unknown as PaymentOrderRow;
  const bill = firstOrNull(typedOrder.bill);
  const table = await getPublicTable(restaurant.id, access.tableId, access.tableAccessToken, {
    allowLegacyQr: restaurant.allow_legacy_qr
  });

  // Shared-table bills intentionally allow any diner with a valid table QR to pay.
  // Session match is required only when there is a bound identity and no table QR (see canAccessDineInOrder options for stricter modes).
  if (
    !canAccessDineInOrder({
      customerSessionId: access.customerSessionId,
      orderCustomerSessionId: typedOrder.customer_session_id,
      orderStatus: typedOrder.status,
      billCustomerSessionId: bill?.customer_session_id,
      billStatus: bill?.status,
      hasValidTableQr: Boolean(table)
    })
  ) {
    writeOperationalEvent({
      area: "payment",
      event: "customer_payment_access_mismatch",
      status: "warn",
      restaurantId: restaurant.id,
      metadata: {
        orderId,
        tableId: access.tableId,
        hasCustomerSession: Boolean(access.customerSessionId),
        orderHasCustomerSession: Boolean(typedOrder.customer_session_id),
        billId: bill?.id ?? null,
        billStatus: bill?.status ?? null,
        hasValidTableQr: Boolean(table)
      }
    });
    throw new AppError("Phiên gọi món không khớp với đơn hàng này", 403);
  }

  return typedOrder;
}

async function getRemotePaymentOrder(orderId: string, access: RemoteOrderAccessInput) {
  const supabase = createAdminSupabaseClient();
  const restaurantId = await getRestaurantIdBySlug(access.restaurantSlug);
  const { data: order, error } = await supabase
    .from("orders")
    .select("id,restaurant_id,branch_id,status,total,payment_method,payment_status,state_version,fulfillment_type,bill_id,customer_name,bill:table_bills(id,status,total,payment_method,state_version,paid_at,customer_session_id)")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .is("table_id", null)
    .eq("customer_session_id", access.customerSessionId)
    .single();

  throwIfSupabaseError(error);
  if (!order) throw new AppError("Không tìm thấy đơn online của bạn", 404);
  return order as unknown as PaymentOrderRow;
}

async function getMerchantPaymentOrder(supabase: ServiceSupabaseClient, restaurantId: string, orderId: string) {
  const { data: order, error } = await supabase
    .from("orders")
    .select("id,restaurant_id,branch_id,status,total,payment_method,payment_status,state_version,fulfillment_type,bill_id,customer_name,bill:table_bills(id,status,total,payment_method,state_version,paid_at)")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .single();

  throwIfSupabaseError(error);
  if (!order) throw new AppError("Không tìm thấy đơn hàng", 404);
  return order as unknown as PaymentOrderRow;
}

export function getPaymentInstructions(order: PaymentInstructionOrder) {
  const paymentMethod = order.bill?.paymentMethod ?? order.paymentMethod;
  if (!paymentMethod) {
    return null;
  }

  const amount = order.bill?.total ?? order.total;
  const paymentId = order.bill?.id ?? order.id;
  const prefix = order.bill ? "BILL" : "ORDER";

  if (paymentMethod === "CASH") {
    return {
      method: "CASH" as const,
      amount,
      message: "Vui lòng thanh toán tiền mặt tại quầy hoặc cho nhân viên."
    };
  }

  const restaurantConfig =
    order.paymentConfig?.bankCode && order.paymentConfig.bankAccount
      ? {
          bank: order.paymentConfig.bankCode,
          account: order.paymentConfig.bankAccount,
          accountName: order.paymentConfig.bankAccountName ?? undefined
        }
      : undefined;

  return {
    method: "QR" as const,
    ...buildVietQrUrl({ amount, orderId: paymentId, prefix, config: restaurantConfig })
  };
}

async function assertBillCanCheckout(billId: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.from("orders").select("id,status").eq("bill_id", billId).neq("status", "cancelled");
  throwIfSupabaseError(error);

  if ((data ?? []).length === 0) {
    throw new AppError("Hóa đơn bàn chưa có món hợp lệ", 400);
  }

  if ((data ?? []).some((order) => order.status === "pending")) {
    throw new AppError("Còn món đang chờ quán xác nhận. Vui lòng thanh toán sau khi quán nhận đơn.", 400);
  }
}

export async function startCustomerPayment(orderId: string, paymentMethod: PaymentMethod, access: CustomerOrderAccessInput) {
  const supabase = createAdminSupabaseClient();
  const typedOrder = await getCustomerPaymentOrder(orderId, access);
  await assertFeatureEntitlement(typedOrder.restaurant_id, "order_realtime");
  await assertFeatureEntitlement(typedOrder.restaurant_id, paymentMethod === "QR" ? "vietqr_payments" : "cash_payments");
  const bill = firstOrNull(typedOrder.bill);

  if (bill) {
    if (bill.status === "cancelled") throw new AppError("Hóa đơn bàn đã bị huỷ", 400);
    if (bill.status === "paid") {
      return getCustomerPaymentOrder(orderId, access);
    }
    if (bill.status === "waiting_payment" || bill.status === "waiting_confirm") {
      if (!bill.payment_method) {
        throw new AppError("Hóa đơn đang chờ thanh toán nhưng thiếu phương thức thanh toán", 409);
      }
      return getCustomerPaymentOrder(orderId, access);
    }

    await assertBillCanCheckout(bill.id);

    try {
      await checkoutBillAtomic(supabase, {
        restaurantId: typedOrder.restaurant_id,
        billId: bill.id,
        expectedStateVersion: bill.state_version,
        idempotencyKey: buildFinancialStageIdempotencyKey({
          stage: "bill-checkout",
          entityId: bill.id,
          orderStateVersion: null,
          billStateVersion: bill.state_version
        }),
        paymentMethod,
        actorUserId: null
      });
    } catch (error) {
      const currentOrder = await getCustomerPaymentOrder(orderId, access);
      const currentBill = firstOrNull(currentOrder.bill);
      if (currentBill && (currentBill.status === "waiting_payment" || currentBill.status === "waiting_confirm" || currentBill.status === "paid")) {
        return currentOrder;
      }
      throw error;
    }

    if (paymentMethod === "CASH") {
      await enqueuePaymentWaitingConfirmNotification({
        restaurantId: typedOrder.restaurant_id,
        branchId: typedOrder.branch_id ?? null,
        orderId,
        billId: bill.id,
        amount: bill.total,
        method: "CASH",
        customerName: typedOrder.customer_name ?? null
      });
    }

    invalidatePaymentDerivedCaches(typedOrder.restaurant_id);
    return getCustomerPaymentOrder(orderId, access);
  }

  if (typedOrder.status === "cancelled") throw new AppError("Đơn hàng đã bị huỷ", 400);
  if (typedOrder.payment_status === "refunded") throw new AppError("Đơn hàng đã hoàn tiền, không thể thanh toán lại", 400);
  if (isPaidOrder(typedOrder) || typedOrder.status === "waiting_payment" || typedOrder.status === "waiting_confirm") {
    if (!typedOrder.payment_method && !isPaidOrder(typedOrder)) {
      throw new AppError("Đơn hàng đang chờ thanh toán nhưng thiếu phương thức thanh toán", 409);
    }
    return getCustomerPaymentOrder(orderId, access);
  }
  if (!["completed", "ordering"].includes(typedOrder.status)) {
    throw new AppError("Quán cần xác nhận hoặc phục vụ món trước khi thanh toán", 400);
  }

  const toStatus = paymentMethod === "QR" ? "waiting_payment" : "waiting_confirm";
  try {
    await transitionPaymentAtomic(supabase, {
      restaurantId: typedOrder.restaurant_id,
      orderId,
      expectedOrderStateVersion: typedOrder.state_version,
      expectedBillStateVersion: null,
      toStatus,
      nextOrderStatus: typedOrder.status,
      paymentMethod,
      amount: typedOrder.total,
      idempotencyKey: buildFinancialStageIdempotencyKey({
        stage: "customer-checkout",
        entityId: orderId,
        orderStateVersion: typedOrder.state_version
      }),
      actorUserId: null,
      rawData: { source: "customer_checkout" }
    });
  } catch (error) {
    const currentOrder = await getCustomerPaymentOrder(orderId, access);
    if (isPaidOrder(currentOrder) || currentOrder.status === "waiting_payment" || currentOrder.status === "waiting_confirm") {
      return currentOrder;
    }
    throw error;
  }

  if (paymentMethod === "CASH") {
    await enqueuePaymentWaitingConfirmNotification({
      restaurantId: typedOrder.restaurant_id,
      branchId: typedOrder.branch_id ?? null,
      orderId,
      billId: typedOrder.bill_id ?? null,
      amount: typedOrder.total,
      method: "CASH",
      customerName: typedOrder.customer_name ?? null
    });
  }
  invalidatePaymentDerivedCaches(typedOrder.restaurant_id);
  return getCustomerPaymentOrder(orderId, access);
}

export async function markCustomerPaid(orderId: string, access: CustomerOrderAccessInput) {
  const supabase = createAdminSupabaseClient();
  const typedOrder = await getCustomerPaymentOrder(orderId, access);
  await assertFeatureEntitlement(typedOrder.restaurant_id, "order_realtime");
  await assertFeatureEntitlement(typedOrder.restaurant_id, "vietqr_payments");
  const bill = firstOrNull(typedOrder.bill);

  if (bill) {
    if (bill.payment_method !== "QR") {
      throw new AppError("Thao tác này chỉ dùng cho thanh toán QR", 400);
    }
    if (bill.status === "cancelled") throw new AppError("Hóa đơn bàn đã bị huỷ", 400);
    if (bill.status === "paid") {
      // Already paid — do not re-notify merchant (prevents Telegram spam on retry).
      return getCustomerPaymentOrder(orderId, access);
    }
    if (bill.status === "waiting_confirm") {
      // Already waiting confirm — idempotent; skip duplicate notify.
      return getCustomerPaymentOrder(orderId, access);
    }
    if (bill.status !== "waiting_payment") {
      return getCustomerPaymentOrder(orderId, access);
    }

    try {
      await transitionPaymentAtomic(supabase, {
        restaurantId: typedOrder.restaurant_id,
        orderId,
        billId: bill.id,
        expectedOrderStateVersion: typedOrder.state_version,
        expectedBillStateVersion: bill.state_version,
        toStatus: "waiting_confirm",
        paymentMethod: "QR",
        amount: bill.total,
        idempotencyKey: buildFinancialStageIdempotencyKey({
          stage: "customer-paid",
          entityId: orderId,
          orderStateVersion: typedOrder.state_version,
          billStateVersion: bill.state_version
        }),
        actorUserId: null,
        rawData: { source: "customer_bill_button" }
      });
    } catch (error) {
      const currentOrder = await getCustomerPaymentOrder(orderId, access);
      const currentBill = firstOrNull(currentOrder.bill);
      if (currentBill?.status === "waiting_confirm" || currentBill?.status === "paid") {
        return currentOrder;
      }
      throw error;
    }

    await enqueuePaymentWaitingConfirmNotification({
      restaurantId: typedOrder.restaurant_id,
      branchId: typedOrder.branch_id ?? null,
      orderId,
      billId: bill.id,
      amount: bill.total,
      customerName: typedOrder.customer_name ?? null
    });

    invalidatePaymentDerivedCaches(typedOrder.restaurant_id);
    return getCustomerPaymentOrder(orderId, access);
  }

  if (typedOrder.payment_method !== "QR") {
    throw new AppError("Thao tác này chỉ dùng cho thanh toán QR", 400);
  }
  if (typedOrder.status === "cancelled") {
    throw new AppError("Đơn hàng đã bị huỷ", 400);
  }
  if (typedOrder.payment_status === "refunded") {
    throw new AppError("Đơn hàng đã hoàn tiền, không thể xác nhận lại", 400);
  }
  if (isPaidOrder(typedOrder) || typedOrder.status === "waiting_confirm" || typedOrder.payment_status === "waiting_confirm") {
    // Idempotent path: already submitted or paid — do not re-notify.
    return getCustomerPaymentOrder(orderId, access);
  }
  if (typedOrder.status !== "waiting_payment" && typedOrder.payment_status !== "waiting_payment") {
    return getCustomerPaymentOrder(orderId, access);
  }

  try {
    await transitionPaymentAtomic(supabase, {
      restaurantId: typedOrder.restaurant_id,
      orderId,
      expectedOrderStateVersion: typedOrder.state_version,
      expectedBillStateVersion: null,
      toStatus: "waiting_confirm",
      paymentMethod: "QR",
      amount: typedOrder.total,
      idempotencyKey: buildFinancialStageIdempotencyKey({
        stage: "customer-paid",
        entityId: orderId,
        orderStateVersion: typedOrder.state_version
      }),
      actorUserId: null,
      rawData: { source: "customer_button" }
    });
  } catch (error) {
    const currentOrder = await getCustomerPaymentOrder(orderId, access);
    if (isPaidOrder(currentOrder) || currentOrder.status === "waiting_confirm" || currentOrder.payment_status === "waiting_confirm") {
      return currentOrder;
    }
    throw error;
  }

  await enqueuePaymentWaitingConfirmNotification({
    restaurantId: typedOrder.restaurant_id,
    branchId: typedOrder.branch_id ?? null,
    orderId,
    billId: typedOrder.bill_id ?? null,
    amount: typedOrder.total,
    customerName: typedOrder.customer_name ?? null
  });
  invalidatePaymentDerivedCaches(typedOrder.restaurant_id);
  return getCustomerPaymentOrder(orderId, access);
}

export async function markRemoteCustomerPaid(orderId: string, access: RemoteOrderAccessInput) {
  const supabase = createAdminSupabaseClient();
  const typedOrder = await getRemotePaymentOrder(orderId, access);
  await assertFeatureEntitlement(typedOrder.restaurant_id, "online_ordering");
  await assertFeatureEntitlement(typedOrder.restaurant_id, "vietqr_payments");

  if (typedOrder.payment_method !== "QR") {
    throw new AppError("Đơn này chưa yêu cầu thanh toán VietQR", 400);
  }
  if (typedOrder.status === "cancelled") throw new AppError("Đơn hàng đã bị huỷ", 400);
  if (typedOrder.payment_status === "refunded") throw new AppError("Đơn hàng đã hoàn tiền, không thể xác nhận lại", 400);
  if (isPaidOrder(typedOrder) || typedOrder.status === "waiting_confirm" || typedOrder.payment_status === "waiting_confirm") {
    // Idempotent path: skip duplicate Telegram/ops notifications.
    return getRemotePaymentOrder(orderId, access);
  }
  if (typedOrder.payment_status !== "waiting_payment" && typedOrder.status !== "waiting_payment") {
    return getRemotePaymentOrder(orderId, access);
  }

  try {
    await transitionPaymentAtomic(supabase, {
      restaurantId: typedOrder.restaurant_id,
      orderId,
      expectedOrderStateVersion: typedOrder.state_version,
      expectedBillStateVersion: null,
      toStatus: "waiting_confirm",
      paymentMethod: "QR",
      amount: typedOrder.total,
      idempotencyKey: buildFinancialStageIdempotencyKey({
        stage: "remote-customer-paid",
        entityId: orderId,
        orderStateVersion: typedOrder.state_version
      }),
      actorUserId: null,
      rawData: { source: "remote_order_customer_paid_button" }
    });
  } catch (error) {
    const currentOrder = await getRemotePaymentOrder(orderId, access);
    if (isPaidOrder(currentOrder) || currentOrder.status === "waiting_confirm" || currentOrder.payment_status === "waiting_confirm") {
      return currentOrder;
    }
    throw error;
  }

  await enqueuePaymentWaitingConfirmNotification({
    restaurantId: typedOrder.restaurant_id,
    branchId: typedOrder.branch_id ?? null,
    orderId,
    billId: typedOrder.bill_id ?? null,
    amount: typedOrder.total,
    source: "online_ordering",
    customerName: typedOrder.customer_name ?? null
  });
  invalidatePaymentDerivedCaches(typedOrder.restaurant_id);
  return getRemotePaymentOrder(orderId, access);
}

async function enqueuePaymentWaitingConfirmNotification(input: {
  restaurantId: string;
  branchId?: string | null;
  orderId: string;
  billId?: string | null;
  amount: number;
  method?: PaymentMethod;
  source?: "customer_qr" | "online_ordering" | "dashboard" | "staff" | "telegram" | "system" | "devops";
  customerName?: string | null;
}) {
  const details = await getPaymentNotificationDetails(input.restaurantId, input.orderId).catch(() => null);
  await enqueueTelegramNotification({
    type: "payment.waiting_confirm",
    eventId: buildPaymentEventId("payment.waiting_confirm", input),
    restaurantId: input.restaurantId,
    branchId: input.branchId ?? null,
    source: input.source ?? "customer_qr",
    actor: { type: "customer" },
    payment: buildPaymentSnapshot({
      orderId: input.orderId,
      billId: input.billId ?? null,
      amount: input.amount,
      method: input.method ?? "QR",
      orderSubtotal: details?.subtotal ?? null,
      orderDiscountAmount: details?.discountAmount ?? null,
      orderDeliveryFee: details?.deliveryFee ?? null,
      orderServiceFee: details?.serviceFee ?? null,
      customerName: input.customerName ?? details?.customerName ?? null,
      customerPhone: details?.customerPhone ?? null,
      customerNote: details?.customerNote ?? null,
      fulfillmentType: details?.fulfillmentType ?? null,
      tableName: details?.tableName ?? null,
      deliveryAddress: details?.deliveryAddress ?? null,
      deliveryDistanceKm: details?.deliveryDistanceKm ?? null,
      orderItems: details?.items ?? [],
      status: "waiting_confirm"
    })
  });
}

async function enqueuePaymentReceivedNotification(input: {
  restaurantId: string;
  branchId?: string | null;
  orderId: string;
  billId?: string | null;
  amount: number;
  method: PaymentMethod;
  customerName?: string | null;
  actorUserId?: string | null;
}) {
  const details = await getPaymentNotificationDetails(input.restaurantId, input.orderId).catch(() => null);
  await enqueueTelegramNotification({
    type: "payment.received",
    eventId: buildPaymentEventId("payment.received", input),
    restaurantId: input.restaurantId,
    branchId: input.branchId ?? null,
    source: "dashboard",
    actor: { type: "merchant", userId: input.actorUserId ?? null },
    payment: buildPaymentSnapshot({
      orderId: input.orderId,
      billId: input.billId ?? null,
      amount: input.amount,
      method: input.method,
      orderSubtotal: details?.subtotal ?? null,
      orderDiscountAmount: details?.discountAmount ?? null,
      orderDeliveryFee: details?.deliveryFee ?? null,
      orderServiceFee: details?.serviceFee ?? null,
      customerName: input.customerName ?? details?.customerName ?? null,
      customerPhone: details?.customerPhone ?? null,
      customerNote: details?.customerNote ?? null,
      fulfillmentType: details?.fulfillmentType ?? null,
      tableName: details?.tableName ?? null,
      deliveryAddress: details?.deliveryAddress ?? null,
      deliveryDistanceKm: details?.deliveryDistanceKm ?? null,
      orderItems: details?.items ?? [],
      status: "confirmed"
    })
  });
}

async function getPaymentNotificationDetails(restaurantId: string, orderId: string) {
  const supabase = createAdminSupabaseClient() as any;
  const { data, error } = await supabase
    .from("orders")
    .select("id,subtotal,discount_amount,total,delivery_fee,service_fee,fulfillment_type,customer_name,customer_phone,customer_note,delivery_address,delivery_distance_km,table:tables(name),items:order_items(quantity,price,note,modifier_snapshot,menuItem:menu_items(name))")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (error || !data) return null;

  return {
    customerName: data.customer_name ? String(data.customer_name) : null,
    customerPhone: data.customer_phone ? String(data.customer_phone) : null,
    customerNote: data.customer_note ? String(data.customer_note) : null,
    subtotal: numberOrNull(data.subtotal),
    discountAmount: numberOrNull(data.discount_amount),
    total: numberOrNull(data.total),
    deliveryFee: numberOrNull(data.delivery_fee),
    serviceFee: numberOrNull(data.service_fee),
    fulfillmentType: normalizeFulfillmentType(data.fulfillment_type),
    tableName: nestedName(data.table),
    deliveryAddress: data.delivery_address ? String(data.delivery_address) : null,
    deliveryDistanceKm: numberOrNull(data.delivery_distance_km),
    items: normalizePaymentNotificationItems(data.items)
  };
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePaymentNotificationItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const record = row as Record<string, any>;
      const quantity = Number(record.quantity ?? 0);
      const unitPrice = Number(record.price ?? 0);
      const menuItem = Array.isArray(record.menuItem) ? record.menuItem[0] : record.menuItem;
      const name = menuItem?.name ? String(menuItem.name) : "Món";
      if (!Number.isFinite(quantity) || quantity <= 0) return null;
      return {
        name,
        quantity,
        unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
        lineTotal: Number.isFinite(unitPrice) ? Math.round(quantity * unitPrice) : null,
        note: record.note ? String(record.note) : null,
        modifierSummary: paymentModifierSummary(record.modifier_snapshot)
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function paymentModifierSummary(value: unknown) {
  if (!Array.isArray(value)) return null;
  const labels = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const optionName = (item as { optionName?: unknown; option_name?: unknown }).optionName ?? (item as { option_name?: unknown }).option_name;
      return optionName ? String(optionName) : null;
    })
    .filter((label): label is string => Boolean(label));
  return labels.length ? labels.join(", ") : null;
}

function normalizeFulfillmentType(value: unknown): FulfillmentType | null {
  return value === "DINE_IN" || value === "PICKUP" || value === "DELIVERY" ? value : null;
}

function nestedName(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object" || !("name" in row)) return null;
  const name = (row as { name?: unknown }).name;
  return name ? String(name) : null;
}

export async function confirmPayment(
  restaurantId: string,
  orderId: string,
  actorUserId?: string | null,
  requestedPaymentMethod?: PaymentMethod | null
) {
  const supabase = createAdminSupabaseClient();
  const typedOrder = await getMerchantPaymentOrder(supabase, restaurantId, orderId);
  const bill = firstOrNull(typedOrder.bill);

  if (bill) {
    const billPaymentMethod = inferManualConfirmationMethod({
      currentMethod: bill.payment_method ?? typedOrder.payment_method,
      requestedMethod: requestedPaymentMethod,
      status: typedOrder.status,
      paymentStatus: typedOrder.payment_status ?? null,
      billStatus: bill.status
    });
    if (bill.status === "paid") {
      if (billPaymentMethod) {
        await assertFeatureEntitlement(restaurantId, paymentMethodToEntitlementFeature(billPaymentMethod));
      }
      await completeReservationForBill(restaurantId, bill.id);
      await enqueuePaymentReceivedNotification({
        restaurantId,
        branchId: typedOrder.branch_id ?? null,
        orderId,
        billId: bill.id,
        amount: bill.total,
        method: billPaymentMethod ?? "QR",
        customerName: typedOrder.customer_name ?? null,
        actorUserId
      });
      invalidatePaymentDerivedCaches(restaurantId);
      return getMerchantPaymentOrder(supabase, restaurantId, orderId);
    }
    if (bill.status === "cancelled") {
      throw new AppError("Không thể xác nhận hóa đơn đã huỷ", 400);
    }
    if (bill.status !== "waiting_confirm" && bill.status !== "waiting_payment") {
      throw new AppError("Hóa đơn bàn chưa ở trạng thái chờ xác nhận thanh toán", 400);
    }
    if (!billPaymentMethod) {
      throw new AppError("Hóa đơn bàn chưa chọn phương thức thanh toán", 400);
    }
    await assertFeatureEntitlement(restaurantId, paymentMethodToEntitlementFeature(billPaymentMethod));

    try {
      await transitionPaymentAtomic(supabase, {
        restaurantId,
        orderId,
        billId: bill.id,
        expectedOrderStateVersion: typedOrder.state_version,
        expectedBillStateVersion: bill.state_version,
        toStatus: "paid",
        paymentMethod: billPaymentMethod,
        amount: bill.total,
        idempotencyKey: buildFinancialStageIdempotencyKey({
          stage: "merchant-confirm",
          entityId: orderId,
          orderStateVersion: typedOrder.state_version,
          billStateVersion: bill.state_version
        }),
        actorUserId,
        rawData: { source: "merchant_bill_manual_confirm" }
      });
    } catch (error) {
      const currentOrder = await getMerchantPaymentOrder(supabase, restaurantId, orderId);
      const currentBill = firstOrNull(currentOrder.bill);
      if (currentBill?.status === "paid") {
        await completeReservationForBill(restaurantId, currentBill.id);
        await enqueuePaymentReceivedNotification({
          restaurantId,
          branchId: typedOrder.branch_id ?? null,
          orderId,
          billId: currentBill.id,
          amount: currentBill.total,
          method: currentBill.payment_method ?? billPaymentMethod,
          customerName: typedOrder.customer_name ?? null,
          actorUserId
        });
        invalidatePaymentDerivedCaches(restaurantId);
        return currentOrder;
      }
      throw error;
    }

    await completeReservationForBill(restaurantId, bill.id);
    await enqueuePaymentReceivedNotification({
      restaurantId,
      branchId: typedOrder.branch_id ?? null,
      orderId,
      billId: bill.id,
      amount: bill.total,
      method: billPaymentMethod,
      customerName: typedOrder.customer_name ?? null,
      actorUserId
    });

    invalidatePaymentDerivedCaches(restaurantId);
    return getMerchantPaymentOrder(supabase, restaurantId, orderId);
  }

  if (isPaidOrder(typedOrder)) {
    const paidPaymentMethod = inferManualConfirmationMethod({
      currentMethod: typedOrder.payment_method,
      requestedMethod: requestedPaymentMethod,
      status: typedOrder.status,
      paymentStatus: typedOrder.payment_status ?? null
    });
    if (paidPaymentMethod) {
      await assertFeatureEntitlement(restaurantId, paymentMethodToEntitlementFeature(paidPaymentMethod));
      await enqueuePaymentReceivedNotification({
        restaurantId,
        branchId: typedOrder.branch_id ?? null,
        orderId,
        billId: typedOrder.bill_id ?? null,
        amount: typedOrder.total,
        method: paidPaymentMethod,
        customerName: typedOrder.customer_name ?? null,
        actorUserId
      });
    }
    invalidatePaymentDerivedCaches(restaurantId);
    return getMerchantPaymentOrder(supabase, restaurantId, orderId);
  }
  if (typedOrder.status === "cancelled") {
    throw new AppError("Không thể xác nhận đơn đã huỷ", 400);
  }
  if (typedOrder.payment_status === "refunded") {
    throw new AppError("Đơn hàng đã hoàn tiền, không thể xác nhận lại", 400);
  }
  const confirmationTransition = resolveMerchantPaymentConfirmationTransition({
    status: typedOrder.status,
    paymentStatus: typedOrder.payment_status ?? null,
    fulfillmentType: typedOrder.fulfillment_type,
    billId: typedOrder.bill_id ?? null
  });
  if (!confirmationTransition.allowed || !confirmationTransition.next) {
    throw new AppError(confirmationTransition.reason ?? "Đơn hàng chưa ở trạng thái chờ xác nhận thanh toán", 400);
  }
  const paymentMethod = inferManualConfirmationMethod({
    currentMethod: typedOrder.payment_method,
    requestedMethod: requestedPaymentMethod,
    status: typedOrder.status,
    paymentStatus: typedOrder.payment_status ?? null
  });

  if (!paymentMethod) {
    throw new AppError("Đơn hàng chưa chọn phương thức thanh toán", 400);
  }
  await assertFeatureEntitlement(restaurantId, paymentMethodToEntitlementFeature(paymentMethod));

  try {
    await transitionPaymentAtomic(supabase, {
      restaurantId,
      orderId,
      expectedOrderStateVersion: typedOrder.state_version,
      expectedBillStateVersion: null,
      toStatus: "paid",
      nextOrderStatus: confirmationTransition.next.status,
      paymentMethod,
      amount: typedOrder.total,
      idempotencyKey: buildFinancialStageIdempotencyKey({
        stage: "merchant-confirm",
        entityId: orderId,
        orderStateVersion: typedOrder.state_version
      }),
      actorUserId,
      rawData: { source: "merchant_manual_confirm" }
    });
  } catch (error) {
    const currentOrder = await getMerchantPaymentOrder(supabase, restaurantId, orderId);
    if (isPaidOrder(currentOrder)) {
      await enqueuePaymentReceivedNotification({
        restaurantId,
        branchId: currentOrder.branch_id ?? typedOrder.branch_id ?? null,
        orderId,
        billId: currentOrder.bill_id ?? typedOrder.bill_id ?? null,
        amount: currentOrder.total,
        method: currentOrder.payment_method ?? paymentMethod,
        customerName: currentOrder.customer_name ?? typedOrder.customer_name ?? null,
        actorUserId
      });
      return currentOrder;
    }
    throw error;
  }

  await enqueuePaymentReceivedNotification({
    restaurantId,
    branchId: typedOrder.branch_id ?? null,
    orderId,
    billId: typedOrder.bill_id ?? null,
    amount: typedOrder.total,
    method: paymentMethod,
    customerName: typedOrder.customer_name ?? null,
    actorUserId
  });
  invalidatePaymentDerivedCaches(restaurantId);
  return getMerchantPaymentOrder(supabase, restaurantId, orderId);
}
