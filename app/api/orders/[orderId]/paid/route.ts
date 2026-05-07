import { fail, ok } from "@/lib/response";
import { customerOrderAccessSchema } from "@/lib/validators";
import { getPublicOrder } from "@/services/order-service";
import { markCustomerPaid } from "@/services/payment-service";

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params;
    const body = customerOrderAccessSchema.parse(await request.json());
    await markCustomerPaid(orderId, body);
    return ok(await getPublicOrder(orderId, body));
  } catch (error) {
    return fail(error);
  }
}
