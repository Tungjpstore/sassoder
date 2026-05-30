import type { OperationalTelegramEvent } from "./types.mjs";

export type FormattedTelegramCard = {
  title: string;
  body: string;
  viewPath?: string;
};

type OrderItemSnapshot = {
  name: string;
  quantity: number;
  unitPrice?: number | null;
  lineTotal?: number | null;
  note?: string | null;
  modifierSummary?: string | null;
};

export function formatTelegramCard(event: OperationalTelegramEvent): FormattedTelegramCard {
  const test = isTestEvent(event);

  if (
    event.type === "order.created" ||
    event.type === "order.confirmed" ||
    event.type === "order.completed" ||
    event.type === "order.cancelled" ||
    event.type === "order.delivery_status_changed"
  ) {
    const code = event.order.displayCode ?? shortId(event.order.id);
    const location = event.order.tableName ? `📍 Bàn: ${escapeHtml(singleLineText(event.order.tableName))}` : "";
    const deliveryAddress = event.order.deliveryAddress ? `📍 Địa chỉ giao: ${escapeHtml(singleLineText(event.order.deliveryAddress))}` : "";
    const deliveryDistance = distanceLine(event.order.deliveryDistanceKm);
    const customer = contactLine(event.order.customerName, event.order.customerPhone);
    const customerNote = noteLine("Ghi chú khách", event.order.customerNote);
    const channel = event.order.fulfillmentType ? `🚦 Kênh: ${fulfillmentLabel(event.order.fulfillmentType)}` : "";
    const status = event.order.status ? `📦 Đơn: ${orderStatusLabel(event.order.status)}` : "";
    const payment = event.order.paymentStatus ? `💳 Thanh toán: ${paymentStatusLabel(event.order.paymentStatus)}` : "";
    const deliveryStatus = event.order.deliveryStatus && event.order.deliveryStatus !== "none" ? `🛵 Giao hàng: ${deliveryStatusLabel(event.order.deliveryStatus)}` : "";
    const createdAt = event.order.createdAt ? `🕒 Tạo lúc: ${formatVietnamDateTime(event.order.createdAt)}` : "";
    const source = event.source ? `🔗 Nguồn: ${sourceLabel(event.source)}` : "";
    const headline = orderHeadline(event);
    return {
      title: testTitle(test, headline.title(code)),
      body: compactCard([
        `${testPrefix(test)}${headline.icon} <b>${escapeHtml(headline.title(code))}</b>`,
        orderItemsBlock(event.order.items, event.order.itemCount),
        moneyBreakdownBlock({
          subtotal: event.order.subtotal,
          discountAmount: event.order.discountAmount,
          deliveryFee: event.order.deliveryFee,
          serviceFee: event.order.serviceFee,
          total: event.order.total
        }),
        channel,
        location,
        deliveryAddress,
        deliveryDistance,
        customer,
        customerNote,
        status,
        payment,
        deliveryStatus,
        createdAt,
        source
      ]),
      viewPath: viewPath(test, `/dashboard/orders?orderId=${event.order.id}`)
    };
  }

  if (event.type === "payment.waiting_confirm" || event.type === "payment.received") {
    const code = event.payment.orderDisplayCode ?? shortId(event.payment.orderId);
    const customer = contactLine(event.payment.customerName, event.payment.customerPhone);
    const title = event.type === "payment.received" ? `Đã xác nhận thanh toán #${code}` : `VietQR cần xác nhận #${code}`;
    const channel = event.payment.fulfillmentType ? `🚦 Kênh: ${fulfillmentLabel(event.payment.fulfillmentType)}` : "";
    const location = event.payment.tableName ? `📍 Bàn: ${escapeHtml(singleLineText(event.payment.tableName))}` : "";
    const deliveryAddress = event.payment.deliveryAddress ? `📍 Địa chỉ giao: ${escapeHtml(singleLineText(event.payment.deliveryAddress))}` : "";
    const deliveryDistance = distanceLine(event.payment.deliveryDistanceKm);
    const customerNote = noteLine("Ghi chú khách", event.payment.customerNote);
    const status = event.payment.status ? `💳 Trạng thái thanh toán: ${paymentTransactionStatusLabel(event.payment.status)}` : "";
    const source = event.source ? `🔗 Nguồn: ${sourceLabel(event.source)}` : "";
    return {
      title: testTitle(test, title),
      body: compactCard([
        `${testPrefix(test)}💳 <b>${escapeHtml(title)}</b>`,
        `💳 Phương thức: ${paymentMethodLabel(event.payment.method)}`,
        moneyBreakdownBlock({
          subtotal: event.payment.orderSubtotal,
          discountAmount: event.payment.orderDiscountAmount,
          deliveryFee: event.payment.orderDeliveryFee,
          serviceFee: event.payment.orderServiceFee,
          total: event.payment.amount
        }),
        orderItemsBlock(event.payment.orderItems, event.payment.orderItems?.reduce((sum, item) => sum + item.quantity, 0) ?? 0),
        customer,
        customerNote,
        channel,
        location,
        deliveryAddress,
        deliveryDistance,
        status,
        source
      ]),
      viewPath: viewPath(test, `/dashboard/orders?orderId=${event.payment.orderId}`)
    };
  }

  if (
    event.type === "reservation.created" ||
    event.type === "reservation.deposit_submitted" ||
    event.type === "reservation.confirmed" ||
    event.type === "reservation.rejected" ||
    event.type === "reservation.cancelled" ||
    event.type === "reservation.checked_in" ||
    event.type === "reservation.seated" ||
    event.type === "reservation.no_show" ||
    event.type === "reservation.rescheduled"
  ) {
    const startsAt = new Intl.DateTimeFormat("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      timeZone: "Asia/Ho_Chi_Minh"
    }).format(new Date(event.reservation.startsAt));
    const previousStartsAt =
      event.type === "reservation.rescheduled" && event.reservation.previousStartsAt
        ? new Intl.DateTimeFormat("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "2-digit",
            timeZone: "Asia/Ho_Chi_Minh"
          }).format(new Date(event.reservation.previousStartsAt))
        : null;
    const customer = event.reservation.customerName ? `\n👤 ${escapeHtml(event.reservation.customerName)}` : "";
    const phone = event.reservation.customerPhone ? `\n☎️ ${escapeHtml(event.reservation.customerPhone)}` : "";
    const requiredDeposit = Number(event.reservation.depositRequiredAmount ?? 0);
    const paidDeposit = Number(event.reservation.depositPaidAmount ?? 0);
    const deposit = requiredDeposit > 0 ? `\n💳 Cọc ${money(paidDeposit > 0 ? paidDeposit : requiredDeposit)} · ${depositStatusLabel(event.reservation.depositStatus)}` : "";
    const tables = event.reservation.tableNames?.length ? `\n📍 ${event.reservation.tableNames.map(escapeHtml).join(", ")}` : "";
    const headline = reservationHeadline(event);
    const previous = previousStartsAt ? `\n↪️ Từ ${previousStartsAt}` : "";
    const preference = reservationPreferenceLine(event.reservation.preferredSeatingZone, event.reservation.preferredTableKind);
    const note = event.reservation.customerNote ? `\n📝 ${escapeHtml(compactText(event.reservation.customerNote, 160))}` : "";
    const hold = event.reservation.holdExpiresAt ? `\n⏳ Giữ tới ${formatVietnamDateTime(event.reservation.holdExpiresAt)}` : "";
    return {
      title: testTitle(test, headline.title),
      body: `${testPrefix(test)}${headline.icon} <b>${escapeHtml(headline.title)}</b>\n\n🕖 ${startsAt}${previous}\n👥 ${event.reservation.partySize} khách${deposit}${tables}${customer}${phone}${preference}${note}${hold}`,
      viewPath: viewPath(test, `/dashboard/reservations?reservationId=${event.reservation.id}`)
    };
  }

  if (event.type === "inventory.low") {
    const items = event.inventory.items.map((item) => `- ${escapeHtml(item)}`).join("\n");
    return {
      title: testTitle(test, "Tồn kho thấp"),
      body: `${testPrefix(test)}⚠️ <b>Tồn kho thấp</b>\n\n${items}`,
      viewPath: viewPath(test, "/dashboard/inventory")
    };
  }

  if (event.type === "menu.item_availability_suggested") {
    const title = event.menuItem.suggestedAvailable ? "Đề xuất mở bán lại món" : "Đề xuất tạm ẩn món";
    const reason = event.menuItem.reason ? `\n💬 ${escapeHtml(event.menuItem.reason)}` : "";
    return {
      title: testTitle(test, title),
      body: `${testPrefix(test)}🍽️ <b>${escapeHtml(title)}</b>\n\n${escapeHtml(event.menuItem.name)}${reason}`,
      viewPath: viewPath(test, `/dashboard/menu?itemId=${event.menuItem.id}`)
    };
  }

  if (event.type === "staff.checked_in") {
    const staff = event.staff.displayName ? escapeHtml(event.staff.displayName) : "Nhân sự";
    return {
      title: testTitle(test, "Nhân sự check-in"),
      body: `${testPrefix(test)}📍 <b>${staff} đã check-in</b>`,
      viewPath: viewPath(test, "/dashboard/staff")
    };
  }

  if (event.type === "service_request.created" || event.type === "service_request.resolved") {
    const title = event.type === "service_request.resolved" ? "Đã xử lý gọi phục vụ" : "Khách gọi phục vụ";
    const table = event.serviceRequest.tableName ? `\n📍 ${escapeHtml(event.serviceRequest.tableName)}` : "";
    const message = event.serviceRequest.message ? `\n💬 ${escapeHtml(event.serviceRequest.message)}` : "";
    return {
      title: testTitle(test, title),
      body: `${testPrefix(test)}🛎️ <b>${escapeHtml(title)}</b>${table}${message}`,
      viewPath: viewPath(test, "/dashboard")
    };
  }

  if (event.type === "staff.request_created" || event.type === "staff.request_reviewed") {
    const reviewed = event.type === "staff.request_reviewed";
    const title = reviewed ? staffReviewTitle(event.staffRequest.decision) : staffRequestTitle(event.staffRequest.requestType);
    const staff = event.staffRequest.staffName ? `\n👤 ${escapeHtml(event.staffRequest.staffName)}` : "";
    const reason = event.staffRequest.reason ? `\n💬 ${escapeHtml(event.staffRequest.reason)}` : "";
    const detail = staffRequestDetail(event.staffRequest.requestType, event.staffRequest.requestedPayload ?? {});
    return {
      title: testTitle(test, title),
      body: `${testPrefix(test)}${reviewed ? "✅" : "🧑‍🍳"} <b>${escapeHtml(title)}</b>${staff}${detail}${reason}`,
      viewPath: viewPath(test, `/dashboard/staff?approvalId=${event.staffRequest.id}`)
    };
  }

  if (event.type === "platform.alert") {
    const title = `${alertIcon(event.alert.severity)} ${event.alert.title}`;
    const summary = event.alert.summary ? `\n${escapeHtml(event.alert.summary)}` : "";
    return {
      title: testTitle(test, event.alert.title),
      body: `${testPrefix(test)}<b>${escapeHtml(title)}</b>${summary}`,
      viewPath: viewPath(test, "/dashboard/settings?section=notifications")
    };
  }

  const code = event.sla.displayCode ?? shortId(event.sla.orderId);
  return {
    title: testTitle(test, `Đơn #${code} trễ SLA`),
    body: `${testPrefix(test)}🚨 <b>Đơn #${escapeHtml(code)} trễ SLA ${event.sla.lateMinutes} phút</b>`,
    viewPath: viewPath(test, `/dashboard/orders?orderId=${event.sla.orderId}`)
  };
}

