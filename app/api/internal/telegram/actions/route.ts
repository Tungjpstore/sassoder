import { z } from "zod";
import { fail, ok } from "@/lib/response";
import { assertInternalApiKey } from "@/services/telegram-connection-service";
import { writeAuditLog } from "@/services/audit-log-service";
import { acceptOrder, cancelOrder, getOrderLifecycleSnapshot, markOrderCompleted } from "@/services/order-service";
import { confirmPayment } from "@/services/payment-service";
import { confirmReservationDeposit, rejectReservation } from "@/services/reservation-service";

export const preferredRegion = "sin1";

const telegramActionSchema = z.object({
  actionId: z.string().uuid(),
  actionType: z.enum([
    "order.confirm",
    "order.cancel",
    "order.done",
    "payment.confirm",
    "reservation.confirm",
    "reservation.reject"
  ]),
  restaurantId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  actorUserId: z.string().uuid(),
  actorRole: z.enum(["ADMIN", "STAFF"]),
  resourceType: z.enum(["order", "reservation"]),
  resourceId: z.string().uuid(),
  payload: z.record(z.unknown()).optional()
});

export async function POST(request: Request) {
  try {
    assertInternalApiKey(request);
    const input = telegramActionSchema.parse(await request.json());
    const data = await executeTelegramAction(input);
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}

async function executeTelegramAction(input: z.infer<typeof telegramActionSchema>) {
  if (input.resourceType === "order") {
    const before = await getOrderLifecycleSnapshot(input.restaurantId, input.resourceId);
    const data = await executeOrderAction(input);
    await writeAuditLog({
      restaurantId: input.restaurantId,
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      action: `telegram.${input.actionType}`,
      entityType: "order",
      entityId: input.resourceId,
      beforeData: before,
      afterData: data,
      branchId: input.branchId ?? null,
      metadata: { telegramActionId: input.actionId, payload: input.payload ?? {} }
    });
    return { message: "Đã cập nhật đơn.", result: data };
  }

  const data = await executeReservationAction(input);
  await writeAuditLog({
    restaurantId: input.restaurantId,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    action: `telegram.${input.actionType}`,
    entityType: "reservation",
    entityId: input.resourceId,
    afterData: data,
    branchId: input.branchId ?? null,
    metadata: { telegramActionId: input.actionId, payload: input.payload ?? {} }
  });
  return { message: "Đã cập nhật đặt bàn.", result: data };
}

async function executeOrderAction(input: z.infer<typeof telegramActionSchema>) {
  if (input.actionType === "order.confirm") return acceptOrder(input.restaurantId, input.resourceId, 15, input.actorUserId);
  if (input.actionType === "order.done") return markOrderCompleted(input.restaurantId, input.resourceId);
  if (input.actionType === "order.cancel") return cancelOrder(input.restaurantId, input.resourceId, input.actorUserId);
  if (input.actionType === "payment.confirm") return confirmPayment(input.restaurantId, input.resourceId);
  throw new Error("Unsupported Telegram order action.");
}

async function executeReservationAction(input: z.infer<typeof telegramActionSchema>) {
  if (input.actionType === "reservation.confirm") return confirmReservationDeposit(input.restaurantId, input.resourceId);
  if (input.actionType === "reservation.reject") return rejectReservation(input.restaurantId, input.resourceId);
  throw new Error("Unsupported Telegram reservation action.");
}
