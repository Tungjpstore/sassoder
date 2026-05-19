import { fail, ok } from "@/lib/response";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { MapApiError } from "@/services/maps/errors";
import { assertMapRateLimit, buildRateLimitHeaders, reverseGeocode } from "@/services/maps/provider-service";
import { mapRequestContext, parseCoordinateParam, parseOptionalGeocodingProvider } from "@/services/maps/request-params";

export const preferredRegion = "sin1";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = parseCoordinateParam(searchParams.get("lat"), "Vĩ độ", -90, 90);
    const lng = parseCoordinateParam(searchParams.get("lng"), "Kinh độ", -180, 180);

    const rateLimit = await assertMapRateLimit(`maps:reverse:${await getRequestIpKey()}`, 30, 60_000);
    const result = await reverseGeocode(
      { lat, lng },
      {
        provider: parseOptionalGeocodingProvider(searchParams.get("provider")),
        context: mapRequestContext(searchParams, "public_map_api")
      }
    );
    if (!result) throw new MapApiError("Không tìm được địa chỉ cho tọa độ này.", 404, "MAP_NO_RESULT");

    return ok(result, { headers: buildRateLimitHeaders(rateLimit) });
  } catch (error) {
    return fail(error);
  }
}
