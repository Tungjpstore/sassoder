import { fail, ok } from "@/lib/response";
import { customerOrderAccessSchema } from "@/lib/validators";
import { getPublicOrder } from "@/services/order-service";

export const preferredRegion = "sin1";

export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params;
    const url = new URL(request.url);
    const access = customerOrderAccessSchema.parse({
      restaurantSlug: url.searchParams.get("restaurantSlug"),
      tableId: url.searchParams.get("tableId"),
      tableAccessToken: url.searchParams.get("tableAccessToken") || undefined,
      customerSessionId: url.searchParams.get("customerSessionId") || undefined
    });

    return ok(await getPublicOrder(orderId, access));
  } catch (error) {
    return fail(error);
  }
}
