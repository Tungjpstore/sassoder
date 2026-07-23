import { publicOrderHistorySchema } from "@/lib/validators";
import { fail, ok } from "@/lib/response";
import { listPublicOrderHistory } from "@/services/order-service";
import { requireDineInCustomerSession } from "@/lib/customer/customer-session-server";

export const preferredRegion = "sin1";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const body = publicOrderHistorySchema.parse({
      restaurantSlug: url.searchParams.get("restaurantSlug"),
      tableId: url.searchParams.get("tableId"),
      tableAccessToken: url.searchParams.get("tableAccessToken") || undefined,
      customerSessionId: url.searchParams.get("customerSessionId") || undefined
    });

    const customerSession = body.customerSessionId
      ? await requireDineInCustomerSession({
          request,
          restaurantSlug: body.restaurantSlug,
          tableId: body.tableId,
          customerSessionId: body.customerSessionId
        })
      : null;

    return ok(
      await listPublicOrderHistory({
        ...body,
        ...(customerSession ? { verifiedSession: customerSession.verifiedSession } : {})
      })
    );
  } catch (error) {
    return fail(error);
  }
}
