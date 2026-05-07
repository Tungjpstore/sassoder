import { fail, ok } from "@/lib/response";
import { remoteOrderAccessSchema } from "@/lib/validators";
import { getRemotePublicOrder } from "@/services/order-service";
import { markRemoteCustomerPaid } from "@/services/payment-service";

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params;
    const body = remoteOrderAccessSchema.parse(await request.json());
    await markRemoteCustomerPaid(orderId, body);
    return ok(await getRemotePublicOrder(orderId, body));
  } catch (error) {
    return fail(error);
  }
}
