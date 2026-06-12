import { z } from "zod";

const isoDateTimeSchema = z.string().datetime({ offset: true });

export const platformAlertJobSchema = z.object({
  type: z.literal("platform.alert"),
  eventId: z.string().min(8).max(180),
  tenantId: z.string().min(1).optional(),
  restaurantId: z.string().uuid().optional(),
  branchId: z.string().nullable().optional(),
  occurredAt: isoDateTimeSchema.optional(),
  source: z.enum(["system", "devops", "telegram", "dashboard"]).optional(),
  alert: z.object({
    severity: z.enum(["critical", "warning", "info"]),
    title: z.string().min(1).max(160),
    summary: z.string().max(900).nullable().optional(),
    area: z.enum(["api", "web", "telegram", "queue", "database", "ai", "billing", "security", "other"]).optional()
  })
});

const nullableText = z.string().max(500).nullable().optional();
const optionalIsoDateTime = isoDateTimeSchema.nullable().optional();

const platformTenantSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(180),
  slug: z.string().max(120).nullable().optional(),
  businessType: z.string().max(80).nullable().optional(),
  tableCount: z.number().int().min(0).max(10000).nullable().optional(),
  contactEmail: z.string().max(180).nullable().optional(),
  hotline: z.string().max(80).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  platformStatus: z.string().max(40).nullable().optional(),
  createdAt: optionalIsoDateTime,
  planCode: z.string().max(60).nullable().optional(),
  planName: z.string().max(120).nullable().optional(),
  subscriptionStatus: z.string().max(60).nullable().optional(),
  trialEndsAt: optionalIsoDateTime,
  currentPeriodEnd: optionalIsoDateTime,
  requestedPlanCode: z.string().max(60).nullable().optional(),
  hasBankAccount: z.boolean().optional(),
  hasLocation: z.boolean().optional(),
  initialMenuItemCount: z.number().int().min(0).max(10000).nullable().optional()
});

const platformPaymentSchema = z.object({
  id: z.string().uuid(),
  restaurantId: z.string().uuid(),
  restaurantName: z.string().max(180).nullable().optional(),
  restaurantSlug: z.string().max(120).nullable().optional(),
  subscriptionId: z.string().uuid().nullable().optional(),
  planCode: z.string().max(60).nullable().optional(),
  planName: z.string().max(120).nullable().optional(),
  fromPlanCode: z.string().max(60).nullable().optional(),
  fromPlanName: z.string().max(120).nullable().optional(),
  amount: z.number().min(0).max(1_000_000_000),
  months: z.number().int().min(1).max(60),
  transferContent: z.string().max(180).nullable().optional(),
  billingAction: z.string().max(40).nullable().optional(),
  effectiveSummary: nullableText,
  effectiveAt: optionalIsoDateTime,
  subscriptionStatus: z.string().max(60).nullable().optional(),
  currentPeriodStart: optionalIsoDateTime,
  currentPeriodEnd: optionalIsoDateTime,
  trialEndsAt: optionalIsoDateTime,
  createdAt: optionalIsoDateTime,
  resolvedAt: optionalIsoDateTime,
  resolvedBy: z.string().max(180).nullable().optional(),
  rejectedReason: nullableText
});

const platformTenantStatusSchema = z.object({
  restaurantId: z.string().uuid(),
  restaurantName: z.string().max(180).nullable().optional(),
  restaurantSlug: z.string().max(120).nullable().optional(),
  previousStatus: z.string().max(40).nullable().optional(),
  status: z.enum(["active", "suspended", "deleted"]),
  reason: nullableText,
  actor: z.string().max(180).nullable().optional(),
  changedAt: optionalIsoDateTime
});

const platformSubscriptionStatusSchema = z.object({
  id: z.string().uuid(),
  restaurantId: z.string().uuid(),
  restaurantName: z.string().max(180).nullable().optional(),
  restaurantSlug: z.string().max(120).nullable().optional(),
  previousStatus: z.string().max(60).nullable().optional(),
  status: z.string().max(60),
  planCode: z.string().max(60).nullable().optional(),
  planName: z.string().max(120).nullable().optional(),
  currentPeriodEnd: optionalIsoDateTime,
  trialEndsAt: optionalIsoDateTime,
  reason: nullableText,
  changedAt: optionalIsoDateTime
});

const platformLogimailApprovalSchema = z.object({
  requestId: z.string().uuid(),
  requestType: z.enum(["account", "domain", "mailbox"]),
  requesterUserId: z.string().uuid().nullable().optional(),
  requesterEmail: z.string().max(180).nullable().optional(),
  workspaceId: z.string().uuid().nullable().optional(),
  workspaceName: z.string().max(180).nullable().optional(),
  workspaceSlug: z.string().max(120).nullable().optional(),
  targetValue: z.string().min(1).max(254),
  purpose: z.string().max(1000).nullable().optional(),
  domain: z.string().max(253).nullable().optional(),
  mailHostname: z.string().max(253).nullable().optional(),
  emailAddress: z.string().max(254).nullable().optional(),
  displayName: z.string().max(120).nullable().optional(),
  quotaMb: z.number().int().min(128).max(102400).nullable().optional(),
  riskFlags: z.array(z.string().max(80)).max(20).optional(),
  plannedRecordCount: z.number().int().min(0).max(200).optional(),
  createdAt: optionalIsoDateTime
});