function orderHeadline(
  event: Extract<
    OperationalTelegramEvent,
    { type: "order.created" | "order.confirmed" | "order.completed" | "order.cancelled" | "order.delivery_status_changed" }
  >
) {
  if (event.type === "order.confirmed") return { icon: "👨‍🍳", title: (code: string) => `Đơn #${code} đã nhận` };
  if (event.type === "order.completed") return { icon: "✅", title: (code: string) => `Đơn #${code} đã xong` };
  if (event.type === "order.cancelled") return { icon: "🛑", title: (code: string) => `Đơn #${code} đã huỷ` };
  if (event.type === "order.delivery_status_changed") {
    return { icon: "🛵", title: (code: string) => `Đơn #${code}: ${deliveryStatusLabel(event.delivery.status)}` };
  }
  return { icon: "🔔", title: (code: string) => `Đơn mới #${code}` };
}

function reservationHeadline(
  event: Extract<
    OperationalTelegramEvent,
    {
      type:
        | "reservation.created"
        | "reservation.deposit_submitted"
        | "reservation.confirmed"
        | "reservation.rejected"
        | "reservation.cancelled"
        | "reservation.checked_in"
        | "reservation.seated"
        | "reservation.no_show"
        | "reservation.rescheduled";
    }
  >
) {
  if (event.type === "reservation.deposit_submitted") return { icon: "💳", title: "Khách báo đã chuyển cọc" };
  if (event.type === "reservation.confirmed") return { icon: "✅", title: "Đặt bàn đã xác nhận" };
  if (event.type === "reservation.rejected") return { icon: "🛑", title: "Đặt bàn đã từ chối" };
  if (event.type === "reservation.cancelled") return { icon: "🛑", title: "Đặt bàn đã huỷ" };
  if (event.type === "reservation.checked_in") return { icon: "📍", title: "Khách đã check-in" };
  if (event.type === "reservation.seated") return { icon: "🪑", title: "Khách đã vào bàn" };
  if (event.type === "reservation.no_show") return { icon: "⚠️", title: "Đặt bàn no-show" };
  if (event.type === "reservation.rescheduled") return { icon: "🔁", title: "Đặt bàn đổi giờ" };
  if (Number(event.reservation.depositRequiredAmount ?? 0) > 0) return { icon: "📅", title: "Đặt bàn mới · chờ cọc" };
  return { icon: "📅", title: "Đặt bàn mới" };
}

