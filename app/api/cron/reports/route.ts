import { assertCronSecret } from "@/lib/cron/auth";
import { fail, ok } from "@/lib/response";
import { sendDueScheduledReports } from "@/services/report-schedule-service";

export const runtime = "nodejs";
export const preferredRegion = "sin1";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    assertCronSecret(request);
    return ok(await sendDueScheduledReports({ maxBatches: 2 }));
  } catch (error) {
    return fail(error);
  }
}
