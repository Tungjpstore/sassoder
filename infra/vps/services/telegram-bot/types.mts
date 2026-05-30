import { z } from "zod";

export const branchIdSchema = z.string().uuid().nullable().optional();
const isoDateTimeSchema = z.string().datetime({ offset: true });

const baseEventSchema = z.object({
  eventId: z.string().min(8).max(160),
  restaurantId: z.string().uuid(),
  branchId: branchIdSchema,
  occurredAt: isoDateTimeSchema.optional(),
  actor: z
    .object({
      type: z.enum(["customer", "merchant", "staff", "telegram", "system", "dev"]),
      userId: z.string().uuid().nullable().optional(),
      role: z.string().max(80).nullable().optional(),
      permissions: z.array(z.string().max(120)).max(120).optional()
    })
    .optional(),
  source: z.enum(["customer_qr", "online_ordering", "dashboard", "staff", "telegram", "system", "devops"]).optional()
});

const orderItemSnapshotLimit = 500;
const orderItemDetailLimit = 1000;

const orderItemSnapshotSchema = z.object({
  name: z.string().min(1).max(160),
  quantity: z.number().nonnegative(),
  unitPrice: z.number().nonnegative().nullable().optional(),
  lineTotal: z.number().nonnegative().nullable().optional(),
  note: z.string().max(orderItemDetailLimit).nullable().optional(),
  modifierSummary: z.string().max(orderItemDetailLimit).nullable().optional()
});

export const telegramActionSchema = z.enum([
  "order.confirm",
  "order.cancel",
  "order.done",
  "delivery.accept",
  "delivery.out_for_delivery",
  "delivery.delivered",
  "delivery.reject",
  "payment.confirm",
  "payment.amount_mismatch",
  "menu_item.disable",
  "menu_item.enable",
  "service_request.resolve",
  "reservation.confirm",
  "reservation.reject",
  "staff_request.approve",
  "staff_request.reject"
]);

export type TelegramActionType = z.infer<typeof telegramActionSchema>;

export const requiredPermissionByAction: Record<TelegramActionType, string> = {
  "order.confirm": "orders.update",
  "order.cancel": "orders.cancel",
  "order.done": "orders.update",
  "delivery.accept": "orders.update",
  "delivery.out_for_delivery": "orders.update",
  "delivery.delivered": "orders.update",
  "delivery.reject": "orders.update",
  "payment.confirm": "payments.confirm",
  "payment.amount_mismatch": "payments.confirm",
  "menu_item.disable": "menu.edit",
  "menu_item.enable": "menu.edit",
  "service_request.resolve": "orders.update",
  "reservation.confirm": "reservations.manage",
  "reservation.reject": "reservations.manage",
  "staff_request.approve": "approvals.review",
  "staff_request.reject": "approvals.review"
};

export const orderCreatedEventSchema = baseEventSchema.extend({
  type: z.literal("order.created"),
  order: z.object({
    id: z.string().uuid(),
    displayCode: z.string().min(1).max(40).optional(),
    itemCount: z.number().int().nonnegative(),
    lineCount: z.number().int().nonnegative().optional(),
    subtotal: z.number().nonnegative().optional(),
    discountAmount: z.number().nonnegative().optional(),
    deliveryFee: z.number().nonnegative().optional(),
    serviceFee: z.number().nonnegative().optional(),
    total: z.number().nonnegative(),
    items: z.array(orderItemSnapshotSchema).max(orderItemSnapshotLimit).optional(),
    tableName: z.string().max(80).nullable().optional(),
    fulfillmentType: z.enum(["DINE_IN", "PICKUP", "DELIVERY"]).optional(),
    customerName: z.string().max(120).nullable().optional(),
    customerPhone: z.string().max(40).nullable().optional(),
    customerNote: z.string().max(500).nullable().optional(),
    status: z.string().max(40).optional(),
    paymentStatus: z.string().max(40).nullable().optional(),
    deliveryStatus: z.string().max(40).nullable().optional(),
    deliveryAddress: z.string().max(240).nullable().optional(),
    deliveryDistanceKm: z.number().nonnegative().nullable().optional(),
    createdAt: isoDateTimeSchema.nullable().optional(),
    acceptedAt: isoDateTimeSchema.nullable().optional(),
    servedAt: isoDateTimeSchema.nullable().optional(),
    serviceDueAt: isoDateTimeSchema.nullable().optional()
  })
});