function fulfillmentLabel(value: string) {
  if (value === "DINE_IN") return "Tại bàn";
  if (value === "PICKUP") return "Mang đi";
  if (value === "DELIVERY") return "Giao hàng";
  return value;
}

function sourceLabel(value: string) {
  if (value === "customer_qr") return "QR tại quán";
  if (value === "online_ordering") return "Đặt online";
  if (value === "dashboard") return "Dashboard";
  if (value === "staff") return "Nhân viên";
  if (value === "telegram") return "Telegram";
  return value;
}

function paymentMethodLabel(value: string) {
  if (value === "QR") return "VietQR";
  if (value === "CASH") return "Tiền mặt";
  return value;
}

function paymentStatusLabel(value: string) {
  const labels: Record<string, string> = {
    unpaid: "Chưa thanh toán",
    waiting_payment: "Chờ khách thanh toán",
    waiting_confirm: "Chờ xác nhận tiền",
    paid: "Đã thanh toán",
    refunded: "Đã hoàn tiền"
  };
  return labels[value] ?? value;
}

function paymentTransactionStatusLabel(value: string) {
  const labels: Record<string, string> = {
    pending: "Chờ xử lý",
    waiting_confirm: "Chờ xác nhận tiền",
    confirmed: "Đã xác nhận",
    failed: "Thất bại",
    cancelled: "Đã huỷ",
    refunded: "Đã hoàn tiền"
  };
  return labels[value] ?? paymentStatusLabel(value);
}

