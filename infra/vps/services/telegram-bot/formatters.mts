import type { OperationalTelegramEvent } from "./types.mjs";

export type FormattedTelegramCard = {
  title: string;
  body: string;
  viewPath?: string;
};

export function formatTelegramCard(event: OperationalTelegramEvent): FormattedTelegramCard {
  const test = isTestEvent(event);

  if (event.type === "order.created") {
    const code = event.order.displayCode ?? shortId(event.order.id);
    const location = event.order.tableName ? `\n📍 ${escapeHtml(event.order.tableName)}` : "";
    const customer = event.order.customerName ? `\n👤 ${escapeHtml(event.order.customerName)}` : "";
    return {
      title: testTitle(test, `Đơn mới #${code}`),
      body: `${testPrefix(test)}🔔 <b>Đơn mới #${escapeHtml(code)}</b>\n\n🍜 ${event.order.itemCount} món\n💰 ${money(event.order.total)}${location}${customer}`,
      viewPath: viewPath(test, `/dashboard/orders?orderId=${event.order.id}`)
    };
  }

  if (event.type === "order.confirmed") {
    const code = event.order.displayCode ?? shortId(event.order.id);
    const location = event.order.tableName ? `\n📍 ${escapeHtml(event.order.tableName)}` : "";
    const customer = event.order.customerName ? `\n👤 ${escapeHtml(event.order.customerName)}` : "";
    return {
      title: testTitle(test, `Đơn #${code} đã xác nhận`),
      body: `${testPrefix(test)}👨‍🍳 <b>Đơn #${escapeHtml(code)} đã xác nhận</b>\n\n🍜 ${event.order.itemCount} món\n💰 ${money(event.order.total)}${location}${customer}`,
      viewPath: viewPath(test, `/dashboard/orders?orderId=${event.order.id}`)
    };
  }

  if (event.type === "payment.waiting_confirm" || event.type === "payment.received") {
    const customer = event.payment.customerName ? `\n👤 ${escapeHtml(event.payment.customerName)}` : "";
    const title = event.type === "payment.received" ? "Đã nhận thanh toán" : "VietQR cần xác nhận";
    return {
      title: testTitle(test, title),
      body: `${testPrefix(test)}💳 <b>${escapeHtml(title)}</b>\n\n💰 ${money(event.payment.amount)}${customer}`,
      viewPath: viewPath(test, `/dashboard/orders?orderId=${event.payment.orderId}`)
    };
  }

  if (event.type === "reservation.created") {
    const startsAt = new Intl.DateTimeFormat("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      timeZone: "Asia/Ho_Chi_Minh"
    }).format(new Date(event.reservation.startsAt));
    const customer = event.reservation.customerName ? `\n👤 ${escapeHtml(event.reservation.customerName)}` : "";
    return {
      title: testTitle(test, "Đặt bàn mới"),
      body: `${testPrefix(test)}📅 <b>Đặt bàn mới</b>\n\n🕖 ${startsAt}\n👥 ${event.reservation.partySize} khách${customer}`,
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

  const code = event.sla.displayCode ?? shortId(event.sla.orderId);
  return {
    title: testTitle(test, `Đơn #${code} trễ SLA`),
    body: `${testPrefix(test)}🚨 <b>Đơn #${escapeHtml(code)} trễ SLA ${event.sla.lateMinutes} phút</b>`,
    viewPath: viewPath(test, `/dashboard/orders?orderId=${event.sla.orderId}`)
  };
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
