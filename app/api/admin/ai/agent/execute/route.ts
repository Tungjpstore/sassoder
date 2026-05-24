import { z } from "zod";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { executeOwnerAgentCommand } from "@/services/ai-owner-agent-executor";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

const executeSchema = z.object({
  message: z.string().trim().min(1).max(3000).default("Chạy AI owner agent."),
  domain: z.string().trim().max(80).optional(),
  intent: z.string().trim().max(80).optional(),
  command: z.string().trim().max(120).optional(),
  confirm: z.boolean().optional(),
  approvalToken: z.string().trim().max(3000).optional(),
  mode: z.enum(["plan", "draft", "execute"]).optional(),
  context: z.record(z.unknown()).optional()
});

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const session = await requireOperationalDashboardApiSession({ adminOnly: true, feature: "ai_owner_assistant" });
    const body = executeSchema.parse(await request.json());
    return ok(
      await executeOwnerAgentCommand({
        restaurantId: session.restaurantId,
        userId: session.userId,
        message: body.message,
        domain: body.domain,
        intent: body.intent,
        command: body.command,
        confirm: body.confirm,
        approvalToken: body.approvalToken,
        mode: body.mode,
        context: body.context
      })
    );
  } catch (error) {
    return fail(error);
  }
}
