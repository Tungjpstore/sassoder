import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildVietQrUrl } from "@/lib/vietqr";
import { billStatusToOrderPaymentState, ensurePaymentLogEvent, paymentTransitionKey } from "@/services/payment-log-service";
import { invalidateRestaurantDashboardCache } from "@/services/restaurant-service";
import { assertFeatureEntitlement } from "@/services/subscription-service";
import type { FulfillmentType, OrderDto, PaymentMethod, PaymentStatus, TableBillStatus } from "@/types/domain";

type PaymentInstructionOrder = Pick<OrderDto, "id" | "total" | "paymentMethod" | "paymentConfig" | "bill">;
type ServiceSupabaseClient = ReturnType<typeof createAdminSupabaseClient> | Awaited<ReturnType<typeof createServerSupabaseClient>>;

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
        paid_at?: string | null;
      }
    | Array<{
        id: string;
        status: TableBillStatus;
        total: number;
        payment_method: PaymentMethod | null;
        paid_at?: string | null;
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

function isPaidOrder(order: Pick<PaymentOrderRow, "status" | "payment_status">) {
  return order.status === "paid" || order.payment_status === "paid";
}

function startPaymentLogStatus(method: PaymentMethod) {
  return method === "QR" ? "pending" : "waiting_confirm";
}

async function getRestaurantIdBySlug(slug: string) {
  const supabase = createAdminSupabaseClient();
  const { data: restaurant, error } = await supabase.from("restaurants").select("id").eq("slug", slug).single();
  throwIfSupabaseError(error);
  if (!restaurant) throw new AppError("Không tìm thấy quán", 404);
  return restaurant.id;
}

async function getCustomerPaymentOrder(orderId: string, access: CustomerOrderAccessInput) {
  const supabase = createAdminSupabaseClient();
  const restaurantId = await getRestaurantIdBySlug(access.restaurantSlug);
  const { data: order, error } = await supabase
    .from("orders")
    .select("id,restaurant_id,status,total,payment_method,payment_status,fulfillment_type,bill_id,bill:table_bills(id,status,total,payment_method,paid_at,customer_session_id)")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .eq("table_id", access.tableId)
    .single();

  throwIfSupabaseError(error);
  if (!order) throw new AppError("Không tìm thấy đơn hàng cho bàn này", 404);
  return order as unknown as PaymentOrderRow;
}

async function getRemotePaymentOrder(orderId: string, access: RemoteOrderAccessInput) {
  const supabase = createAdminSupabaseClient();
  const restaurantId = await getRestaurantIdBySlug(access.restaurantSlug);
  const { data: order, error } = await supabase
    .from("orders")
    .select("id,restaurant_id,status,total,payment_method,payment_status,fulfillment_type,bill_id,bill:table_bills(id,status,total,payment_method,paid_at,customer_session_id)")
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
    .select("id,restaurant_id,status,total,payment_method,payment_status,fulfillment_type,bill_id,bill:table_bills(id,status,total,payment_method,paid_at)")
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

async function syncOrdersToBillState(
  supabase: ServiceSupabaseClient,
  input: {
    restaurantId: string;
    billId: string;
    billStatus: Extract<TableBillStatus, "waiting_payment" | "waiting_confirm" | "paid">;
    paymentMethod: PaymentMethod;
    paidAt?: string | null;
  }
) {
  const nextState = billStatusToOrderPaymentState(input.billStatus);
  const { error } = await supabase
    .from("orders")
    .update({
      status: nextState.orderStatus,
      payment_method: input.paymentMethod,
      payment_status: nextState.paymentStatus,
      ...(nextState.orderStatus === "paid" ? { paid_at: input.paidAt ?? new Date().toISOString() } : {})
    })
    .eq("bill_id", input.billId)
    .eq("restaurant_id", input.restaurantId)
    .neq("status", "cancelled");

  throwIfSupabaseError(error);
}

async function ensureStartPaymentLog(
  supabase: ServiceSupabaseClient,
  input: {
    orderId: string;
    amount: number;
    method: PaymentMethod;
    source: string;
    billId?: string | null;
  }
) {
  await ensurePaymentLogEvent(supabase, {
    orderId: input.orderId,
    billId: input.billId,
    method: input.method,
    status: startPaymentLogStatus(input.method),
    amount: input.amount,
    source: input.source,
    transitionKey: paymentTransitionKey({
      orderId: input.orderId,
      billId: input.billId,
      stage: `start-${input.method.toLowerCase()}`
    })
  });
}

async function ensureSubmittedQrLog(
  supabase: ServiceSupabaseClient,
  input: {
    orderId: string;
    amount: number;
    source: string;
    billId?: string | null;
  }
) {
  await ensurePaymentLogEvent(supabase, {
    orderId: input.orderId,
    billId: input.billId,
    method: "QR",
    status: "waiting_confirm",
    amount: input.amount,
    source: input.source,
    transitionKey: paymentTransitionKey({
      orderId: input.orderId,
      billId: input.billId,
      stage: "customer-submitted-qr"
    })
  });
}

async function ensureConfirmedPaymentLog(
  supabase: ServiceSupabaseClient,
  input: {
    orderId: string;
    amount: number;
    method: PaymentMethod;
    source: string;
    billId?: string | null;
  }
) {
  await ensurePaymentLogEvent(supabase, {
    orderId: input.orderId,
    billId: input.billId,
    method: input.method,
    status: "confirmed",
    amount: input.amount,
    source: input.source,
    transitionKey: paymentTransitionKey({
      orderId: input.orderId,
      billId: input.billId,
      stage: "confirmed"
    })
  });
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
      await syncOrdersToBillState(supabase, {
        restaurantId: typedOrder.restaurant_id,
        billId: bill.id,
        billStatus: "paid",
        paymentMethod: bill.payment_method ?? paymentMethod,
        paidAt: bill.paid_at ?? null
      });
      if (bill.payment_method === paymentMethod) {
        await ensureStartPaymentLog(supabase, {
          orderId,
          billId: bill.id,
          method: paymentMethod,
          amount: bill.total,
          source: "customer_bill_checkout"
        });
      }
      return getCustomerPaymentOrder(orderId, access);
    }
    if (bill.status === "waiting_payment" || bill.status === "waiting_confirm") {
      await syncOrdersToBillState(supabase, {
        restaurantId: typedOrder.restaurant_id,
        billId: bill.id,
        billStatus: bill.status,
        paymentMethod: bill.payment_method ?? paymentMethod
      });
      if (bill.payment_method === paymentMethod) {
        await ensureStartPaymentLog(supabase, {
          orderId,
          billId: bill.id,
          method: paymentMethod,
          amount: bill.total,
          source: "customer_bill_checkout"
        });
      }
      return getCustomerPaymentOrder(orderId, access);
    }

    await assertBillCanCheckout(bill.id);

    const nextStatus = paymentMethod === "QR" ? "waiting_payment" : "waiting_confirm";
    const { data: updatedBill, error: billError } = await supabase
      .from("table_bills")
      .update({ status: nextStatus, payment_method: paymentMethod })
      .eq("id", bill.id)
      .eq("status", "open")
      .select("id,status,total,payment_method,paid_at")
      .maybeSingle();
    throwIfSupabaseError(billError);

    if (!updatedBill) {
      const currentOrder = await getCustomerPaymentOrder(orderId, access);
      const currentBill = firstOrNull(currentOrder.bill);
      if (currentBill && (currentBill.status === "waiting_payment" || currentBill.status === "waiting_confirm" || currentBill.status === "paid")) {
        if (currentBill.status !== "paid") {
          await syncOrdersToBillState(supabase, {
            restaurantId: currentOrder.restaurant_id,
            billId: currentBill.id,
            billStatus: currentBill.status,
            paymentMethod: currentBill.payment_method ?? paymentMethod
          });
        } else {
          await syncOrdersToBillState(supabase, {
            restaurantId: currentOrder.restaurant_id,
            billId: currentBill.id,
            billStatus: "paid",
            paymentMethod: currentBill.payment_method ?? paymentMethod,
            paidAt: currentBill.paid_at ?? null
          });
        }
        if (currentBill.payment_method === paymentMethod) {
          await ensureStartPaymentLog(supabase, {
            orderId,
            billId: currentBill.id,
            method: paymentMethod,
            amount: currentBill.total,
            source: "customer_bill_checkout"
          });
        }
        return currentOrder;
      }
      throw new AppError("Không thể bắt đầu thanh toán cho hóa đơn này", 409);
    }

    await syncOrdersToBillState(supabase, {
      restaurantId: typedOrder.restaurant_id,
      billId: bill.id,
      billStatus: nextStatus,
      paymentMethod
    });
    await ensureStartPaymentLog(supabase, {
      orderId,
      billId: bill.id,
      method: paymentMethod,
      amount: bill.total,
      source: "customer_bill_checkout"
    });

    invalidateRestaurantDashboardCache(typedOrder.restaurant_id);
    return getCustomerPaymentOrder(orderId, access);
  }

  if (typedOrder.status === "cancelled") throw new AppError("Đơn hàng đã bị huỷ", 400);
  if (isPaidOrder(typedOrder) || typedOrder.status === "waiting_payment" || typedOrder.status === "waiting_confirm") {
    if ((typedOrder.payment_method ?? paymentMethod) === paymentMethod) {
      await ensureStartPaymentLog(supabase, {
        orderId,
        method: paymentMethod,
        amount: typedOrder.total,
        source: "customer_checkout"
      });
    }
    return getCustomerPaymentOrder(orderId, access);
  }
  if (!["completed", "ordering"].includes(typedOrder.status)) {
    throw new AppError("Quán cần xác nhận hoặc phục vụ món trước khi thanh toán", 400);
  }

  const nextStatus = paymentMethod === "QR" ? "waiting_payment" : "waiting_confirm";
  const { data: updated, error: updateError } = await supabase
    .from("orders")
    .update({ status: nextStatus, payment_method: paymentMethod, payment_status: nextStatus })
    .eq("id", orderId)
    .in("status", ["ordering", "completed"])
    .select("id")
    .maybeSingle();
  throwIfSupabaseError(updateError);

  if (!updated) {
    const currentOrder = await getCustomerPaymentOrder(orderId, access);
    if (isPaidOrder(currentOrder) || currentOrder.status === "waiting_payment" || currentOrder.status === "waiting_confirm") {
      if ((currentOrder.payment_method ?? paymentMethod) === paymentMethod) {
        await ensureStartPaymentLog(supabase, {
          orderId,
          method: paymentMethod,
          amount: currentOrder.total,
          source: "customer_checkout"
        });
      }
      return currentOrder;
    }
    throw new AppError("Không thể bắt đầu thanh toán cho đơn hàng này", 409);
  }

  await ensureStartPaymentLog(supabase, {
    orderId,
    method: paymentMethod,
    amount: typedOrder.total,
    source: "customer_checkout"
  });
  invalidateRestaurantDashboardCache(typedOrder.restaurant_id);
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
      await syncOrdersToBillState(supabase, {
        restaurantId: typedOrder.restaurant_id,
        billId: bill.id,
        billStatus: "paid",
        paymentMethod: "QR",
        paidAt: bill.paid_at ?? null
      });
      await ensureSubmittedQrLog(supabase, {
        orderId,
        billId: bill.id,
        amount: bill.total,
        source: "customer_bill_button"
      });
      return getCustomerPaymentOrder(orderId, access);
    }
    if (bill.status === "waiting_confirm") {
      await syncOrdersToBillState(supabase, {
        restaurantId: typedOrder.restaurant_id,
        billId: bill.id,
        billStatus: "waiting_confirm",
        paymentMethod: "QR"
      });
      await ensureSubmittedQrLog(supabase, {
        orderId,
        billId: bill.id,
        amount: bill.total,
        source: "customer_bill_button"
      });
      return getCustomerPaymentOrder(orderId, access);
    }
    if (bill.status !== "waiting_payment") {
      return getCustomerPaymentOrder(orderId, access);
    }

    const { data: updatedBill, error: billError } = await supabase
      .from("table_bills")
      .update({ status: "waiting_confirm" })
      .eq("id", bill.id)
      .eq("status", "waiting_payment")
      .select("id,status,total,payment_method,paid_at")
      .maybeSingle();
    throwIfSupabaseError(billError);

    if (!updatedBill) {
      const currentOrder = await getCustomerPaymentOrder(orderId, access);
      const currentBill = firstOrNull(currentOrder.bill);
      if (currentBill?.status === "waiting_confirm" || currentBill?.status === "paid") {
        if (currentBill.status === "waiting_confirm") {
          await syncOrdersToBillState(supabase, {
            restaurantId: currentOrder.restaurant_id,
            billId: currentBill.id,
            billStatus: "waiting_confirm",
            paymentMethod: "QR"
          });
        } else {
          await syncOrdersToBillState(supabase, {
            restaurantId: currentOrder.restaurant_id,
            billId: currentBill.id,
            billStatus: "paid",
            paymentMethod: "QR",
            paidAt: currentBill.paid_at ?? null
          });
        }
        await ensureSubmittedQrLog(supabase, {
          orderId,
          billId: currentBill.id,
          amount: currentBill.total,
          source: "customer_bill_button"
        });
        return currentOrder;
      }
      throw new AppError("Không thể xác nhận đã chuyển khoản cho hóa đơn này", 409);
    }

    await syncOrdersToBillState(supabase, {
      restaurantId: typedOrder.restaurant_id,
      billId: bill.id,
      billStatus: "waiting_confirm",
      paymentMethod: "QR"
    });
    await ensureSubmittedQrLog(supabase, {
      orderId,
      billId: bill.id,
      amount: bill.total,
      source: "customer_bill_button"
    });

    invalidateRestaurantDashboardCache(typedOrder.restaurant_id);
    return getCustomerPaymentOrder(orderId, access);
  }

  if (typedOrder.payment_method !== "QR") {
    throw new AppError("Thao tác này chỉ dùng cho thanh toán QR", 400);
  }
  if (typedOrder.status === "cancelled") {
    throw new AppError("Đơn hàng đã bị huỷ", 400);
  }
  if (isPaidOrder(typedOrder) || typedOrder.status === "waiting_confirm" || typedOrder.payment_status === "waiting_confirm") {
    await ensureSubmittedQrLog(supabase, {
      orderId,
      amount: typedOrder.total,
      source: "customer_button"
    });
    return getCustomerPaymentOrder(orderId, access);
  }
  if (typedOrder.status !== "waiting_payment" && typedOrder.payment_status !== "waiting_payment") {
    return getCustomerPaymentOrder(orderId, access);
  }

  const { data: updated, error: updateError } = await supabase
    .from("orders")
    .update({ status: "waiting_confirm", payment_status: "waiting_confirm" })
    .eq("id", orderId)
    .or("status.eq.waiting_payment,payment_status.eq.waiting_payment")
    .select("id")
    .maybeSingle();
  throwIfSupabaseError(updateError);

  if (!updated) {
    const currentOrder = await getCustomerPaymentOrder(orderId, access);
    if (isPaidOrder(currentOrder) || currentOrder.status === "waiting_confirm" || currentOrder.payment_status === "waiting_confirm") {
      await ensureSubmittedQrLog(supabase, {
        orderId,
        amount: currentOrder.total,
        source: "customer_button"
      });
      return currentOrder;
    }
    throw new AppError("Không thể xác nhận đã chuyển khoản cho đơn hàng này", 409);
  }

  await ensureSubmittedQrLog(supabase, {
    orderId,
    amount: typedOrder.total,
    source: "customer_button"
  });
  invalidateRestaurantDashboardCache(typedOrder.restaurant_id);
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
  if (isPaidOrder(typedOrder) || typedOrder.status === "waiting_confirm" || typedOrder.payment_status === "waiting_confirm") {
    await ensureSubmittedQrLog(supabase, {
      orderId,
      amount: typedOrder.total,
      source: "remote_order_customer_paid_button"
    });
    return getRemotePaymentOrder(orderId, access);
  }
  if (typedOrder.payment_status !== "waiting_payment" && typedOrder.status !== "waiting_payment") {
    return getRemotePaymentOrder(orderId, access);
  }

  const { data: updated, error: updateError } = await supabase
    .from("orders")
    .update({ status: "waiting_confirm", payment_status: "waiting_confirm" })
    .eq("id", orderId)
    .or("status.eq.waiting_payment,payment_status.eq.waiting_payment")
    .select("id")
    .maybeSingle();
  throwIfSupabaseError(updateError);

  if (!updated) {
    const currentOrder = await getRemotePaymentOrder(orderId, access);
    if (isPaidOrder(currentOrder) || currentOrder.status === "waiting_confirm" || currentOrder.payment_status === "waiting_confirm") {
      await ensureSubmittedQrLog(supabase, {
        orderId,
        amount: currentOrder.total,
        source: "remote_order_customer_paid_button"
      });
      return currentOrder;
    }
    throw new AppError("Không thể ghi nhận thanh toán VietQR cho đơn này", 409);
  }

  await ensureSubmittedQrLog(supabase, {
    orderId,
    amount: typedOrder.total,
    source: "remote_order_customer_paid_button"
  });
  invalidateRestaurantDashboardCache(typedOrder.restaurant_id);
  return getRemotePaymentOrder(orderId, access);
}

