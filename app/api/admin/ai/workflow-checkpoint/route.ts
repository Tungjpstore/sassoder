import { z } from "zod";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { recordAiWorkflowCheckpoint } from "@/lib/ai/memory/restaurant-memory";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

const workflowCheckpointSchema = z.object({
  threadId: z.string().trim().min(6).max(200).optional(),
  status: z.enum(["approval_requested", "approved", "declined", "executed", "failed", "handoff"]),
  actionId: z.string().trim().max(160).optional(),
  actionLabel: z.string().trim().max(160).optional(),
  summary: z.string().trim().max(280).optional(),
  action: z.unknown().optional()
});

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const session = await requireOperationalDashboardApiSession({ feature: "ai_owner_assistant" });
    const body = workflowCheckpointSchema.parse(await request.json());

    return ok(
      await recordAiWorkflowCheckpoint({
        restaurantId: session.restaurantId,
        userId: session.userId,
        surface: "dashboard",
        threadId: body.threadId,
        status: body.status,
        action: body.action,
        actionId: body.actionId,
        actionLabel: body.actionLabel,
        summary: body.summary,
        source: "owner"
      })
    );
  } catch (error) {
    return fail(error);
  }
}
