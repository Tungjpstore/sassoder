import { checkPersistentRateLimit } from "@/lib/persistent-rate-limit";
import { fail, ok, AppError } from "@/lib/response";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { createReservationSchema } from "@/lib/validators";
import { createReservation } from "@/services/reservation-service";

export const preferredRegion = "sin1";

export async function POST(request: Request) {
  try {
    const ip = await getRequestIpKey();
    const allowed = await checkPersistentRateLimit({
      scope: "reservation_create",
      identifier: "public",
      ip,
      limit: 12,
      windowMs: 60_000
    });
    if (!allowed) {
      throw new AppError("Bạn thao tác quá nhanh. Vui lòng thử lại sau.", 429);
    }

    const body = createReservationSchema.parse(await request.json().catch(() => ({})));

    // Chống lạm dụng đặt bàn (không cần OTP): giới hạn theo SĐT và theo thiết bị/IP mỗi ngày.
    // Ngăn bot bịa SĐT để giữ bàn ảo / no-show hàng loạt.
    const phoneKey = body.customerPhone.replace(/[^0-9]/g, "").slice(-12) || "unknown";
    const dayMs = 24 * 60 * 60 * 1000;
    const phoneAllowed = await checkPersistentRateLimit({
      scope: "reservation_create_phone",
      identifier: phoneKey,
      ip,
      limit: 10,
      windowMs: dayMs
    });
    if (!phoneAllowed) {
      throw new AppError("Số điện thoại này đã đặt bàn quá nhiều lần hôm nay. Vui lòng liên hệ quán để được hỗ trợ.", 429);
    }
    const ipDayAllowed = await checkPersistentRateLimit({
      scope: "reservation_create_ip_day",
      identifier: "public",
      ip,
      limit: 30,
      windowMs: dayMs
    });
    if (!ipDayAllowed) {
      throw new AppError("Thiết bị của bạn đã đặt bàn quá nhiều lần hôm nay. Vui lòng thử lại sau.", 429);
    }

    return ok(await createReservation(body), { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
