import { fail, ok } from "@/lib/response";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { listKitchenOrdersForRestaurant } from "@/services/order-service";

export const preferredRegion = "sin1";

export async function GET() {
  try {
    const session = await requireOperationalDashboardApiSession({ feature: "kitchen_screen" });
    return ok(await listKitchenOrdersForRestaurant(session.restaurantId));
  } catch (error) {
    return fail(error);
  }
}
