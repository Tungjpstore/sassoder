import { z } from "zod";
import { fail, ok } from "@/lib/response";
import { assertInternalApiKey } from "@/services/telegram-connection-service";
import { runOwnerAssistant } from "@/services/ai-service";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

const aiOpsCommandSchema = z.object({
  command: z.enum(["doanhthu", "tinhhinh", "tonkho", "chat"]),
  message: z.string().trim().min(1).max(3000),
  intent: z.string().trim().max(80).optional(),
  restaurantId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  actorUserId: z.string().uuid(),
  actorRole: z.enum(["ADMIN", "STAFF"])
});

export async function POST(request: Request) {
  try {
    assertInternalApiKey(request);
    const input = aiOpsCommandSchema.parse(await request.json());
    const result = await runOwnerAssistant({
      restaurantId: input.restaurantId,
      userId: input.actorUserId,
      message: input.message,
      intent: input.intent,
      context: {
        surface: "telegram",
        command: input.command,
        branchId: input.branchId ?? null,
        actorRole: input.actorRole
      }
    });
    return ok({
      reply: result.reply,
      intent: result.intent,
      intentLabel: result.intentLabel,
      provider: result.provider,
      model: result.model,
      actions: result.actions?.slice(0, 3) ?? []
    });
  } catch (error) {
    return fail(error);
  }
}