function orderStatusLabel(value: string) {
  const labels: Record<string, string> = {
    pending: "Mới tạo",
    waiting_payment: "Chờ thanh toán",
    waiting_confirm: "Chờ xác nhận tiền",
    confirmed: "Đã nhận",
    preparing: "Đang chuẩn bị",
    completed: "Đã xong",
    served: "Đã phục vụ",
    cancelled: "Đã huỷ"
  };
  return labels[value] ?? value;
}

function depositStatusLabel(value?: string | null) {
  if (value === "waiting_payment") return "chờ khách chuyển";
  if (value === "waiting_confirm") return "chờ xác nhận";
  if (value === "paid") return "đã nhận";
  if (value === "refundable") return "cần hoàn";
  if (value === "refunded") return "đã hoàn";
  return "cần theo dõi";
}

function orderItemsBlock(items: OrderItemSnapshot[] | undefined, itemCount: number) {
  const totalQuantity = Number(itemCount) || items?.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0) || 0;
  if (!items?.length) return totalQuantity > 0 ? `🍜 Món: ${formatQuantity(totalQuantity)}` : "";
  return [`🍜 Món (${formatQuantity(totalQuantity)})`, ...items.map(formatOrderItemLine)].join("\n");
}

function formatOrderItemLine(item: OrderItemSnapshot) {
  const quantity = Number(item.quantity) || 0;
  const price = itemPriceText(item);
  const lines = [`• ${formatQuantity(quantity)}x ${escapeHtml(singleLineText(item.name))}${price ? ` · ${price}` : ""}`];
  if (item.modifierSummary) lines.push(`  Tuỳ chọn: ${escapeHtml(singleLineText(item.modifierSummary))}`);
  if (item.note) lines.push(`  Ghi chú món: ${escapeHtml(singleLineText(item.note))}`);
  return lines.join("\n");
}