export const orderConfirmedEventSchema = orderCreatedEventSchema.extend({
  type: z.literal("order.confirmed")
});

export const orderCompletedEventSchema = orderCreatedEventSchema.extend({
  type: z.literal("order.completed")
});

export const orderCancelledEventSchema = orderCreatedEventSchema.extend({
  type: z.literal("order.cancelled")
});

export const orderDeliveryStatusChangedEventSchema = orderCreatedEventSchema.extend({
  type: z.literal("order.delivery_status_changed"),
  delivery: z.object({
    previousStatus: z.string().max(40).nullable().optional(),
    status: z.string().min(1).max(40),
    courierId: z.string().uuid().nullable().optional(),
    courierName: z.string().max(120).nullable().optional()
  })
});

export const paymentWaitingConfirmEventSchema = baseEventSchema.extend({
  type: z.literal("payment.waiting_confirm"),
  payment: z.object({
    orderId: z.string().uuid(),
    billId: z.string().uuid().nullable().optional(),
    orderDisplayCode: z.string().max(40).nullable().optional(),
    amount: z.number().nonnegative(),
    method: z.enum(["QR", "CASH"]).default("QR"),
    orderSubtotal: z.number().nonnegative().nullable().optional(),
    orderDiscountAmount: z.number().nonnegative().nullable().optional(),
    orderDeliveryFee: z.number().nonnegative().nullable().optional(),
    orderServiceFee: z.number().nonnegative().nullable().optional(),
    customerName: z.string().max(120).nullable().optional(),
    customerPhone: z.string().max(40).nullable().optional(),
    customerNote: z.string().max(500).nullable().optional(),
    fulfillmentType: z.enum(["DINE_IN", "PICKUP", "DELIVERY"]).nullable().optional(),
    tableName: z.string().max(80).nullable().optional(),
    deliveryAddress: z.string().max(240).nullable().optional(),
    deliveryDistanceKm: z.number().nonnegative().nullable().optional(),
    orderItems: z.array(orderItemSnapshotSchema).max(orderItemSnapshotLimit).optional(),
    status: z.enum(["pending", "waiting_confirm", "confirmed", "failed", "cancelled", "refunded"]).optional()
  })
});

export const paymentReceivedEventSchema = paymentWaitingConfirmEventSchema.extend({
  type: z.literal("payment.received")
});

export const reservationCreatedEventSchema = baseEventSchema.extend({
  type: z.literal("reservation.created"),
  reservation: z.object({
    id: z.string().uuid(),
    startsAt: isoDateTimeSchema,
    partySize: z.number().int().positive(),
    customerName: z.string().max(120).nullable().optional(),
    customerPhone: z.string().max(40).nullable().optional(),
    depositRequiredAmount: z.number().nonnegative().optional(),
    depositPaidAmount: z.number().nonnegative().optional(),
    status: z.string().max(40).optional(),
    depositStatus: z.string().max(40).nullable().optional(),
    tableNames: z.array(z.string().min(1).max(80)).max(10).optional(),
    customerNote: z.string().max(500).nullable().optional(),
    preferredSeatingZone: z.string().max(80).nullable().optional(),
    preferredTableKind: z.string().max(80).nullable().optional(),
    source: z.string().max(80).nullable().optional(),
    holdExpiresAt: isoDateTimeSchema.nullable().optional()
  })
});

export const reservationDepositSubmittedEventSchema = reservationCreatedEventSchema.extend({
  type: z.literal("reservation.deposit_submitted")
});

export const reservationConfirmedEventSchema = reservationCreatedEventSchema.extend({
  type: z.literal("reservation.confirmed")
});

export const reservationRejectedEventSchema = reservationCreatedEventSchema.extend({
  type: z.literal("reservation.rejected")
});

export const reservationCancelledEventSchema = reservationCreatedEventSchema.extend({
  type: z.literal("reservation.cancelled")
});

export const reservationCheckedInEventSchema = reservationCreatedEventSchema.extend({
  type: z.literal("reservation.checked_in")
});

export const reservationSeatedEventSchema = reservationCreatedEventSchema.extend({
  type: z.literal("reservation.seated")
});

export const reservationNoShowEventSchema = reservationCreatedEventSchema.extend({
  type: z.literal("reservation.no_show")
});

