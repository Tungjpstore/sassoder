import type { OperationalTelegramEvent } from "./types.mjs";

export type FormattedTelegramCard = {
  title: string;
  body: string;
  viewPath?: string;
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
    const location = event.order.tableName ? `\n📍 ${escapeHtml(event.order.tableName)}` : "";
    const deliveryAddress =
      event.order.fulfillmentType === "DELIVERY" && event.order.deliveryAddress ? `\n📍 ${escapeHtml(event.order.deliveryAddress)}` : "";
    const customer = event.order.customerName ? `\n👤 ${escapeHtml(event.order.customerName)}` : "";
    const channel = event.order.fulfillmentType ? `\n🚦 ${fulfillmentLabel(event.order.fulfillmentType)}` : "";
    const headline = orderHeadline(event);
    return {
      title: testTitle(test, headline.title(code)),
      body: `${testPrefix(test)}${headline.icon} <b>${escapeHtml(headline.title(code))}</b>\n\n🍜 ${event.order.itemCount} món\n💰 ${money(event.order.total)}${channel}${location}${deliveryAddress}${customer}`,
      viewPath: viewPath(test, `/dashboard/orders?orderId=${event.order.id}`)
    };
  }

  if (event.type === "payment.waiting_confirm" || event.type === "payment.received") {
    const customer = event.payment.customerName ? `\n👤 ${escapeHtml(event.payment.customerName)}` : "";
    const title = event.type === "payment.received" ? "Đã xác nhận thanh toán" : "VietQR cần xác nhận";
    return {
      title: testTitle(test, title),
      body: `${testPrefix(test)}💳 <b>${escapeHtml(title)}</b>\n\n💰 ${money(event.payment.amount)}${customer}`,
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
    const requiredDeposit = Number(event.reservation.depositRequiredAmount ?? 0);
    const paidDeposit = Number(event.reservation.depositPaidAmount ?? 0);
    const deposit = requiredDeposit > 0 ? `\n💳 Cọc ${money(paidDeposit > 0 ? paidDeposit : requiredDeposit)}` : "";
    const tables = event.reservation.tableNames?.length ? `\n📍 ${event.reservation.tableNames.map(escapeHtml).join(", ")}` : "";
    const headline = reservationHeadline(event);
    const previous = previousStartsAt ? `\n↪️ Từ ${previousStartsAt}` : "";
    return {
      title: testTitle(test, headline.title),
      body: `${testPrefix(test)}${headline.icon} <b>${escapeHtml(headline.title)}</b>\n\n🕖 ${startsAt}${previous}\n👥 ${event.reservation.partySize} khách${deposit}${tables}${customer}`,
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
