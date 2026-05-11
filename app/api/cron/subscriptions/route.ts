import { assertCronSecret } from "@/lib/cron/auth";
import { fail, ok } from "@/lib/response";
import { expireStaleRestaurantSubscriptions } from "@/services/subscription-service";

export const runtime = "nodejs";
export const preferredRegion = "sin1";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    assertCronSecret(request);
    return ok(await expireStaleRestaurantSubscriptions());
  } catch (error) {
    return fail(error);
  }
}
