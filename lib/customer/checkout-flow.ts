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

const CUSTOMER_PHONE_PATTERN = /^[0-9+() .-]{6,24}$/;

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

  if (input.customerName.trim().length < 2 || !input.customerPhone.trim()) {
    return {
      ok: false,
      error: "Vui lòng nhập tên và số điện thoại để quán xác nhận đơn.",
      screen: "cart"
    };
  }

  if (!CUSTOMER_PHONE_PATTERN.test(input.customerPhone.trim())) {
    return {
      ok: false,
      error: "Số điện thoại chưa đúng. Bạn kiểm tra lại để quán liên hệ khi cần.",
      screen: "cart"
    };
  }

  return { ok: true };
}

function normalizeQuoteCoordinate(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function buildDeliveryQuoteFingerprint(input: {
  subtotal: number;
  deliveryAddress?: string;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
}) {
  return JSON.stringify({
    subtotal: Math.max(0, Math.round(input.subtotal)),
    deliveryAddress: input.deliveryAddress?.trim().replace(/\s+/g, " ") ?? "",
    deliveryLat: normalizeQuoteCoordinate(input.deliveryLat),
    deliveryLng: normalizeQuoteCoordinate(input.deliveryLng)
  });
}

export function resolveDeliveryQuoteCheckoutState(input: {
  mode: RemoteFulfillmentMode;
  expectedFingerprint: string;
  quoteFingerprint?: string | null;
  quoteAccepted?: boolean;
  quoteError?: string | null;
  loadingQuote?: boolean;
}) {
  if (input.mode !== "DELIVERY") {
    return {
      required: false,
      fresh: true,
      accepted: true,
      stale: false,
      pending: false,
      message: null as string | null
    };
  }

  const hasQuote = Boolean(input.quoteFingerprint);
  const fresh = hasQuote && input.quoteFingerprint === input.expectedFingerprint;
  const pending = Boolean(input.loadingQuote);
  const stale = hasQuote && !fresh;
  const accepted = fresh && input.quoteAccepted === true && !pending;
  let message: string | null = null;

  if (pending) message = "Đang tính lại phí giao hàng...";
  else if (stale) message = "Phí giao hàng đã thay đổi. Vui lòng tính lại trước khi đặt.";
  else if (fresh && input.quoteError) message = input.quoteError;
  else if (!accepted) message = "Vui lòng tính phí giao hàng trước khi đặt.";

  return {
    required: true,
    fresh,
    accepted,
    stale,
    pending,
    message
  };
}

export type DeliveryQuoteCustomerInsight = {
  tone: "green" | "yellow" | "red" | "neutral";
  title: string;
  detail: string;
  badges: string[];
};

type DeliveryQuoteLike = {
  accepted?: boolean;
  distanceKm?: number | null;
  etaMinutes?: number | null;
  provider?: string | null;
  routeProvider?: string | null;
  confidence?: "high" | "medium" | "low" | null;
  isEstimated?: boolean | null;
  addressQualitySnapshot?: {
    level: "high" | "medium" | "low";
    score: number;
    warnings?: string[];
  } | null;
  deliveryAreaSnapshot?: {
    status?: string;
    outsideCustomArea?: boolean;
    matchedExclusionName?: string | null;
  } | null;
};

function quoteDistanceLabel(distanceKm?: number | null) {
  return typeof distanceKm === "number" && Number.isFinite(distanceKm) ? `${distanceKm.toFixed(1)} km` : null;
}

function quoteEtaLabel(etaMinutes?: number | null) {
  return typeof etaMinutes === "number" && Number.isFinite(etaMinutes) ? `${Math.round(etaMinutes)} phút` : null;
}

function zoneStatusLabel(status?: string) {
  if (status === "inside_custom_area") return "Trong vùng giao";
  if (status === "outside_allowed") return "Ngoài vùng chính";
  if (status === "outside_requires_confirmation") return "Cần quán xác nhận";
  if (status === "outside_blocked") return "Ngoài vùng giao";
  if (status === "excluded") return "Vùng loại trừ";
  return "Bán kính giao";
}

export function resolveDeliveryQuoteCustomerInsight(quote: DeliveryQuoteLike | null | undefined): DeliveryQuoteCustomerInsight {
  if (!quote) {
    return {
      tone: "neutral",
      title: "Chưa có kết quả giao hàng",
      detail: "Chọn địa chỉ hoặc ghim vị trí để hệ thống tính phí và ETA.",
      badges: []
    };
  }

  const quality = quote.addressQualitySnapshot;
  const zone = quote.deliveryAreaSnapshot;
  const badges = [
    quoteDistanceLabel(quote.distanceKm),
    quoteEtaLabel(quote.etaMinutes),
    quote.routeProvider ?? quote.provider ?? null,
    zoneStatusLabel(zone?.status)
  ].filter((item): item is string => Boolean(item));

  if (!quote.accepted) {
    return {
      tone: zone?.status === "outside_requires_confirmation" ? "yellow" : "red",
      title: zone?.status === "excluded" ? "Khu vực không nhận giao" : "Chưa thể nhận giao",
      detail: quality?.warnings?.[0] ?? "Địa chỉ này chưa đủ điều kiện giao hàng tự động.",
      badges
    };
  }

  if (quality?.level === "low" || quote.confidence === "low" || quote.isEstimated) {
    return {
      tone: "yellow",
      title: "Địa chỉ cần kiểm tra thêm",
      detail: quality?.warnings?.[0] ?? "Tuyến giao đang dùng ước tính, tài xế có thể cần gọi xác nhận.",
      badges
    };
  }

  return {
    tone: quality?.level === "medium" ? "yellow" : "green",
    title: quality?.level === "medium" ? "Địa chỉ đủ giao, nên kiểm tra hẻm" : "Địa chỉ nằm trong vùng giao",
    detail: quality?.level === "medium"
      ? quality.warnings?.[0] ?? "Thông tin giao hàng đã đủ để quán xử lý."
      : "Hệ thống đã xác nhận vùng giao, khoảng cách và ETA.",
    badges
  };
}

export function formatDeliveryQuoteUpdatedAt(value: number | null, now = Date.now()) {
  if (!value) return null;
  const seconds = Math.max(0, Math.floor((now - value) / 1000));
  if (seconds < 10) return "vừa cập nhật";
  if (seconds < 60) return `${seconds}s trước`;
  return `${Math.floor(seconds / 60)} phút trước`;
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
