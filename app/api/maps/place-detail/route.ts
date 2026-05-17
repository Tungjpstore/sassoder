import { fail, ok } from "@/lib/response";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { MapApiError } from "@/services/maps/errors";
import { assertMapRateLimit, buildRateLimitHeaders, getPlaceDetail } from "@/services/maps/provider-service";
import { mapRequestContext } from "@/services/maps/request-params";

export const preferredRegion = "sin1";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const placeId = searchParams.get("placeId")?.trim() ?? "";
    const sessionToken = searchParams.get("sessionToken");

    if (!placeId) throw new MapApiError("Thiếu placeId để lấy chi tiết địa chỉ.", 400, "MAP_INVALID_REQUEST");
    const rateLimit = await assertMapRateLimit(`maps:place-detail:${await getRequestIpKey()}`, 24, 60_000);

    const result = await getPlaceDetail(placeId, {
      sessionToken,
      context: mapRequestContext(searchParams, "public_map_api")
    });

    if (!result) throw new MapApiError("Không lấy được chi tiết địa chỉ. Vui lòng thử tìm lại hoặc ghim trên bản đồ.", 404, "MAP_NO_RESULT");
    return ok(result, { headers: buildRateLimitHeaders(rateLimit) });
  } catch (error) {
    return fail(error);
  }
}
