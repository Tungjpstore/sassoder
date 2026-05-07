import { AppError, fail, ok } from "@/lib/response";
import { sendDueScheduledReports } from "@/services/report-schedule-service";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

function assertCronSecret(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.VERCEL_ENV === "production") {
      throw new AppError("Thiếu CRON_SECRET", 500);
    }
    return;
  }

  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${secret}`) {
    throw new AppError("Không có quyền chạy cron", 401);
  }
}

export async function GET(request: Request) {
  try {
    assertCronSecret(request);
    return ok(await sendDueScheduledReports());
  } catch (error) {
    return fail(error);
  }
}
