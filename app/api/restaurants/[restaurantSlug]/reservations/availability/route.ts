import { checkPersistentRateLimit } from "@/lib/persistent-rate-limit";
import { fail, ok, AppError } from "@/lib/response";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { reservationAvailabilitySchema } from "@/lib/validators";
import { getReservationAvailability } from "@/services/reservation-service";

export const preferredRegion = "sin1";

export async function GET(request: Request, { params }: { params: Promise<{ restaurantSlug: string }> }) {
  try {
    const { restaurantSlug } = await params;
    const ip = await getRequestIpKey();
    const allowed = await checkPersistentRateLimit({
      scope: "reservation_availability",
      identifier: restaurantSlug,
      ip,
      limit: 80,
      windowMs: 60_000
    });
    if (!allowed) {
      throw new AppError("Bạn thao tác quá nhanh. Vui lòng thử lại sau.", 429);
    }

    const url = new URL(request.url);
    const input = reservationAvailabilitySchema.parse({
      restaurantSlug,
      date: url.searchParams.get("date"),
      partySize: url.searchParams.get("partySize")
    });

    const result = await getReservationAvailability(input);
    return ok({
      restaurant: {
        name: result.restaurant.name,
        slug: result.restaurant.slug,
        reservationsEnabled: result.restaurant.reservations_enabled,
        reservationDurationMinutes: result.restaurant.reservation_duration_minutes,
        reservationBufferMinutes: result.restaurant.reservation_buffer_minutes
      },
      slots: result.slots
    });
  } catch (error) {
    return fail(error);
  }
}
