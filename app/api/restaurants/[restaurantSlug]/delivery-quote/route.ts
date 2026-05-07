import { deliveryQuoteSchema } from "@/lib/validators";
import { AppError, fail, ok } from "@/lib/response";
import { getPublicOrderingSettingsBySlug, quoteDeliveryForRestaurant } from "@/services/delivery-service";

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ restaurantSlug: string }> }) {
  try {
    const { restaurantSlug } = await params;
    const body = deliveryQuoteSchema.parse({
      restaurantSlug,
      ...(await request.json())
    });
    const settings = await getPublicOrderingSettingsBySlug(body.restaurantSlug);
    if (!settings) throw new AppError("Không tìm thấy quán", 404);

    return ok(await quoteDeliveryForRestaurant(settings, body));
  } catch (error) {
    return fail(error);
  }
}