export const reservationRescheduledEventSchema = reservationCreatedEventSchema.extend({
  type: z.literal("reservation.rescheduled"),
  reservation: reservationCreatedEventSchema.shape.reservation.extend({
    previousStartsAt: isoDateTimeSchema.nullable().optional()
  })
});

export const inventoryLowEventSchema = baseEventSchema.extend({
  type: z.literal("inventory.low"),
  inventory: z.object({
    items: z.array(z.string().min(1).max(120)).min(1).max(20)
  })
});

export const menuItemAvailabilitySuggestedEventSchema = baseEventSchema.extend({
  type: z.literal("menu.item_availability_suggested"),
  menuItem: z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(160),
    currentAvailable: z.boolean(),
    suggestedAvailable: z.boolean(),
    reason: z.string().max(500).nullable().optional()
  })
});

export const staffCheckedInEventSchema = baseEventSchema.extend({
  type: z.literal("staff.checked_in"),
  staff: z.object({
    userId: z.string().uuid(),
    staffId: z.string().uuid().nullable().optional(),
    displayName: z.string().max(120).nullable().optional()
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

export const serviceRequestCreatedEventSchema = baseEventSchema.extend({
  type: z.literal("service_request.created"),
  serviceRequest: z.object({
    id: z.string().uuid(),
    tableId: z.string().uuid().nullable().optional(),
    tableName: z.string().max(80).nullable().optional(),
    type: z.literal("CALL_STAFF"),
    message: z.string().max(500).nullable().optional(),
    status: z.string().max(40).optional()
  })
});

export const serviceRequestResolvedEventSchema = serviceRequestCreatedEventSchema.extend({
  type: z.literal("service_request.resolved")
});

const staffRequestPayloadSchema = z.object({
  id: z.string().uuid(),
  requestType: z.enum([
    "outside_location",
    "attendance_edit",
    "overtime",
    "shift_override",
    "manual_clock_in",
    "leave_request",
    "shift_swap",
    "device_restriction"
  ]),
  staffMemberId: z.string().uuid(),
  staffName: z.string().max(120).nullable().optional(),
  status: z.enum(["pending", "approved", "rejected", "cancelled"]).optional(),
  decision: z.enum(["approved", "rejected"]).optional(),
  reason: z.string().max(500).nullable().optional(),
  requestedPayload: z.record(z.string(), z.unknown()).nullable().optional()
});

export const staffRequestCreatedEventSchema = baseEventSchema.extend({
  type: z.literal("staff.request_created"),
  staffRequest: staffRequestPayloadSchema
});

export const staffRequestReviewedEventSchema = baseEventSchema.extend({
  type: z.literal("staff.request_reviewed"),
  staffRequest: staffRequestPayloadSchema
});

export const platformAlertEventSchema = baseEventSchema.extend({
  type: z.literal("platform.alert"),
  alert: z.object({
    severity: z.enum(["critical", "warning", "info"]),
    title: z.string().min(1).max(120),
    summary: z.string().max(500).nullable().optional(),
    area: z.enum(["api", "web", "telegram", "queue", "database", "ai", "billing", "security", "other"]).optional()
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
  orderCompletedEventSchema,
  orderCancelledEventSchema,
  orderDeliveryStatusChangedEventSchema,
  paymentReceivedEventSchema,
  paymentWaitingConfirmEventSchema,
  reservationCreatedEventSchema,
  reservationDepositSubmittedEventSchema,
  reservationConfirmedEventSchema,
  reservationRejectedEventSchema,
  reservationCancelledEventSchema,
  reservationCheckedInEventSchema,
  reservationSeatedEventSchema,
  reservationNoShowEventSchema,
  reservationRescheduledEventSchema,
  inventoryLowEventSchema,
  menuItemAvailabilitySuggestedEventSchema,
  staffCheckedInEventSchema,
  slaWarningEventSchema,
  serviceRequestCreatedEventSchema,
  serviceRequestResolvedEventSchema,
  staffRequestCreatedEventSchema,
  staffRequestReviewedEventSchema,
  platformAlertEventSchema,
  directTelegramMessageSchema
]);

export type TelegramNotificationJob = z.infer<typeof telegramNotificationJobSchema>;
export type OperationalTelegramEvent = Exclude<TelegramNotificationJob, z.infer<typeof directTelegramMessageSchema>>;

export type TelegramConnection = {
  id: string;
  restaurant_id: string;
  branch_id: string | null;
  user_id: string;
  staff_member_id: string | null;
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
