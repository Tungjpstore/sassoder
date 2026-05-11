import { AppError, fail, ok } from "@/lib/response";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { assertMapRateLimit, getRoute } from "@/services/maps/provider-service";

export const preferredRegion = "sin1";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const originLat = Number(searchParams.get("originLat"));
    const originLng = Number(searchParams.get("originLng"));
    const destinationLat = Number(searchParams.get("destinationLat"));
    const destinationLng = Number(searchParams.get("destinationLng"));

    if (![originLat, originLng, destinationLat, destinationLng].every(Number.isFinite)) {
      throw new AppError("Thiếu tọa độ để tính tuyến đường.", 400);
    }

    assertMapRateLimit(`maps:route:${await getRequestIpKey()}`, 18, 60_000);

    return ok(
      await getRoute(
        { lat: originLat, lng: originLng },
        { lat: destinationLat, lng: destinationLng }
      )
    );
  } catch (error) {
    return fail(error);
  }
}
