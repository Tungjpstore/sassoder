import { z } from "zod";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { getTelegramNotificationPolicies, updateTelegramNotificationPolicy } from "@/services/telegram-connection-service";

export const preferredRegion = "sin1";

const telegramPolicySchema = z.object({
  eventType: z.string().trim().regex(/^[a-z0-9_.*:-]{1,120}$/),
  branchId: z.string().uuid().nullable().optional(),
  enabled: z.boolean().optional(),
  recipientScope: z.enum(["permission", "admins", "branch", "silent"]).optional(),
  priority: z.number().int().min(1).max(10).optional(),
  escalationAfterSeconds: z.number().int().min(60).max(86400).nullable().optional(),
  digestEnabled: z.boolean().optional()
});

export async function GET() {
  try {
    const session = await requireOperationalDashboardApiSession({ permission: "notifications.manage" });
    return ok(await getTelegramNotificationPolicies(session));
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOriginRequest(request, { requireOrigin: true });
    const session = await requireOperationalDashboardApiSession({ permission: "notifications.manage" });
    const body = telegramPolicySchema.parse(await request.json().catch(() => ({})));
    return ok(await updateTelegramNotificationPolicy(session, body));
  } catch (error) {
    return fail(error);
  }
}
