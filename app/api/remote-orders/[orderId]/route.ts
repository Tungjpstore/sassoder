import { fail, ok } from "@/lib/response";
import { remoteOrderAccessSchema } from "@/lib/validators";
import { getRemotePublicOrder } from "@/services/order-service";

export const preferredRegion = "sin1";

export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params;
    const url = new URL(request.url);
    const body = remoteOrderAccessSchema.parse({
      restaurantSlug: url.searchParams.get("restaurantSlug"),
      customerSessionId: url.searchParams.get("customerSessionId")
    });

    return ok(await getRemotePublicOrder(orderId, body));
  } catch (error) {
    return fail(error);
  }
}
