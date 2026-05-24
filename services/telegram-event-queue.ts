import "server-only";

import { publishOperationalEvent, type OperationalEvent } from "@/services/operational-event-bus";

type TelegramQueueEvent = Extract<
  OperationalEvent,
  { type: "order.created" | "order.confirmed" | "payment.waiting_confirm" | "reservation.created" }
>;

export async function enqueueTelegramNotification(event: TelegramQueueEvent) {
  return publishOperationalEvent(event);
}
