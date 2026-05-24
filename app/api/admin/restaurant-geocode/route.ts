import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { AppError, fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { geocodeAddressWithMapbox, getRestaurantOrderingSettings } from "@/services/delivery-service";

export const preferredRegion = "sin1";

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const session = await requireOperationalDashboardApiSession({ feature: "delivery_basic" });

    const settings = await getRestaurantOrderingSettings(session.restaurantId);
    const address = settings.address?.trim();
    if (!address) {
      throw new AppError("Quán chưa có địa chỉ để tự lấy tọa độ.", 400);
    }

    const coordinate = await geocodeAddressWithMapbox(address);
    if (!coordinate) {
      throw new AppError("Không lấy được tọa độ từ địa chỉ hiện tại. Vui lòng kiểm tra địa chỉ quán hoặc cấu hình provider bản đồ.", 400);
    }

    return ok({
      address,
      lat: coordinate.lat,
      lng: coordinate.lng
    });
  } catch (error) {
    return fail(error);
  }
}
