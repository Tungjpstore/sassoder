import { AppError } from "@/lib/response";

export function assertCronSecret(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    if (process.env.VERCEL_ENV === "production") {
      throw new AppError("Thiếu CRON_SECRET", 500);
    }

    return;
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    throw new AppError("Không có quyền chạy cron", 401);
  }
}
