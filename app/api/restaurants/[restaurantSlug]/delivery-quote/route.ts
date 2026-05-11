import { deliveryQuoteSchema } from "@/lib/validators";
import { AppError, fail, ok } from "@/lib/response";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { assertMapRateLimit } from "@/services/maps/provider-service";
import { recordDeliveryQuoteEvent } from "@/services/maps/observability-service";
import { buildDeliveryQuoteCacheKey, withDeliveryQuoteCache } from "@/services/delivery-quote-cache";
import { getPublicOrderingSettingsBySlug, quoteDeliveryForRestaurant } from "@/services/delivery-service";

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ restaurantSlug: string }> }) {
  const startedAt = Date.now();
  try {
    const { restaurantSlug } = await params;
    assertMapRateLimit(`delivery:quote:${restaurantSlug}:${await getRequestIpKey()}`, 12, 60_000);
    const body = deliveryQuoteSchema.parse({
      restaurantSlug,
      ...(await request.json())
    });
    const settings = await getPublicOrderingSettingsBySlug(body.restaurantSlug);
    if (!settings) throw new AppError("Không tìm thấy quán", 404);

    const quote = await withDeliveryQuoteCache(buildDeliveryQuoteCacheKey(body.restaurantSlug, body), () =>
      quoteDeliveryForRestaurant(settings, body)
    );

    recordDeliveryQuoteEvent({
      type: "delivery_quote",
      restaurantId: settings.id,
      restaurantSlug: body.restaurantSlug,
      accepted: quote.accepted,
      provider: quote.provider,
      routeProvider: quote.routeProvider ?? null,
      confidence: quote.confidence ?? null,
      isEstimated: quote.isEstimated ?? null,
      distanceKm: quote.distanceKm,
      fee: quote.fee,
      latencyMs: Date.now() - startedAt
    });

    return ok(quote);
  } catch (error) {
    return fail(error);
  }
}
