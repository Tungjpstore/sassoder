import { assertCronSecret } from "@/lib/cron/auth";
import { fail, ok } from "@/lib/response";
import { runLoggedCron } from "@/services/cron-run-log-service";
import { runReservationLifecycleAutomation } from "@/services/reservation-service";

export const runtime = "nodejs";
export const preferredRegion = "sin1";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    assertCronSecret(request);
    return ok(
      await runLoggedCron({
        request,
        jobKey: "reservations-expire",
        metadata: { maxBatches: 8 },
        run: () => runReservationLifecycleAutomation(undefined, { maxBatches: 8 }),
        statusFromResult: (result) => (result.hasMore ? "warn" : "success"),
        summaryFromResult: (result) => ({
          holdBatches: result.holds.batches,
          expired: result.holds.expired,
          noShowBatches: result.noShows.batches,
          noShowScanned: result.noShows.scanned,
          noShow: result.noShows.noShow,
          hasMore: result.hasMore
        })
      })
    );
  } catch (error) {
    return fail(error);
  }
}
