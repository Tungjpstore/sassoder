import { AppError, fail, ok } from "@/lib/response";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { assertMapRateLimit, buildRateLimitHeaders } from "@/services/maps/provider-service";
import { resolveNearestStoreForRestaurantSlug } from "@/services/delivery-service";

export const preferredRegion = "sin1";

export async function POST(request: Request) {
  try {
    const rateLimit = await assertMapRateLimit(`location:nearest-store:${await getRequestIpKey()}`, 24, 60_000);
    const body = (await request.json()) as {
      restaurantSlug?: string;
      lat?: number;
      lng?: number;
    };

    if (!body.restaurantSlug || !Number.isFinite(body.lat) || !Number.isFinite(body.lng)) {
      throw new AppError("Thiếu dữ liệu để tìm chi nhánh gần nhất.", 400);
    }

    return ok(
      await resolveNearestStoreForRestaurantSlug(body.restaurantSlug, { lat: Number(body.lat), lng: Number(body.lng) }),
      { headers: buildRateLimitHeaders(rateLimit) }
    );
  } catch (error) {
    return fail(error);
  }
}
