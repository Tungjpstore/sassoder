import { checkPersistentRateLimit } from "@/lib/persistent-rate-limit";
import { AppError, fail, ok } from "@/lib/response";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { customerOrderAccessSchema } from "@/lib/validators";
import { getPublicOrder } from "@/services/order-service";
import { markCustomerPaid } from "@/services/payment-service";

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params;
    const ip = await getRequestIpKey();
    const allowed = await checkPersistentRateLimit({
      scope: "order_paid",
      identifier: orderId,
      ip,
      limit: 8,
      windowMs: 60_000
    });
    if (!allowed) {
      throw new AppError("Bạn thao tác thanh toán quá nhanh. Vui lòng thử lại sau.", 429);
    }
    const body = customerOrderAccessSchema.parse(await request.json());
    await markCustomerPaid(orderId, body);
    return ok(await getPublicOrder(orderId, body));
  } catch (error) {
    return fail(error);
  }
}
