import { fail, ok } from "@/lib/response";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { MapApiError } from "@/services/maps/errors";
import { assertMapRateLimit, buildRateLimitHeaders, reverseGeocode } from "@/services/maps/provider-service";

export const preferredRegion = "sin1";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = Number(searchParams.get("lat"));
    const lng = Number(searchParams.get("lng"));

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new MapApiError("Thiếu tọa độ để reverse geocode.", 400, "MAP_INVALID_REQUEST");
    }

    const rateLimit = await assertMapRateLimit(`maps:reverse:${await getRequestIpKey()}`, 30, 60_000);

    return ok(await reverseGeocode({ lat, lng }), { headers: buildRateLimitHeaders(rateLimit) });
  } catch (error) {
    return fail(error);
  }
}
