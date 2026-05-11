import { assertCronSecret } from "@/lib/cron/auth";
import { fail, ok } from "@/lib/response";
import { expireReservationHolds } from "@/services/reservation-service";

export const runtime = "nodejs";
export const preferredRegion = "sin1";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    assertCronSecret(request);
    return ok(await expireReservationHolds(undefined, { maxBatches: 8 }));
  } catch (error) {
    return fail(error);
  }
}
