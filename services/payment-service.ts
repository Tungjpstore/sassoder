import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildVietQrUrl } from "@/lib/vietqr";
import { invalidateRestaurantDashboardCache } from "@/services/restaurant-service";
import { assertFeatureEntitlement } from "@/services/subscription-service";
import type { FulfillmentType, OrderDto, PaymentMethod, PaymentStatus, TableBillStatus } from "@/types/domain";

type PaymentInstructionOrder = Pick<OrderDto, "id" | "total" | "paymentMethod" | "paymentConfig" | "bill">;

type PaymentOrderRow = {
  id: string;
  restaurant_id: string;
  status: OrderDto["status"];
  total: number;
  payment_method: PaymentMethod | null;
  payment_status?: PaymentStatus | null;
  fulfillment_type?: FulfillmentType;
  bill_id?: string | null;
  bill:
    | {
        id: string;
        status: TableBillStatus;
        total: number;
        payment_method: PaymentMethod | null;
      }
    | Array<{
        id: string;
        status: TableBillStatus;
        total: number;
        payment_method: PaymentMethod | null;
      }>
    | null;
};

type CustomerOrderAccessInput = {
  restaurantSlug: string;
  tableId: string;
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

async function getCustomerPaymentOrder(orderId: string, access: CustomerOrderAccessInput) {
  const supabase = createAdminSupabaseClient();
  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("id")
    .eq("slug", access.restaurantSlug)
    .single();

  throwIfSupabaseError(restaurantError);
  if (!restaurant) throw new AppError("Không tìm thấy quán", 404);

  const { data: order, error } = await supabase
    .from("orders")
    .select("id,restaurant_id,status,total,payment_method,payment_status,fulfillment_type,bill_id,bill:table_bills(id,status,total,payment_method,customer_session_id)")
    .eq("id", orderId)
    .eq("restaurant_id", restaurant.id)
    .eq("table_id", access.tableId)
    .single();

  throwIfSupabaseError(error);
  if (!order) throw new AppError("Không tìm thấy đơn hàng cho bàn này", 404);
  return order as unknown as PaymentOrderRow;
}

async function getRemotePaymentOrder(orderId: string, access: RemoteOrderAccessInput) {
  const supabase = createAdminSupabaseClient();
  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("id")
    .eq("slug", access.restaurantSlug)
    .single();

  throwIfSupabaseError(restaurantError);
  if (!restaurant) throw new AppError("Không tìm thấy quán", 404);

  const { data: order, error } = await supabase
    .from("orders")
    .select("id,restaurant_id,status,total,payment_method,payment_status,fulfillment_type,bill_id,bill:table_bills(id,status,total,payment_method,customer_session_id)")
    .eq("id", orderId)
    .eq("restaurant_id", restaurant.id)
    .is("table_id", null)
    .eq("customer_session_id", access.customerSessionId)
    .single();

  throwIfSupabaseError(error);
  if (!order) throw new AppError("Không tìm thấy đơn online của bạn", 404);
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
    if (bill.status === "paid") return typedOrder;
    if (["waiting_payment", "waiting_confirm"].includes(bill.status)) return typedOrder;
    await assertBillCanCheckout(bill.id);

    const nextStatus = paymentMethod === "QR" ? "waiting_payment" : "waiting_confirm";
    const { error: logError } = await supabase.from("payment_logs").insert({
      order_id: orderId,
      bill_id: bill.id,
      method: paymentMethod,
      status: paymentMethod === "QR" ? "pending" : "waiting_confirm",
      amount: bill.total,
      raw_data: { source: "customer_bill_checkout" }
    });
    throwIfSupabaseError(logError);

    const { error: billError } = await supabase
      .from("table_bills")
      .update({ status: nextStatus, payment_method: paymentMethod })
      .eq("id", bill.id);
    throwIfSupabaseError(billError);

    const { error: orderUpdateError } = await supabase
      .from("orders")
      .update({ status: nextStatus, payment_method: paymentMethod, payment_status: nextStatus })
      .eq("bill_id", bill.id)
      .neq("status", "cancelled");
    throwIfSupabaseError(orderUpdateError);

    invalidateRestaurantDashboardCache(typedOrder.restaurant_id);
    return typedOrder;
  }

  if (typedOrder.status === "cancelled") throw new AppError("Đơn hàng đã bị huỷ", 400);
  if (typedOrder.status === "paid") return typedOrder;
  if (["waiting_payment", "waiting_confirm"].includes(typedOrder.status)) return typedOrder;
  if (!["completed", "ordering"].includes(typedOrder.status)) {
    throw new AppError("Quán cần xác nhận hoặc phục vụ món trước khi thanh toán", 400);
  }

  const nextStatus = paymentMethod === "QR" ? "waiting_payment" : "waiting_confirm";
  const { error: logError } = await supabase.from("payment_logs").insert({
    order_id: orderId,
    method: paymentMethod,
    status: paymentMethod === "QR" ? "pending" : "waiting_confirm",
    amount: typedOrder.total,
    raw_data: { source: "customer_checkout" }
  });
  throwIfSupabaseError(logError);

  const { data: updated, error: updateError } = await supabase
    .from("orders")
    .update({ status: nextStatus, payment_method: paymentMethod, payment_status: nextStatus })
    .eq("id", orderId)
    .select()
    .single();

  throwIfSupabaseError(updateError);
  invalidateRestaurantDashboardCache(typedOrder.restaurant_id);
  return updated;
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
    if (bill.status === "paid") return typedOrder;
    if (bill.status === "cancelled") throw new AppError("Hóa đơn bàn đã bị huỷ", 400);
    if (bill.status !== "waiting_payment") return typedOrder;

    const { error: logError } = await supabase.from("payment_logs").insert({
      order_id: orderId,
      bill_id: bill.id,
      method: "QR",
      status: "waiting_confirm",
      amount: bill.total,
      raw_data: { source: "customer_bill_button" }
    });
    throwIfSupabaseError(logError);

    const { error: billError } = await supabase.from("table_bills").update({ status: "waiting_confirm" }).eq("id", bill.id);
    throwIfSupabaseError(billError);

    const { error: orderUpdateError } = await supabase
      .from("orders")
      .update({ status: "waiting_confirm", payment_status: "waiting_confirm" })
      .eq("bill_id", bill.id)
      .eq("status", "waiting_payment");
    throwIfSupabaseError(orderUpdateError);

    invalidateRestaurantDashboardCache(typedOrder.restaurant_id);
    return typedOrder;
  }

  if (typedOrder.payment_method !== "QR") {
    throw new AppError("Thao tác này chỉ dùng cho thanh toán QR", 400);
  }
  if (typedOrder.status === "paid") {
    return typedOrder;
  }
  if (typedOrder.status === "cancelled") {
    throw new AppError("Đơn hàng đã bị huỷ", 400);
  }
  if (typedOrder.status !== "waiting_payment") {
    return typedOrder;
  }

  const { error: logError } = await supabase.from("payment_logs").insert({
    order_id: orderId,
    method: "QR",
    status: "waiting_confirm",
    amount: typedOrder.total,
    raw_data: { source: "customer_button" }
  });
  throwIfSupabaseError(logError);

  const { data: updated, error: updateError } = await supabase
    .from("orders")
    .update({ status: "waiting_confirm", payment_status: "waiting_confirm" })
    .eq("id", orderId)
    .select()
    .single();

  throwIfSupabaseError(updateError);
  invalidateRestaurantDashboardCache(typedOrder.restaurant_id);
  return updated;
}

