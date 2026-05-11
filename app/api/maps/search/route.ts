import { AppError, fail, ok } from "@/lib/response";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { assertMapRateLimit, getMapRuntimeConfig, searchAddress } from "@/services/maps/provider-service";

export const preferredRegion = "sin1";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() ?? "";
    const limit = Number(searchParams.get("limit") ?? 5);

    if (query.length < 3) throw new AppError("Nhập ít nhất 3 ký tự để tìm địa chỉ.", 400);
    assertMapRateLimit(`maps:search:${await getRequestIpKey()}`, 20, 60_000);

    return ok({
      config: getMapRuntimeConfig(),
      results: await searchAddress(query, { limit })
    });
  } catch (error) {
    return fail(error);
  }
}
