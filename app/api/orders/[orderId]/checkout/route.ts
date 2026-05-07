import { checkoutOrderSchema } from "@/lib/validators";
import { fail, ok } from "@/lib/response";
import { getPublicOrder } from "@/services/order-service";
import { startCustomerPayment } from "@/services/payment-service";

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params;
    const body = checkoutOrderSchema.parse(await request.json());
    await startCustomerPayment(orderId, body.paymentMethod, body);
    return ok(await getPublicOrder(orderId, body));
  } catch (error) {
    return fail(error);
  }
}
