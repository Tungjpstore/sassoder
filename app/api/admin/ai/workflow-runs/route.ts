import { z } from "zod";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { listRecentAiAutomationRuns, updateAiAutomationRunStatus } from "@/services/ai-automation-run-service";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

const updateSchema = z.object({
  runId: z.string().uuid(),
  status: z.enum(["approved", "dismissed", "completed"])
});

function readLimit(request: Request) {
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 12);
  return Number.isFinite(limit) ? Math.max(1, Math.min(50, Math.floor(limit))) : 12;
}

export async function GET(request: Request) {
  try {
    const session = await requireOperationalDashboardApiSession({ feature: "ai_owner_assistant" });
    return ok(await listRecentAiAutomationRuns(session.restaurantId, readLimit(request)));
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOriginRequest(request);
    const session = await requireOperationalDashboardApiSession({ adminOnly: true, feature: "ai_owner_assistant" });
    const body = updateSchema.parse(await request.json());
    return ok(
      await updateAiAutomationRunStatus({
        restaurantId: session.restaurantId,
        runId: body.runId,
        status: body.status,
        actorUserId: session.userId
      })
    );
  } catch (error) {
    return fail(error);
  }
}
