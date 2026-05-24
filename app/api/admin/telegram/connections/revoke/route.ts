import { z } from "zod";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { revokeTelegramConnection } from "@/services/telegram-connection-service";

export const preferredRegion = "sin1";

const revokeTelegramConnectionSchema = z.object({
  connectionId: z.string().uuid()
});

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request, { requireOrigin: true });
    const session = await requireOperationalDashboardApiSession({ permission: "notifications.manage" });
    const body = revokeTelegramConnectionSchema.parse(await request.json().catch(() => ({})));
    return ok(await revokeTelegramConnection(session, body));
  } catch (error) {
    return fail(error);
  }
}
