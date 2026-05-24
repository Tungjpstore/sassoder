import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { getTelegramOperationsStatus } from "@/services/telegram-connection-service";

export const preferredRegion = "sin1";

export async function GET() {
  try {
    const session = await requireOperationalDashboardApiSession({ permission: "notifications.manage" });
    return ok(await getTelegramOperationsStatus(session));
  } catch (error) {
    return fail(error);
  }
}
