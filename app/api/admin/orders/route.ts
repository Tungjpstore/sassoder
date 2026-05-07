import { fail, ok } from "@/lib/response";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { listOrdersForRestaurant } from "@/services/order-service";

export const preferredRegion = "sin1";

export async function GET(request: Request) {
  try {
    const session = await requireOperationalDashboardApiSession({ feature: "order_realtime" });
    const url = new URL(request.url);
    const includeHistory = url.searchParams.get("history") === "true";
    return ok(await listOrdersForRestaurant(session.restaurantId, { includeHistory }));
  } catch (error) {
    return fail(error);
  }
}