export async function confirmPayment(restaurantId: string, orderId: string) {
  const supabase = await createServerSupabaseClient();
  const typedOrder = await getMerchantPaymentOrder(supabase, restaurantId, orderId);
  const bill = firstOrNull(typedOrder.bill);

  if (bill) {
    if (bill.status === "paid") {
      await syncOrdersToBillState(supabase, {
        restaurantId,
        billId: bill.id,
        billStatus: "paid",
        paymentMethod: bill.payment_method ?? typedOrder.payment_method ?? "QR",
        paidAt: bill.paid_at ?? null
      });
      await ensureConfirmedPaymentLog(supabase, {
        orderId,
        billId: bill.id,
        amount: bill.total,
        method: bill.payment_method ?? typedOrder.payment_method ?? "QR",
        source: "merchant_bill_manual_confirm"
      });
      return getMerchantPaymentOrder(supabase, restaurantId, orderId);
    }
    if (bill.status === "cancelled") {
      throw new AppError("Không thể xác nhận hóa đơn đã huỷ", 400);
    }
    if (bill.status !== "waiting_confirm" && bill.status !== "waiting_payment") {
      throw new AppError("Hóa đơn bàn chưa ở trạng thái chờ xác nhận thanh toán", 400);
    }
    if (!bill.payment_method) {
      throw new AppError("Hóa đơn bàn chưa chọn phương thức thanh toán", 400);
    }

    const now = new Date().toISOString();
    const { data: updatedBill, error: billError } = await supabase
      .from("table_bills")
      .update({ status: "paid", paid_at: now, closed_at: now })
      .eq("id", bill.id)
      .eq("restaurant_id", restaurantId)
      .in("status", ["waiting_confirm", "waiting_payment"])
      .select("id,status,total,payment_method,paid_at")
      .maybeSingle();
    throwIfSupabaseError(billError);

    if (!updatedBill) {
      const currentOrder = await getMerchantPaymentOrder(supabase, restaurantId, orderId);
      const currentBill = firstOrNull(currentOrder.bill);
      if (currentBill?.status === "paid") {
        await syncOrdersToBillState(supabase, {
          restaurantId,
          billId: currentBill.id,
          billStatus: "paid",
          paymentMethod: currentBill.payment_method ?? bill.payment_method,
          paidAt: currentBill.paid_at ?? now
        });
        await ensureConfirmedPaymentLog(supabase, {
          orderId,
          billId: currentBill.id,
          amount: currentBill.total,
          method: currentBill.payment_method ?? bill.payment_method,
          source: "merchant_bill_manual_confirm"
        });
        return currentOrder;
      }
      throw new AppError("Không thể xác nhận thanh toán cho hóa đơn này", 409);
    }

    await syncOrdersToBillState(supabase, {
      restaurantId,
      billId: bill.id,
      billStatus: "paid",
      paymentMethod: bill.payment_method,
      paidAt: updatedBill.paid_at ?? now
    });
    await ensureConfirmedPaymentLog(supabase, {
      orderId,
      billId: bill.id,
      amount: bill.total,
      method: bill.payment_method,
      source: "merchant_bill_manual_confirm"
    });

    invalidateRestaurantDashboardCache(restaurantId);
    return getMerchantPaymentOrder(supabase, restaurantId, orderId);
  }

  if (isPaidOrder(typedOrder)) {
    if (typedOrder.payment_method) {
      await ensureConfirmedPaymentLog(supabase, {
        orderId,
        amount: typedOrder.total,
        method: typedOrder.payment_method,
        source: "merchant_manual_confirm"
      });
    }
    return getMerchantPaymentOrder(supabase, restaurantId, orderId);
  }
  if (typedOrder.status === "cancelled") {
    throw new AppError("Không thể xác nhận đơn đã huỷ", 400);
  }
  const canConfirmPayment =
    ["waiting_confirm", "waiting_payment", "completed"].includes(typedOrder.status) ||
    typedOrder.payment_status === "waiting_confirm" ||
    typedOrder.payment_status === "waiting_payment";
  if (!canConfirmPayment) {
    throw new AppError("Đơn hàng chưa ở trạng thái chờ xác nhận thanh toán", 400);
  }
  if (!typedOrder.payment_method) {
    throw new AppError("Đơn hàng chưa chọn phương thức thanh toán", 400);
  }

  const now = new Date().toISOString();
  const shouldReturnToKitchen =
    typedOrder.bill_id === null &&
    typedOrder.fulfillment_type !== "DINE_IN" &&
    (
      typedOrder.status === "waiting_confirm" ||
      typedOrder.status === "waiting_payment" ||
      typedOrder.payment_status === "waiting_confirm" ||
      typedOrder.payment_status === "waiting_payment"
    );

  const { data: updated, error: updateError } = await supabase
    .from("orders")
    .update({
      status: shouldReturnToKitchen ? "pending" : "paid",
      payment_status: "paid",
      paid_at: now
    })
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .or("status.eq.waiting_confirm,status.eq.waiting_payment,status.eq.completed,payment_status.eq.waiting_confirm,payment_status.eq.waiting_payment")
    .select("id")
    .maybeSingle();
  throwIfSupabaseError(updateError);

  if (!updated) {
    const currentOrder = await getMerchantPaymentOrder(supabase, restaurantId, orderId);
    if (isPaidOrder(currentOrder)) {
      await ensureConfirmedPaymentLog(supabase, {
        orderId,
        amount: currentOrder.total,
        method: currentOrder.payment_method ?? typedOrder.payment_method,
        source: "merchant_manual_confirm"
      });
      return currentOrder;
    }
    throw new AppError("Không thể xác nhận thanh toán cho đơn hàng này", 409);
  }

  await ensureConfirmedPaymentLog(supabase, {
    orderId,
    amount: typedOrder.total,
    method: typedOrder.payment_method,
    source: "merchant_manual_confirm"
  });
  invalidateRestaurantDashboardCache(restaurantId);
  return getMerchantPaymentOrder(supabase, restaurantId, orderId);
}
