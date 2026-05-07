import { headers } from "next/headers";
import { fail, ok, AppError } from "@/lib/response";
import { rateLimit } from "@/lib/rate-limit";
import { createReservationSchema } from "@/lib/validators";
import { createReservation } from "@/services/reservation-service";

export const preferredRegion = "sin1";

export async function POST(request: Request) {
  try {
    const headerStore = await headers();
    const ip = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    if (!rateLimit(`reservation:${ip}`, 12, 60_000)) {
      throw new AppError("Bạn thao tác quá nhanh. Vui lòng thử lại sau.", 429);
    }

    const body = createReservationSchema.parse(await request.json());
    return ok(await createReservation(body), { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
