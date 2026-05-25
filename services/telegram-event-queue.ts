import "server-only";

import { publishOperationalEvent, type OperationalEvent } from "@/services/operational-event-bus";
import type { OrderDto, PaymentMethod, ReservationDto, ServiceRequestDto } from "@/types/domain";

type TelegramQueueEvent = OperationalEvent;
type TelegramOrderSnapshot = Extract<OperationalEvent, { type: "order.created" }>["order"];
type TelegramReservationSnapshot = Extract<OperationalEvent, { type: "reservation.created" }>["reservation"];
type TelegramServiceRequestSnapshot = Extract<OperationalEvent, { type: "service_request.created" }>["serviceRequest"];

export async function enqueueTelegramNotification(event: TelegramQueueEvent) {
  return publishOperationalEvent(event);
}

export function buildTelegramOrderSnapshot(order: OrderDto): TelegramOrderSnapshot {
  return {
    id: order.id,
    displayCode: displayCode(order.id),
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    total: order.total,
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
    tableNames: reservation.tables.map((table) => table.name).filter(Boolean)
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
  amount: number;
  method: PaymentMethod;
  customerName?: string | null;
  status?: "pending" | "waiting_confirm" | "confirmed" | "failed" | "cancelled" | "refunded";
}) {
  return {
    orderId: input.orderId,
    billId: input.billId ?? null,
    amount: input.amount,
    method: input.method,
    customerName: input.customerName ?? null,
    status: input.status
  };
}

function displayCode(id: string) {
  return id.replaceAll("-", "").slice(0, 6).toUpperCase();
}