export async function markRemoteCustomerPaid(orderId: string, access: RemoteOrderAccessInput) {
  const supabase = createAdminSupabaseClient();
  const typedOrder = await getRemotePaymentOrder(orderId, access);
  await assertFeatureEntitlement(typedOrder.restaurant_id, "online_ordering");
  await assertFeatureEntitlement(typedOrder.restaurant_id, "vietqr_payments");

  if (typedOrder.payment_method !== "QR") {
    throw new AppError("Đơn này chưa yêu cầu thanh toán VietQR", 400);
  }
  if (typedOrder.payment_status === "paid") return typedOrder;
  if (typedOrder.status === "cancelled") throw new AppError("Đơn hàng đã bị huỷ", 400);
  if (typedOrder.payment_status !== "waiting_payment" && typedOrder.status !== "waiting_payment") {
    return typedOrder;
  }

  const { error: logError } = await supabase.from("payment_logs").insert({
    order_id: orderId,
    method: "QR",
    status: "waiting_confirm",
    amount: typedOrder.total,
    raw_data: { source: "remote_order_customer_paid_button" }
  });
  throwIfSupabaseError(logError);

  const { data: updated, error: updateError } = await supabase
    .from("orders")
    .update({ status: "waiting_confirm", payment_status: "waiting_confirm" })
    .eq("id", orderId)
    .select()
    .single();

  throwIfSupabaseError(updateError);
  invalidateRestaurantDashboardCache(typedOrder.restaurant_id);
  return updated;
}

