import { fail, ok } from "@/lib/response";
import { assertInternalBackupRequest, getBackupHealth } from "@/services/backup-service";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function GET(request: Request) {
  try {
    assertInternalBackupRequest(request);
    const health = await getBackupHealth();
    return ok(health, {
      status: health.rpoRisk === "high" ? 503 : 200,
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return fail(error);
  }
}
