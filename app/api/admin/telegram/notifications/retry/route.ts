import { z } from "zod";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { retryTelegramNotifications } from "@/services/telegram-connection-service";

export const preferredRegion = "sin1";

const retryTelegramNotificationSchema = z.object({
  notificationId: z.string().uuid().nullable().optional(),
  limit: z.number().int().min(1).max(50).optional()
});

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request, { requireOrigin: true });
    const session = await requireOperationalDashboardApiSession({ permission: "notifications.manage" });
    const body = retryTelegramNotificationSchema.parse(await request.json().catch(() => ({})));
    return ok(await retryTelegramNotifications(session, body));
  } catch (error) {
    return fail(error);
  }
}
