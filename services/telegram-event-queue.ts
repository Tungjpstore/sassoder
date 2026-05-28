import "server-only";

import { publishOperationalEvent, type OperationalEvent } from "@/services/operational-event-bus";
import type { OrderDto, PaymentMethod, ReservationDto, ServiceRequestDto } from "@/types/domain";

type TelegramQueueEvent = OperationalEvent;
type TelegramOrderSnapshot = Extract<OperationalEvent, { type: "order.created" }>["order"];
type TelegramReservationSnapshot = Extract<OperationalEvent, { type: "reservation.created" }>["reservation"];
type TelegramPaymentSnapshot = Extract<OperationalEvent, { type: "payment.waiting_confirm" }>["payment"];
type TelegramServiceRequestSnapshot = Extract<OperationalEvent, { type: "service_request.created" }>["serviceRequest"];

export async function enqueueTelegramNotification(event: TelegramQueueEvent) {
  return publishOperationalEvent(event);
}

export function buildTelegramOrderSnapshot(order: OrderDto): TelegramOrderSnapshot {
  const items = order.items.map((item) => {
    const name = item.menuItem?.name?.trim() || "Món";
    const quantity = Number(item.quantity) || 0;
    const unitPrice = Number(item.price) || 0;
    return {
      name,
      quantity,
      unitPrice,
      lineTotal: Math.round(quantity * unitPrice),
      note: item.note && item.note !== item.modifierSummary ? item.note : null,
      modifierSummary: item.modifierSummary || null
    };
  });

  return {
    id: order.id,
    displayCode: displayCode(order.id),
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    total: order.total,
    items,
    tableName: order.table?.name ?? null,
    fulfillmentType: order.fulfillmentType,
    customerName: order.customerName ?? null,
    customerPhone: order.customerPhone ?? null,
    status: order.status,
    paymentStatus: order.paymentStatus,
    deliveryStatus: order.deliveryStatus ?? null,
    deliveryAddress: order.deliveryAddress ?? null,
    serviceDueAt: order.serviceDueAt ?? null
  };
}

export function buildTelegramReservationSnapshot(
  reservation: ReservationDto,
  input: { previousStartsAt?: string | null } = {}
): TelegramReservationSnapshot & { previousStartsAt?: string | null } {
  return {
    id: reservation.id,
    startsAt: reservation.startsAt,
    previousStartsAt: input.previousStartsAt ?? null,
    partySize: reservation.partySize,
    customerName: reservation.customerName,
    customerPhone: reservation.customerPhone,
    depositRequiredAmount: reservation.depositRequiredAmount,
    depositPaidAmount: reservation.depositPaidAmount,
    status: reservation.status,
    depositStatus: reservation.depositStatus,
    tableNames: reservation.tables.map((table) => table.name).filter(Boolean),
    customerNote: reservation.customerNote,
    preferredSeatingZone: reservation.preferredSeatingZone,
    preferredTableKind: reservation.preferredTableKind,
    source: reservation.source,
    holdExpiresAt: reservation.holdExpiresAt
  };
}

export function buildTelegramServiceRequestSnapshot(request: ServiceRequestDto): TelegramServiceRequestSnapshot {
  return {
    id: request.id,
    tableId: request.tableId,
    tableName: request.tableName,
    type: request.type,
    message: request.message,
    status: request.status
  };
}

export function buildPaymentEventId(type: "payment.waiting_confirm" | "payment.received", input: { orderId: string; billId?: string | null }) {
  return `${type}:${input.billId ?? input.orderId}`;
}

export function buildPaymentSnapshot(input: {
  orderId: string;
  billId?: string | null;
  orderDisplayCode?: string | null;
  amount: number;
  method: PaymentMethod;
  customerName?: string | null;
  customerPhone?: string | null;
  fulfillmentType?: OrderDto["fulfillmentType"] | null;
  tableName?: string | null;
  deliveryAddress?: string | null;
  orderItems?: TelegramOrderSnapshot["items"];
  status?: "pending" | "waiting_confirm" | "confirmed" | "failed" | "cancelled" | "refunded";
}): TelegramPaymentSnapshot {
  return {
    orderId: input.orderId,
    billId: input.billId ?? null,
    orderDisplayCode: input.orderDisplayCode ?? displayCode(input.orderId),
    amount: input.amount,
    method: input.method,
    customerName: input.customerName ?? null,
    customerPhone: input.customerPhone ?? null,
    fulfillmentType: input.fulfillmentType ?? null,
    tableName: input.tableName ?? null,
    deliveryAddress: input.deliveryAddress ?? null,
    orderItems: input.orderItems ?? [],
    status: input.status
  };
}

function displayCode(id: string) {
  return id.replaceAll("-", "").slice(0, 6).toUpperCase();
}