function itemPriceText(item: OrderItemSnapshot) {
  const unitPrice = finiteMoney(item.unitPrice);
  const lineTotal = finiteMoney(item.lineTotal);
  if (unitPrice !== null && lineTotal !== null) return `${money(unitPrice)}/món = ${money(lineTotal)}`;
  if (lineTotal !== null) return money(lineTotal);
  if (unitPrice !== null) return `${money(unitPrice)}/món`;
  return "";
}

function moneyBreakdownBlock(input: {
  subtotal?: number | null;
  discountAmount?: number | null;
  deliveryFee?: number | null;
  serviceFee?: number | null;
  total: number;
}) {
  return [
    "💰 Tiền",
    moneyBreakdownLine("Tạm tính", input.subtotal),
    moneyBreakdownLine("Giảm giá", input.discountAmount),
    moneyBreakdownLine("Phí giao", input.deliveryFee),
    moneyBreakdownLine("Phí dịch vụ", input.serviceFee),
    `  Tổng cộng: ${money(input.total)}`
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function moneyBreakdownLine(label: string, amount?: number | null) {
  const value = finiteMoney(amount);
  return value === null ? "" : `  ${label}: ${money(value)}`;
}

function finiteMoney(value?: number | null) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function contactLine(name?: string | null, phone?: string | null) {
  const parts = [name, phone].filter((value): value is string => Boolean(value && value.trim())).map((value) => escapeHtml(singleLineText(value)));
  return parts.length ? `👤 Khách: ${parts.join(" · ")}` : "";
}

function noteLine(label: string, value?: string | null) {
  return value?.trim() ? `📝 ${label}: ${escapeHtml(singleLineText(value))}` : "";
}

function distanceLine(value?: number | null) {
  const distance = Number(value);
  return Number.isFinite(distance) && distance > 0 ? `🛵 Khoảng cách: ${formatDistance(distance)}` : "";
}

function formatDistance(value: number) {
  return `${value.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} km`;
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

function reservationPreferenceLine(zone?: string | null, kind?: string | null) {
  const zoneLabel = zone ? seatingZoneLabel(zone) : "";
  const kindLabel = kind ? tableKindLabel(kind) : "";
  const value = [zoneLabel, kindLabel].filter(Boolean).join(" · ");
  return value ? `\n🪑 ${escapeHtml(value)}` : "";
}

function seatingZoneLabel(value: string) {
  if (value === "indoor") return "Trong nhà";
  if (value === "outdoor") return "Ngoài trời";
  if (value === "mixed") return "Linh hoạt trong/ngoài";
  return value;
}

function tableKindLabel(value: string) {
  if (value === "standard") return "Bàn thường";
  if (value === "vip") return "Bàn VIP";
  if (value === "bar") return "Quầy bar";
  if (value === "community") return "Bàn chung";
  return value;
}

function formatVietnamDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh"
  }).format(new Date(value));
}

