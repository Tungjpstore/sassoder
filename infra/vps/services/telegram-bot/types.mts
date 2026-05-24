import { z } from "zod";

export const branchIdSchema = z.string().uuid().nullable().optional();

const baseEventSchema = z.object({
  eventId: z.string().min(8).max(160),
  restaurantId: z.string().uuid(),
  branchId: branchIdSchema,
  occurredAt: z.string().datetime().optional()
});

export const telegramActionSchema = z.enum([
  "order.confirm",
  "order.cancel",
  "order.done",
  "payment.confirm",
  "payment.amount_mismatch",
  "reservation.confirm",
  "reservation.reject"
]);

export type TelegramActionType = z.infer<typeof telegramActionSchema>;

export const requiredPermissionByAction: Record<TelegramActionType, string> = {
  "order.confirm": "orders.update",
  "order.cancel": "orders.cancel",
  "order.done": "orders.update",
  "payment.confirm": "payments.confirm",
  "payment.amount_mismatch": "payments.confirm",
  "reservation.confirm": "reservations.manage",
  "reservation.reject": "reservations.manage"
};

export const orderCreatedEventSchema = baseEventSchema.extend({
  type: z.literal("order.created"),
  order: z.object({
    id: z.string().uuid(),
    displayCode: z.string().min(1).max(40).optional(),
    itemCount: z.number().int().nonnegative(),
    total: z.number().nonnegative(),
    tableName: z.string().max(80).nullable().optional(),
    fulfillmentType: z.enum(["DINE_IN", "PICKUP", "DELIVERY"]).optional(),
    customerName: z.string().max(120).nullable().optional()
  })
});

export const orderConfirmedEventSchema = orderCreatedEventSchema.extend({
  type: z.literal("order.confirmed")
});

export const paymentWaitingConfirmEventSchema = baseEventSchema.extend({
  type: z.literal("payment.waiting_confirm"),
  payment: z.object({
    orderId: z.string().uuid(),
    billId: z.string().uuid().nullable().optional(),
    amount: z.number().nonnegative(),
    method: z.enum(["QR", "CASH"]).default("QR"),
    customerName: z.string().max(120).nullable().optional()
  })
});

export const paymentReceivedEventSchema = paymentWaitingConfirmEventSchema.extend({
  type: z.literal("payment.received")
});

export const reservationCreatedEventSchema = baseEventSchema.extend({
  type: z.literal("reservation.created"),
  reservation: z.object({
    id: z.string().uuid(),
    startsAt: z.string().datetime(),
    partySize: z.number().int().positive(),
    customerName: z.string().max(120).nullable().optional(),
    depositRequiredAmount: z.number().nonnegative().optional()
  })
});

export const inventoryLowEventSchema = baseEventSchema.extend({
  type: z.literal("inventory.low"),
  inventory: z.object({
    items: z.array(z.string().min(1).max(120)).min(1).max(20)
  })
});

export const slaWarningEventSchema = baseEventSchema.extend({
  type: z.literal("sla.warning"),
  sla: z.object({
    orderId: z.string().uuid(),
    displayCode: z.string().min(1).max(40).optional(),
    lateMinutes: z.number().int().positive()
  })
});

export const directTelegramMessageSchema = z.object({
  type: z.literal("telegram.send_message"),
  eventId: z.string().min(8).max(160),
  restaurantId: z.string().uuid().optional(),
  branchId: branchIdSchema,
  chatId: z.string().min(1),
  text: z.string().min(1).max(4096),
  parseMode: z.enum(["MarkdownV2", "HTML"]).optional()
});

export const telegramNotificationJobSchema = z.discriminatedUnion("type", [
  orderCreatedEventSchema,
  orderConfirmedEventSchema,
  paymentReceivedEventSchema,
  paymentWaitingConfirmEventSchema,
  reservationCreatedEventSchema,
  inventoryLowEventSchema,
  slaWarningEventSchema,
  directTelegramMessageSchema
]);

export type TelegramNotificationJob = z.infer<typeof telegramNotificationJobSchema>;
export type OperationalTelegramEvent = Exclude<TelegramNotificationJob, z.infer<typeof directTelegramMessageSchema>>;

export type TelegramConnection = {
  id: string;
  restaurant_id: string;
  branch_id: string | null;
  user_id: string;
  telegram_user_id: number;
  telegram_chat_id: number;
  telegram_username: string | null;
  restaurant_name: string | null;
  branch_name: string | null;
  role: "ADMIN" | "STAFF";
  permissions: string[];
  status: string;
};

export type CallbackActionRecord = {
  id: string;
  restaurant_id: string;
  branch_id: string | null;
  connection_id: string | null;
  notification_id: string | null;
  action_type: TelegramActionType;
  resource_type: string;
  resource_id: string;
  required_permission: string;
  payload: Record<string, unknown>;
  expires_at: string;
  used_at: string | null;
  status: string;
};
