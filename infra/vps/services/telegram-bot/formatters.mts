import type { OperationalTelegramEvent } from "./types.mjs";

export type FormattedTelegramCard = {
  title: string;
  body: string;
  viewPath?: string;
};

export function formatTelegramCard(event: OperationalTelegramEvent): FormattedTelegramCard {
  if (event.type === "order.created") {
    const code = event.order.displayCode ?? shortId(event.order.id);
    const location = event.order.tableName ? `\n📍 ${escapeHtml(event.order.tableName)}` : "";
    const customer = event.order.customerName ? `\n👤 ${escapeHtml(event.order.customerName)}` : "";
    return {
      title: `Đơn mới #${code}`,
      body: `🔔 <b>Đơn mới #${escapeHtml(code)}</b>\n\n🍜 ${event.order.itemCount} món\n💰 ${money(event.order.total)}${location}${customer}`,
      viewPath: `/dashboard/orders?orderId=${event.order.id}`
    };
  }

  if (event.type === "order.confirmed") {
    const code = event.order.displayCode ?? shortId(event.order.id);
    const location = event.order.tableName ? `\n📍 ${escapeHtml(event.order.tableName)}` : "";
    const customer = event.order.customerName ? `\n👤 ${escapeHtml(event.order.customerName)}` : "";
    return {
      title: `Đơn #${code} đã xác nhận`,
      body: `👨‍🍳 <b>Đơn #${escapeHtml(code)} đã xác nhận</b>\n\n🍜 ${event.order.itemCount} món\n💰 ${money(event.order.total)}${location}${customer}`,
      viewPath: `/dashboard/orders?orderId=${event.order.id}`
    };
  }

  if (event.type === "payment.waiting_confirm" || event.type === "payment.received") {
    const customer = event.payment.customerName ? `\n👤 ${escapeHtml(event.payment.customerName)}` : "";
    const title = event.type === "payment.received" ? "Đã nhận thanh toán" : "VietQR cần xác nhận";
    return {
      title,
      body: `💳 <b>${escapeHtml(title)}</b>\n\n💰 ${money(event.payment.amount)}${customer}`,
      viewPath: `/dashboard/orders?orderId=${event.payment.orderId}`
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
      title: "Đặt bàn mới",
      body: `📅 <b>Đặt bàn mới</b>\n\n🕖 ${startsAt}\n👥 ${event.reservation.partySize} khách${customer}`,
      viewPath: `/dashboard/reservations?reservationId=${event.reservation.id}`
    };
  }

  if (event.type === "inventory.low") {
    const items = event.inventory.items.map((item) => `- ${escapeHtml(item)}`).join("\n");
    return {
      title: "Tồn kho thấp",
      body: `⚠️ <b>Tồn kho thấp</b>\n\n${items}`,
      viewPath: "/dashboard/inventory"
    };
  }

  const code = event.sla.displayCode ?? shortId(event.sla.orderId);
  return {
    title: `Đơn #${code} trễ SLA`,
    body: `🚨 <b>Đơn #${escapeHtml(code)} trễ SLA ${event.sla.lateMinutes} phút</b>`,
    viewPath: `/dashboard/orders?orderId=${event.sla.orderId}`
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
