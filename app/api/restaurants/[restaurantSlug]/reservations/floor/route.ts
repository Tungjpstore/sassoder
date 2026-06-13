import { checkPersistentRateLimit } from "@/lib/persistent-rate-limit";
import { AppError, fail, ok } from "@/lib/response";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { reservationFloorSchema } from "@/lib/validators";
import { getReservationFloor } from "@/services/reservation-service";

export const preferredRegion = "sin1";

export async function GET(request: Request, { params }: { params: Promise<{ restaurantSlug: string }> }) {
  try {
    const { restaurantSlug } = await params;
    const ip = await getRequestIpKey();
    const allowed = await checkPersistentRateLimit({
      scope: "reservation_floor",
      identifier: restaurantSlug,
      ip,
      limit: 80,
      windowMs: 60_000
    });
    if (!allowed) {
      throw new AppError("Bạn thao tác quá nhanh. Vui lòng thử lại sau.", 429);
    }

    const url = new URL(request.url);
    const input = reservationFloorSchema.parse({
      restaurantSlug,
      date: url.searchParams.get("date"),
      startsAt: url.searchParams.get("startsAt"),
      partySize: url.searchParams.get("partySize")
    });

    const result = await getReservationFloor(input);
    return ok({
      restaurant: {
        name: result.restaurant.name,
        slug: result.restaurant.slug,
        reservationsEnabled: result.restaurant.reservations_enabled
      },
      startsAt: result.startsAt,
      endsAt: result.endsAt,
      tables: result.tables
    });
  } catch (error) {
    return fail(error);
  }
}