export async function confirmPayment(restaurantId: string, orderId: string) {
  const supabase = await createServerSupabaseClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("id,restaurant_id,status,total,payment_method,bill_id,bill:table_bills(id,status,total,payment_method)")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .single();

  throwIfSupabaseError(error);
  if (!order) throw new AppError("Không tìm thấy đơn hàng", 404);
  const typedOrder = order as unknown as PaymentOrderRow;
  const bill = firstOrNull(typedOrder.bill);

  if (bill) {
    if (bill.status === "paid") return typedOrder;
    if (bill.status === "cancelled") {
      throw new AppError("Không thể xác nhận hóa đơn đã huỷ", 400);
    }
    if (!["waiting_confirm", "waiting_payment"].includes(bill.status)) {
      throw new AppError("Hóa đơn bàn chưa ở trạng thái chờ xác nhận thanh toán", 400);
    }
    if (!bill.payment_method) {
      throw new AppError("Hóa đơn bàn chưa chọn phương thức thanh toán", 400);
    }

    const { error: logError } = await supabase.from("payment_logs").insert({
      order_id: orderId,
      bill_id: bill.id,
      method: bill.payment_method,
      status: "confirmed",
      amount: bill.total,
      raw_data: { source: "merchant_bill_manual_confirm" }
    });
    throwIfSupabaseError(logError);

    const now = new Date().toISOString();
    const { error: billError } = await supabase
      .from("table_bills")
      .update({ status: "paid", paid_at: now, closed_at: now })
      .eq("id", bill.id)
      .eq("restaurant_id", restaurantId);
    throwIfSupabaseError(billError);

    const { error: orderUpdateError } = await supabase
      .from("orders")
      .update({ status: "paid", payment_method: bill.payment_method, payment_status: "paid", paid_at: now })
      .eq("bill_id", bill.id)
      .eq("restaurant_id", restaurantId)
      .neq("status", "cancelled");
    throwIfSupabaseError(orderUpdateError);

    invalidateRestaurantDashboardCache(restaurantId);
    return typedOrder;
  }

  if (typedOrder.status === "paid") return typedOrder;
  if (typedOrder.status === "cancelled") {
    throw new AppError("Không thể xác nhận đơn đã huỷ", 400);
  }
  if (!["waiting_confirm", "waiting_payment", "completed"].includes(typedOrder.status)) {
    throw new AppError("Đơn hàng chưa ở trạng thái chờ xác nhận thanh toán", 400);
  }
  if (!typedOrder.payment_method) {
    throw new AppError("Đơn hàng chưa chọn phương thức thanh toán", 400);
  }

  const now = new Date().toISOString();
  const shouldReturnToKitchen =
    typedOrder.bill_id === null &&
    typedOrder.fulfillment_type !== "DINE_IN" &&
    (typedOrder.status === "waiting_confirm" || typedOrder.status === "waiting_payment");

  const { error: logError } = await supabase.from("payment_logs").insert({
    order_id: orderId,
    method: typedOrder.payment_method,
    status: "confirmed",
    amount: typedOrder.total,
    raw_data: { source: "merchant_manual_confirm" }
  });
  throwIfSupabaseError(logError);

  const { data: updated, error: updateError } = await supabase
    .from("orders")
    .update({
      status: shouldReturnToKitchen ? "pending" : "paid",
      payment_status: "paid",
      paid_at: now
    })
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .select()
    .single();

  throwIfSupabaseError(updateError);
  invalidateRestaurantDashboardCache(restaurantId);
  return updated;
}