export const platformTenantCreatedJobSchema = z.object({
  type: z.literal("platform.tenant.created"),
  eventId: z.string().min(8).max(180),
  tenantId: z.string().min(1).optional(),
  restaurantId: z.string().uuid(),
  branchId: z.string().nullable().optional(),
  occurredAt: isoDateTimeSchema.optional(),
  source: z.enum(["system", "devops", "telegram", "dashboard"]).optional(),
  tenant: platformTenantSchema
});

export const platformSubscriptionApprovalRequestedJobSchema = z.object({
  type: z.literal("platform.subscription.approval_requested"),
  eventId: z.string().min(8).max(180),
  tenantId: z.string().min(1).optional(),
  restaurantId: z.string().uuid(),
  branchId: z.string().nullable().optional(),
  occurredAt: isoDateTimeSchema.optional(),
  source: z.enum(["system", "devops", "telegram", "dashboard"]).optional(),
  payment: platformPaymentSchema
});

export const platformSubscriptionConfirmedJobSchema = z.object({
  type: z.literal("platform.subscription.confirmed"),
  eventId: z.string().min(8).max(180),
  tenantId: z.string().min(1).optional(),
  restaurantId: z.string().uuid(),
  branchId: z.string().nullable().optional(),
  occurredAt: isoDateTimeSchema.optional(),
  source: z.enum(["system", "devops", "telegram", "dashboard"]).optional(),
  payment: platformPaymentSchema
});

export const platformSubscriptionRejectedJobSchema = z.object({
  type: z.literal("platform.subscription.rejected"),
  eventId: z.string().min(8).max(180),
  tenantId: z.string().min(1).optional(),
  restaurantId: z.string().uuid(),
  branchId: z.string().nullable().optional(),
  occurredAt: isoDateTimeSchema.optional(),
  source: z.enum(["system", "devops", "telegram", "dashboard"]).optional(),
  payment: platformPaymentSchema
});

export const platformTenantStatusChangedJobSchema = z.object({
  type: z.literal("platform.tenant.status_changed"),
  eventId: z.string().min(8).max(180),
  tenantId: z.string().min(1).optional(),
  restaurantId: z.string().uuid(),
  branchId: z.string().nullable().optional(),
  occurredAt: isoDateTimeSchema.optional(),
  source: z.enum(["system", "devops", "telegram", "dashboard"]).optional(),
  tenantStatus: platformTenantStatusSchema
});

export const platformSubscriptionStatusChangedJobSchema = z.object({
  type: z.literal("platform.subscription.status_changed"),
  eventId: z.string().min(8).max(180),
  tenantId: z.string().min(1).optional(),
  restaurantId: z.string().uuid(),
  branchId: z.string().nullable().optional(),
  occurredAt: isoDateTimeSchema.optional(),
  source: z.enum(["system", "devops", "telegram", "dashboard"]).optional(),
  subscription: platformSubscriptionStatusSchema
});

export const platformLogimailApprovalRequestedJobSchema = z.object({
  type: z.literal("platform.logimail.approval_requested"),
  eventId: z.string().min(8).max(180),
  tenantId: z.string().min(1).optional(),
  restaurantId: z.string().uuid().optional(),
  branchId: z.string().nullable().optional(),
  occurredAt: isoDateTimeSchema.optional(),
  source: z.enum(["system", "devops", "telegram", "dashboard"]).optional(),
  logimail: platformLogimailApprovalSchema
});

export const platformTelegramJobSchema = z.discriminatedUnion("type", [
  platformAlertJobSchema,
  platformTenantCreatedJobSchema,
  platformSubscriptionApprovalRequestedJobSchema,
  platformLogimailApprovalRequestedJobSchema,
  platformSubscriptionConfirmedJobSchema,
  platformSubscriptionRejectedJobSchema,
  platformTenantStatusChangedJobSchema,
  platformSubscriptionStatusChangedJobSchema
]);

export type PlatformTelegramJob = z.infer<typeof platformTelegramJobSchema>;
export type PlatformAlertJob = z.infer<typeof platformAlertJobSchema>;
export type PlatformTenantCreatedJob = z.infer<typeof platformTenantCreatedJobSchema>;
export type PlatformSubscriptionApprovalRequestedJob = z.infer<typeof platformSubscriptionApprovalRequestedJobSchema>;
export type PlatformLogimailApprovalRequestedJob = z.infer<typeof platformLogimailApprovalRequestedJobSchema>;
export type PlatformSubscriptionConfirmedJob = z.infer<typeof platformSubscriptionConfirmedJobSchema>;
export type PlatformSubscriptionRejectedJob = z.infer<typeof platformSubscriptionRejectedJobSchema>;
export type PlatformTenantStatusChangedJob = z.infer<typeof platformTenantStatusChangedJobSchema>;
export type PlatformSubscriptionStatusChangedJob = z.infer<typeof platformSubscriptionStatusChangedJobSchema>;

export type PlatformTelegramRole = "DEV" | "SUPPORT" | "SRE" | "ADMIN";

export type PlatformTelegramConnection = {
  id: string;
  telegram_user_id: number;
  telegram_chat_id: number;
  telegram_username: string | null;
  display_name: string | null;
  role: PlatformTelegramRole;
  scopes: string[];
  status: string;
  platform_admin_user_id?: string | null;
};
