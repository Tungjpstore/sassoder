import { fail, ok } from "@/lib/response";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { MapApiError } from "@/services/maps/errors";
import { assertMapRateLimit, buildRateLimitHeaders, getRoute } from "@/services/maps/provider-service";

export const preferredRegion = "sin1";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const originLat = Number(searchParams.get("originLat"));
    const originLng = Number(searchParams.get("originLng"));
    const destinationLat = Number(searchParams.get("destinationLat"));
    const destinationLng = Number(searchParams.get("destinationLng"));

    if (![originLat, originLng, destinationLat, destinationLng].every(Number.isFinite)) {
      throw new MapApiError("Thiếu tọa độ để tính tuyến đường.", 400, "MAP_INVALID_REQUEST");
    }

    const rateLimit = await assertMapRateLimit(`maps:route:${await getRequestIpKey()}`, 18, 60_000);

    return ok(
      await getRoute(
        { lat: originLat, lng: originLng },
        { lat: destinationLat, lng: destinationLng }
      ),
      { headers: buildRateLimitHeaders(rateLimit) }
    );
  } catch (error) {
    return fail(error);
  }
}
