import { fail, ok } from "@/lib/response";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { MapApiError } from "@/services/maps/errors";
import { assertMapRateLimit, buildRateLimitHeaders } from "@/services/maps/provider-service";
import { parseCoordinateParam } from "@/services/maps/request-params";
import { resolveNearestStoreForRestaurantSlug } from "@/services/delivery-service";

export const preferredRegion = "sin1";

async function handleNearestStore(input: { restaurantSlug?: string | null; lat?: unknown; lng?: unknown }) {
  const rateLimit = await assertMapRateLimit(`location:nearest-store:${await getRequestIpKey()}`, 24, 60_000);
  const restaurantSlug = input.restaurantSlug?.trim();
  if (!restaurantSlug) {
    throw new MapApiError("Thiếu dữ liệu để tìm chi nhánh gần nhất.", 400, "MAP_INVALID_REQUEST");
  }

  const lat = typeof input.lat === "string"
    ? parseCoordinateParam(input.lat, "Vĩ độ", -90, 90)
    : parseCoordinateParam(String(input.lat ?? ""), "Vĩ độ", -90, 90);
  const lng = typeof input.lng === "string"
    ? parseCoordinateParam(input.lng, "Kinh độ", -180, 180)
    : parseCoordinateParam(String(input.lng ?? ""), "Kinh độ", -180, 180);

  return ok(
    await resolveNearestStoreForRestaurantSlug(restaurantSlug, { lat, lng }),
    { headers: buildRateLimitHeaders(rateLimit) }
  );
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    return await handleNearestStore({
      restaurantSlug: searchParams.get("restaurantSlug"),
      lat: searchParams.get("lat"),
      lng: searchParams.get("lng")
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { restaurantSlug?: string; lat?: number; lng?: number };
    return await handleNearestStore(body);
  } catch (error) {
    return fail(error);
  }
}
