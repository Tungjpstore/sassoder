import { z } from "zod";
import { fail, ok } from "@/lib/response";
import { assertInternalApiKey } from "@/services/telegram-connection-service";
import { writeAuditLog } from "@/services/audit-log-service";
import { acceptOrder, cancelOrder, getOrderLifecycleSnapshot, markOrderCompleted, updateOrderDeliveryStatus } from "@/services/order-service";
import { confirmPayment } from "@/services/payment-service";
import { confirmReservationDeposit, rejectReservation } from "@/services/reservation-service";
import { resolveServiceRequest } from "@/services/service-request-service";
import { updateMenuItemAvailability } from "@/services/menu-service";
import { reviewAttendanceApproval } from "@/features/attendance/services/attendance-service";
import { assertStaffActionPermission } from "@/services/staff-permission-service";
import type { StaffPermissionKey } from "@/lib/staff-permissions";
import type { SessionProfile } from "@/types/domain";

export const preferredRegion = "sin1";

const telegramActionSchema = z.object({
  actionId: z.string().uuid(),
  actionType: z.enum([
    "order.confirm",
    "order.cancel",
    "order.done",
    "delivery.accept",
    "delivery.out_for_delivery",
    "delivery.delivered",
    "delivery.reject",
    "payment.confirm",
    "menu_item.disable",
    "menu_item.enable",
    "service_request.resolve",
    "reservation.confirm",
    "reservation.reject",
    "staff_request.approve",
    "staff_request.reject"
  ]),
  restaurantId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  actorUserId: z.string().uuid(),
  actorRole: z.enum(["ADMIN", "STAFF"]),
  resourceType: z.enum(["order", "reservation", "service_request", "staff_request", "menu_item"]),
  resourceId: z.string().uuid(),
  payload: z.record(z.unknown()).optional()
});

const requiredPermissionByTelegramAction: Record<z.infer<typeof telegramActionSchema>["actionType"], StaffPermissionKey> = {
  "order.confirm": "orders.update",
  "order.cancel": "orders.cancel",
  "order.done": "orders.update",
  "delivery.accept": "orders.update",
  "delivery.out_for_delivery": "orders.update",
  "delivery.delivered": "orders.update",
  "delivery.reject": "orders.update",
  "payment.confirm": "payments.confirm",
  "menu_item.disable": "menu.edit",
  "menu_item.enable": "menu.edit",
  "service_request.resolve": "orders.update",
  "reservation.confirm": "reservations.manage",
  "reservation.reject": "reservations.manage",
  "staff_request.approve": "approvals.review",
  "staff_request.reject": "approvals.review"
};

export async function POST(request: Request) {
  try {
    assertInternalApiKey(request);
    const input = telegramActionSchema.parse(await request.json());
    await assertStaffActionPermission(telegramActionSession(input), requiredPermissionByTelegramAction[input.actionType]);
    const data = await executeTelegramAction(input);
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}

function telegramActionSession(input: z.infer<typeof telegramActionSchema>): SessionProfile {
  return {
    userId: input.actorUserId,
    email: "telegram@internal.logivn",
    role: input.actorRole,
    restaurantId: input.restaurantId,
    restaurant: {
      id: input.restaurantId,
      name: "LogiVN",
      slug: "telegram"
    }
  };
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

  if (input.resourceType === "service_request") {
    const data = await resolveServiceRequest(input.restaurantId, input.resourceId);
    await writeAuditLog({
      restaurantId: input.restaurantId,
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      action: `telegram.${input.actionType}`,
      entityType: "service_request",
      entityId: input.resourceId,
      afterData: data,
      branchId: input.branchId ?? null,
      metadata: { telegramActionId: input.actionId, payload: input.payload ?? {} }
    });
    return { message: "Đã xử lý yêu cầu.", result: data };
  }

  if (input.resourceType === "menu_item") {
    const enabled = input.actionType === "menu_item.enable";
    const data = await updateMenuItemAvailability(input.restaurantId, input.resourceId, enabled);
    await writeAuditLog({
      restaurantId: input.restaurantId,
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      action: `telegram.${input.actionType}`,
      entityType: "menu_item",
      entityId: input.resourceId,
      afterData: data,
      branchId: input.branchId ?? null,
      metadata: { telegramActionId: input.actionId, payload: input.payload ?? {} }
    });
    return { message: enabled ? "Đã mở bán món." : "Đã tạm ẩn món.", result: data };
  }

  if (input.resourceType === "staff_request") {
    const data = await executeStaffRequestAction(input);
    await writeAuditLog({
      restaurantId: input.restaurantId,
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      action: `telegram.${input.actionType}`,
      entityType: "staff_request",
      entityId: input.resourceId,
      afterData: data,
      branchId: input.branchId ?? null,
      metadata: { telegramActionId: input.actionId, payload: input.payload ?? {} }
    });
    return { message: "Đã xử lý yêu cầu nhân sự.", result: data };
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
  if (input.actionType === "order.done") return markOrderCompleted(input.restaurantId, input.resourceId, input.actorUserId);
  if (input.actionType === "order.cancel") return cancelOrder(input.restaurantId, input.resourceId, input.actorUserId);
  if (input.actionType === "delivery.accept") return updateOrderDeliveryStatus(input.restaurantId, input.resourceId, "accepted", input.actorUserId);
  if (input.actionType === "delivery.out_for_delivery") return updateOrderDeliveryStatus(input.restaurantId, input.resourceId, "out_for_delivery", input.actorUserId);
  if (input.actionType === "delivery.delivered") return updateOrderDeliveryStatus(input.restaurantId, input.resourceId, "delivered", input.actorUserId);
  if (input.actionType === "delivery.reject") return updateOrderDeliveryStatus(input.restaurantId, input.resourceId, "rejected", input.actorUserId);
  if (input.actionType === "payment.confirm") return confirmPayment(input.restaurantId, input.resourceId, input.actorUserId);
  throw new Error("Unsupported Telegram order action.");
}

async function executeReservationAction(input: z.infer<typeof telegramActionSchema>) {
  if (input.actionType === "reservation.confirm") return confirmReservationDeposit(input.restaurantId, input.resourceId);
  if (input.actionType === "reservation.reject") return rejectReservation(input.restaurantId, input.resourceId);
  throw new Error("Unsupported Telegram reservation action.");
}

async function executeStaffRequestAction(input: z.infer<typeof telegramActionSchema>) {
  if (input.actionType === "staff_request.approve" || input.actionType === "staff_request.reject") {
    return reviewAttendanceApproval({
      session: telegramActionSession(input),
      approvalId: input.resourceId,
      input: {
        decision: input.actionType === "staff_request.approve" ? "approved" : "rejected",
        note: typeof input.payload?.eventType === "string" ? `Telegram ${input.payload.eventType}` : "Telegram Ops"
      }
    });
  }
  throw new Error("Unsupported Telegram staff request action.");
}
