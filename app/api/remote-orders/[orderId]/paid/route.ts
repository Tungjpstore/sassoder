import { checkPersistentRateLimit } from "@/lib/persistent-rate-limit";
import { AppError, fail, ok } from "@/lib/response";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { remoteOrderAccessSchema } from "@/lib/validators";
import { getRemotePublicOrder } from "@/services/order-service";
import { markRemoteCustomerPaid } from "@/services/payment-service";

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params;
    const ip = await getRequestIpKey();
    const allowed = await checkPersistentRateLimit({
      scope: "remote_order_paid",
      identifier: orderId,
      ip,
      limit: 8,
      windowMs: 60_000
    });
    if (!allowed) {
      throw new AppError("Bạn thao tác thanh toán quá nhanh. Vui lòng thử lại sau.", 429);
    }
    const body = remoteOrderAccessSchema.parse(await request.json().catch(() => ({})));
    await markRemoteCustomerPaid(orderId, body);
    return ok(await getRemotePublicOrder(orderId, body));
  } catch (error) {
    return fail(error);
  }
}