function compactCard(lines: Array<string | null | undefined | false>) {
  return lines.filter((line): line is string => Boolean(line && line.trim())).join("\n");
}

function compactText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}…`;
}

function singleLineText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function deliveryStatusLabel(value: string) {
  const labels: Record<string, string> = {
    requested: "chờ nhận giao",
    accepted: "đã nhận giao",
    out_for_delivery: "đang giao",
    delivered: "đã giao",
    rejected: "từ chối giao"
  };
  return labels[value] ?? value;
}

function staffRequestTitle(value: string) {
  if (value === "leave_request") return "Nhân sự xin nghỉ";
  if (value === "shift_swap") return "Nhân sự xin đổi ca";
  if (value === "overtime") return "Nhân sự xin tăng ca";
  if (value === "outside_location") return "Cần duyệt chấm công GPS";
  if (value === "shift_override") return "Cần duyệt ca đột xuất";
  if (value === "manual_clock_in") return "Cần duyệt chấm công tay";
  if (value === "device_restriction") return "Cần duyệt thiết bị";
  return "Yêu cầu nhân sự";
}

function staffReviewTitle(decision?: string) {
  if (decision === "approved") return "Yêu cầu nhân sự đã duyệt";
  if (decision === "rejected") return "Yêu cầu nhân sự bị từ chối";
  return "Yêu cầu nhân sự đã xử lý";
}

function staffRequestDetail(requestType: string, payload: Record<string, unknown>) {
  if (requestType === "leave_request") {
    const fromDate = payloadText(payload, "fromDate");
    const toDate = payloadText(payload, "toDate") ?? fromDate;
    const leaveTypeLabel = payloadText(payload, "leaveTypeLabel");
    return fromDate ? `\n📅 ${escapeHtml(fromDate === toDate ? fromDate : `${fromDate} → ${toDate}`)}${leaveTypeLabel ? ` · ${escapeHtml(leaveTypeLabel)}` : ""}` : "";
  }
  if (requestType === "shift_swap") {
    const shiftName = payloadText(payload, "shiftName");
    const scheduledDate = payloadText(payload, "scheduledDate");
    return shiftName || scheduledDate ? `\n🔁 ${escapeHtml([shiftName, scheduledDate].filter(Boolean).join(" · "))}` : "";
  }
  if (requestType === "overtime") {
    const overtimeDate = payloadText(payload, "overtimeDate") ?? payloadText(payload, "fromDate");
    const overtimeMinutes = payloadNumber(payload, "overtimeMinutes");
    return overtimeDate || overtimeMinutes ? `\n⏱️ ${escapeHtml([overtimeDate, overtimeMinutes ? `${overtimeMinutes} phút` : null].filter(Boolean).join(" · "))}` : "";
  }
  const distanceMeters = payloadNumber(payload, "distanceMeters");
  if (distanceMeters !== null) return `\n📍 Lệch ${distanceMeters}m`;
  return "";
}

function payloadText(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function payloadNumber(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function alertIcon(severity: string) {
  if (severity === "critical") return "🚨";
  if (severity === "warning") return "⚠️";
  return "ℹ️";
}

export function money(amount: number) {
  return `${Math.round(amount).toLocaleString("vi-VN")}đ`;
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function shortId(id: string) {
  return id.replaceAll("-", "").slice(0, 6).toUpperCase();
}

function isTestEvent(event: OperationalTelegramEvent) {
  return event.eventId.startsWith("telegram.test:");
}

function testTitle(test: boolean, title: string) {
  return test ? `TEST · ${title}` : title;
}

function testPrefix(test: boolean) {
  return test ? "🧪 <b>Thông báo test</b>\n\n" : "";
}

function viewPath(test: boolean, path: string) {
  return test ? "/dashboard/settings?section=notifications" : path;
}
