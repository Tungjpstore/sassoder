import { AppError, fail, ok } from "@/lib/response";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { assertMapRateLimit, getPlaceDetail } from "@/services/maps/provider-service";

export const preferredRegion = "sin1";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const placeId = searchParams.get("placeId")?.trim() ?? "";
    const sessionToken = searchParams.get("sessionToken");

    if (!placeId) throw new AppError("Thiếu placeId để lấy chi tiết địa chỉ.", 400);
    assertMapRateLimit(`maps:place-detail:${await getRequestIpKey()}`, 24, 60_000);

    const result = await getPlaceDetail(placeId, {
      sessionToken,
      context: { source: "public_map_api" }
    });

    if (!result) throw new AppError("Không lấy được chi tiết địa chỉ. Vui lòng thử tìm lại hoặc ghim trên bản đồ.", 404);
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
