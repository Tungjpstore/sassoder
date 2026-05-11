import { checkPersistentRateLimit } from "@/lib/persistent-rate-limit";
import { AppError, fail, ok } from "@/lib/response";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { checkoutOrderSchema } from "@/lib/validators";
import { getPublicOrder } from "@/services/order-service";
import { startCustomerPayment } from "@/services/payment-service";

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params;
    const ip = await getRequestIpKey();
    const allowed = await checkPersistentRateLimit({
      scope: "order_checkout",
      identifier: orderId,
      ip,
      limit: 12,
      windowMs: 60_000
    });
    if (!allowed) {
      throw new AppError("Bạn thao tác thanh toán quá nhanh. Vui lòng thử lại sau.", 429);
    }
    const body = checkoutOrderSchema.parse(await request.json());
    await startCustomerPayment(orderId, body.paymentMethod, body);
    return ok(await getPublicOrder(orderId, body));
  } catch (error) {
    return fail(error);
  }
}
