export type RemoteFulfillmentMode = "PICKUP" | "DELIVERY";
export type CheckoutPaymentMethod = "QR" | "CASH" | null | undefined;

export type RemoteCheckoutScreen =
  | "menu"
  | "cart"
  | "delivery"
  | "payment"
  | "vietqr"
  | "success"
  | "tracking"
  | "complete";

export type DineInCheckoutScreen =
  | "menu"
  | "cart"
  | "order-sent"
  | "tracking"
  | "payment-choice"
  | "cash-payment"
  | "vietqr-payment"
  | "payment-pending"
  | "payment-success"
  | "invoice"
  | "orders";

type CheckoutState<Screen extends string> = {
  error: string | null;
  screen: Screen;
};

export type RemoteCheckoutAction =
  | { type: "CONTINUE_FROM_CART"; mode: RemoteFulfillmentMode }
  | {
      type: "CONTINUE_FROM_DELIVERY";
      mode: RemoteFulfillmentMode;
      quoteAccepted: boolean;
      quoteError?: string | null;
    }
  | {
      type: "REQUIRE_DELIVERY_QUOTE";
      mode: RemoteFulfillmentMode;
      quoteAccepted: boolean;
      quoteError?: string | null;
    }
  | {
      type: "ORDER_SUBMITTED";
      paymentMethod?: CheckoutPaymentMethod;
      requiresPrepaidQr: boolean;
    };

export type DineInCheckoutAction =
  | {
      type: "OPEN_EXISTING_ORDER";
      isPaid: boolean;
      orderStatus?: string | null;
      paymentMethod?: CheckoutPaymentMethod;
    }
  | { type: "START_PAYMENT"; method: CheckoutPaymentMethod }
  | { type: "PAYMENT_MARKED"; isPaid: boolean }
  | { type: "PAYMENT_CONFIRMED" }
  | { type: "OPEN_PAYMENT_ENTRY"; canStartPayment: boolean; hasCreatedOrder: boolean };

export function validateRemoteCheckoutBasics(input: {
  cartLineCount: number;
  customerName: string;
  customerPhone: string;
}): { ok: true } | { ok: false; error: string; screen: RemoteCheckoutScreen } {
  if (input.cartLineCount === 0) {
    return { ok: false, error: "Vui lòng chọn ít nhất một món.", screen: "cart" };
  }

  if (!input.customerName.trim() || !input.customerPhone.trim()) {
    return {
      ok: false,
      error: "Vui lòng nhập tên và số điện thoại để quán xác nhận đơn.",
      screen: "cart"
    };
  }

  return { ok: true };
}

export function remoteCheckoutReducer(
  _state: CheckoutState<RemoteCheckoutScreen>,
  action: RemoteCheckoutAction
): CheckoutState<RemoteCheckoutScreen> {
  if (action.type === "CONTINUE_FROM_CART") {
    return { error: null, screen: action.mode === "DELIVERY" ? "delivery" : "payment" };
  }

  if (action.type === "ORDER_SUBMITTED") {
    return {
      error: null,
      screen: action.requiresPrepaidQr && action.paymentMethod === "QR" ? "vietqr" : "success"
    };
  }

  if (action.mode !== "DELIVERY") {
    return { error: null, screen: "payment" };
  }

  if (action.quoteAccepted) {
    return { error: null, screen: "payment" };
  }

  return {
    error:
      action.quoteError ??
      (action.type === "REQUIRE_DELIVERY_QUOTE"
        ? "Vui lòng tính phí giao hàng trước khi đặt."
        : "Vui lòng chốt điểm giao hợp lệ trước khi thanh toán."),
    screen: "delivery"
  };
}

export function dineInCheckoutReducer(
  state: CheckoutState<DineInCheckoutScreen>,
  action: DineInCheckoutAction
): CheckoutState<DineInCheckoutScreen> {
  if (action.type === "OPEN_EXISTING_ORDER") {
    if (action.isPaid) return { error: null, screen: "payment-success" };
    if (action.paymentMethod === "QR" && action.orderStatus === "waiting_payment") {
      return { error: null, screen: "vietqr-payment" };
    }
    if (action.orderStatus === "waiting_payment" || action.orderStatus === "waiting_confirm") {
      return { error: null, screen: "payment-pending" };
    }
    return { error: null, screen: "tracking" };
  }

  if (action.type === "START_PAYMENT") {
    return { error: null, screen: action.method === "QR" ? "vietqr-payment" : "cash-payment" };
  }

  if (action.type === "PAYMENT_MARKED") {
    return { error: null, screen: action.isPaid ? "payment-success" : "payment-pending" };
  }

  if (action.type === "PAYMENT_CONFIRMED") {
    return { error: null, screen: "payment-success" };
  }

  if (!action.hasCreatedOrder) return state;
  return { error: null, screen: action.canStartPayment ? "payment-choice" : "tracking" };
}
