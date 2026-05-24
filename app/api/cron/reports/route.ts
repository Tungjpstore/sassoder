import { assertCronSecret } from "@/lib/cron/auth";
import { fail, ok } from "@/lib/response";
import { runLoggedCron } from "@/services/cron-run-log-service";
import { sendDueScheduledReports } from "@/services/report-schedule-service";

export const runtime = "nodejs";
export const preferredRegion = "sin1";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    assertCronSecret(request);
    return ok(
      await runLoggedCron({
        request,
        jobKey: "reports",
        metadata: { maxBatches: 2 },
        run: () => sendDueScheduledReports({ maxBatches: 2 }),
        statusFromResult: (result) => (result.results.some((item) => item.status === "failed") || result.hasMore ? "warn" : "success"),
        summaryFromResult: (result) => ({
          batches: result.batches,
          hasMore: result.hasMore,
          processed: result.processed,
          sent: result.results.filter((item) => item.status === "sent").length,
          skipped: result.results.filter((item) => item.status === "skipped").length,
          failed: result.results.filter((item) => item.status === "failed").length
        })
      })
    );
  } catch (error) {
    return fail(error);
  }
}
