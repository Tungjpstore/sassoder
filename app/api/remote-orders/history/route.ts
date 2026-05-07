import { remoteOrderHistorySchema } from "@/lib/validators";
import { fail, ok } from "@/lib/response";
import { listRemoteOrderHistory } from "@/services/order-service";

export const preferredRegion = "sin1";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const body = remoteOrderHistorySchema.parse({
      restaurantSlug: url.searchParams.get("restaurantSlug"),
      customerSessionId: url.searchParams.get("customerSessionId")
    });

    return ok(await listRemoteOrderHistory(body));
  } catch (error) {
    return fail(error);
  }
}
