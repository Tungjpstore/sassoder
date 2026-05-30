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

export const platformTelegramJobSchema = z.discriminatedUnion("type", [platformAlertJobSchema]);

export type PlatformTelegramJob = z.infer<typeof platformTelegramJobSchema>;
export type PlatformAlertJob = z.infer<typeof platformAlertJobSchema>;

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
