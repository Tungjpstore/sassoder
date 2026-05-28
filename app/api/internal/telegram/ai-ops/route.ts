import { z } from "zod";
import { fail, ok } from "@/lib/response";
import { assertInternalApiKey, recordTelegramOwnerBriefing } from "@/services/telegram-connection-service";
import { runOwnerAssistant } from "@/services/ai-service";
import { assertStaffActionPermission } from "@/services/staff-permission-service";
import type { StaffPermissionKey } from "@/lib/staff-permissions";
import type { SessionProfile } from "@/types/domain";

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

const requiredPermissionByAiOpsCommand: Record<z.infer<typeof aiOpsCommandSchema>["command"], StaffPermissionKey> = {
  doanhthu: "reports.view",
  tinhhinh: "dashboard.view",
  tonkho: "inventory.view",
  chat: "dashboard.view"
};

export async function POST(request: Request) {
  try {
    assertInternalApiKey(request);
    const input = aiOpsCommandSchema.parse(await request.json());
    await assertStaffActionPermission(telegramAiOpsSession(input), requiredPermissionByAiOpsCommand[input.command]);
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
    const briefing = await recordTelegramOwnerBriefing({
      restaurantId: input.restaurantId,
      branchId: input.branchId ?? null,
      command: input.command,
      actorRole: input.actorRole,
      reply: result.reply,
      intent: result.intent,
      intentLabel: result.intentLabel,
      provider: result.provider,
      model: result.model,
      actions: result.actions?.slice(0, 5) ?? []
    });
    return ok({
      reply: result.reply,
      intent: result.intent,
      intentLabel: result.intentLabel,
      provider: result.provider,
      model: result.model,
      actions: result.actions?.slice(0, 3) ?? [],
      briefing
    });
  } catch (error) {
    return fail(error);
  }
}

function telegramAiOpsSession(input: z.infer<typeof aiOpsCommandSchema>): SessionProfile {
  return {
    userId: input.actorUserId,
    email: "telegram@internal.logivn",
    role: input.actorRole,
    restaurantId: input.restaurantId,
    restaurant: {
      id: input.restaurantId,
      name: "LogiVN",
      slug: "telegram"
    }
  };
}
