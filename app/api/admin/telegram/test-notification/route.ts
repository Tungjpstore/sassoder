import { z } from "zod";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { sendTelegramTestNotification } from "@/services/telegram-connection-service";

export const preferredRegion = "sin1";

const telegramTestNotificationSchema = z.object({
  branchId: z.string().uuid().nullable().optional(),
  kind: z.enum(["order", "payment", "reservation", "inventory", "menu", "sla", "service", "staff"]).optional()
});

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request, { requireOrigin: true });
    const session = await requireOperationalDashboardApiSession({ permission: "notifications.manage" });
    const body = telegramTestNotificationSchema.parse(await request.json().catch(() => ({})));
    return ok(await sendTelegramTestNotification(session, body));
  } catch (error) {
    return fail(error);
  }
}
