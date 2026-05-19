import { fail, ok } from "@/lib/response";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { assertMapRateLimit, buildRateLimitHeaders, resolveDistanceAndEta } from "@/services/maps/provider-service";
import { mapRequestContext, parseCoordinateParam, parseOptionalRoutingProvider } from "@/services/maps/request-params";

export const preferredRegion = "sin1";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const originLat = parseCoordinateParam(searchParams.get("originLat"), "Vĩ độ điểm đi", -90, 90);
    const originLng = parseCoordinateParam(searchParams.get("originLng"), "Kinh độ điểm đi", -180, 180);
    const destinationLat = parseCoordinateParam(searchParams.get("destinationLat"), "Vĩ độ điểm đến", -90, 90);
    const destinationLng = parseCoordinateParam(searchParams.get("destinationLng"), "Kinh độ điểm đến", -180, 180);

    const rateLimit = await assertMapRateLimit(`maps:route:${await getRequestIpKey()}`, 18, 60_000);

    return ok(
      await resolveDistanceAndEta(
        { lat: originLat, lng: originLng },
        { lat: destinationLat, lng: destinationLng },
        {
          provider: parseOptionalRoutingProvider(searchParams.get("provider")),
          context: mapRequestContext(searchParams, "public_map_api")
        }
      ),
      { headers: buildRateLimitHeaders(rateLimit) }
    );
  } catch (error) {
    return fail(error);
  }
}
