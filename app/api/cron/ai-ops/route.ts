import { assertCronSecret } from "@/lib/cron/auth";
import { fail, ok } from "@/lib/response";
import { runAiOpsCron } from "@/services/ai-operation-cron-service";
import { normalizeOwnerAiIntent } from "@/services/ai-prompt-router";
import { runLoggedCron } from "@/services/cron-run-log-service";

export const runtime = "nodejs";
export const preferredRegion = "sin1";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    assertCronSecret(request);

    const url = new URL(request.url);
    const maxRestaurants = Number(url.searchParams.get("limit") ?? "25");
    const rawIntent = url.searchParams.get("intent");
    const intent = normalizeOwnerAiIntent(rawIntent, rawIntent ?? "overview");

    return ok(
      await runLoggedCron({
        request,
        jobKey: "ai-ops",
        metadata: { intent, maxRestaurants },
        run: () => runAiOpsCron({ maxRestaurants, intent }),
        statusFromResult: (result) => (result.failed > 0 || result.schemaMissing > 0 ? "warn" : "success"),
        summaryFromResult: (result) => ({
          scanned: result.scanned,
          generated: result.generated,
          persisted: result.persisted,
          skipped: result.skipped,
          failed: result.failed,
          schemaMissing: result.schemaMissing
        })
      })
    );
  } catch (error) {
    return fail(error);
  }
}
