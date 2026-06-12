import { assertCronSecret } from "@/lib/cron/auth";
import { fail, ok } from "@/lib/response";
import { runLoggedCron } from "@/services/cron-run-log-service";
import { runLogimailSecurityCodeMaintenance } from "@/services/logimail-security-code-service";

export const runtime = "nodejs";
export const preferredRegion = "sin1";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    assertCronSecret(request);
    return ok(
      await runLoggedCron({
        request,
        jobKey: "logimail-security-codes",
        run: () => runLogimailSecurityCodeMaintenance({ actor: "vercel-cron:logimail-security-codes" }),
        statusFromResult: () => "success",
        summaryFromResult: (result) => ({
          rotated: result.rotated,
          pruned: result.pruned
        })
      })
    );
  } catch (error) {
    return fail(error);
  }
}
