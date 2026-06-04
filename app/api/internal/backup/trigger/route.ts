import { z } from "zod";
import { fail, ok } from "@/lib/response";
import { assertInternalBackupRequest, requestManualBackup } from "@/services/backup-service";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

const triggerSchema = z.object({
  actor: z.string().trim().min(2).max(180).default("platform-admin"),
  reason: z.string().trim().max(300).optional(),
  retentionClass: z.enum(["daily", "weekly", "monthly", "manual"]).default("manual")
});

export async function POST(request: Request) {
  try {
    assertInternalBackupRequest(request);
    const body = triggerSchema.parse(await request.json().catch(() => ({})));
    const job = await requestManualBackup(body);
    return ok({
      ...job,
      executor: "infra/vps/scripts/backup.sh --claim-manual",
      expectedPickup: "*/5 * * * * cron on the VPS"
    }, { status: 202 });
  } catch (error) {
    return fail(error);
  }
}
