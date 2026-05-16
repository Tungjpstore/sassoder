import { fail, ok } from "@/lib/response";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { MapApiError } from "@/services/maps/errors";
import { assertMapRateLimit, buildRateLimitHeaders, getMapRuntimeConfig, searchAddress } from "@/services/maps/provider-service";

export const preferredRegion = "sin1";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() ?? "";
    const limit = Number(searchParams.get("limit") ?? 5);

    if (query.length < 3) throw new MapApiError("Nhập ít nhất 3 ký tự để tìm địa chỉ.", 400, "MAP_INVALID_REQUEST");
    const rateLimit = await assertMapRateLimit(`maps:search:${await getRequestIpKey()}`, 20, 60_000);

    return ok({
      config: getMapRuntimeConfig(),
      results: await searchAddress(query, { limit })
    }, { headers: buildRateLimitHeaders(rateLimit) });
  } catch (error) {
    return fail(error);
  }
}
