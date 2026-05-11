import { AppError, fail, ok } from "@/lib/response";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { assertMapRateLimit, getMapRuntimeConfig, searchAddressPredictions } from "@/services/maps/provider-service";

export const preferredRegion = "sin1";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() ?? "";
    const limit = Number(searchParams.get("limit") ?? 5);
    const sessionToken = searchParams.get("sessionToken");
    const lat = Number(searchParams.get("lat"));
    const lng = Number(searchParams.get("lng"));
    const location = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;

    if (query.length < 3) throw new AppError("Nhập ít nhất 3 ký tự để tìm địa chỉ.", 400);
    assertMapRateLimit(`maps:autocomplete:${await getRequestIpKey()}`, 30, 60_000);

    return ok({
      config: getMapRuntimeConfig(),
      predictions: await searchAddressPredictions(query, {
        limit,
        sessionToken,
        location,
        context: { source: "public_map_api" }
      })
    });
  } catch (error) {
    return fail(error);
  }
}
