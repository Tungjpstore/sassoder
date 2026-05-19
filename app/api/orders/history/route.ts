import { publicOrderHistorySchema } from "@/lib/validators";
import { fail, ok } from "@/lib/response";
import { listPublicOrderHistory } from "@/services/order-service";

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

    return ok(await listPublicOrderHistory(body));
  } catch (error) {
    return fail(error);
  }
}
