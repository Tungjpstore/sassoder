import { z } from "zod";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { revokeTelegramPendingConnectTokens } from "@/services/telegram-connection-service";

export const preferredRegion = "sin1";

const revokeConnectTokenSchema = z.object({
  branchId: z.string().uuid().nullable().optional()
});

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request, { requireOrigin: true });
    const session = await requireOperationalDashboardApiSession({ permission: "notifications.manage" });
    const body = revokeConnectTokenSchema.parse(await request.json().catch(() => ({})));
    return ok(await revokeTelegramPendingConnectTokens(session, { branchId: body.branchId ?? null }));
  } catch (error) {
    return fail(error);
  }
}
