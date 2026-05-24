import { assertCronSecret } from "@/lib/cron/auth";
import { fail, ok } from "@/lib/response";
import { runLoggedCron } from "@/services/cron-run-log-service";
import { expireStaleRestaurantSubscriptions } from "@/services/subscription-service";

export const runtime = "nodejs";
export const preferredRegion = "sin1";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    assertCronSecret(request);
    return ok(
      await runLoggedCron({
        request,
        jobKey: "subscriptions",
        run: () => expireStaleRestaurantSubscriptions(),
        statusFromResult: (result) => (result.reminders.failed > 0 ? "warn" : "success"),
        summaryFromResult: (result) => ({
          expiredTrials: result.expiredTrials,
          pastDueSubscriptions: result.pastDueSubscriptions,
          remindersScanned: result.reminders.scanned,
          remindersSent: result.reminders.sent,
          remindersSkipped: result.reminders.skipped,
          remindersFailed: result.reminders.failed
        })
      })
    );
  } catch (error) {
    return fail(error);
  }
}
