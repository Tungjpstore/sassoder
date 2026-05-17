import { deliveryQuoteSchema } from "@/lib/validators";
import { AppError, fail, ok } from "@/lib/response";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { assertMapRateLimit, buildRateLimitHeaders } from "@/services/maps/provider-service";
import { recordDeliveryQuoteEvent } from "@/services/maps/observability-service";
import { buildDeliveryQuoteCacheKey, withDeliveryQuoteCache } from "@/services/delivery-quote-cache";
import { getPublicOrderingSettingsBySlug, quoteDeliveryForRestaurant } from "@/services/delivery-service";

export const preferredRegion = "sin1";

function quoteInputFromSearchParams(restaurantSlug: string, searchParams: URLSearchParams) {
  return {
    restaurantSlug,
    subtotal: searchParams.get("subtotal") ?? 0,
    deliveryAddress: searchParams.get("deliveryAddress") ?? searchParams.get("address") ?? "",
    deliveryLat: searchParams.get("deliveryLat") ?? searchParams.get("lat") ?? undefined,
    deliveryLng: searchParams.get("deliveryLng") ?? searchParams.get("lng") ?? undefined
  };
}

async function handleDeliveryQuote(restaurantSlug: string, payload: unknown) {
  const startedAt = Date.now();
  const rateLimit = await assertMapRateLimit(`delivery:quote:${restaurantSlug}:${await getRequestIpKey()}`, 12, 60_000);
  const body = deliveryQuoteSchema.parse({
    ...(payload && typeof payload === "object" ? payload : {}),
    restaurantSlug
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

  return ok(quote, { headers: buildRateLimitHeaders(rateLimit) });
}

export async function GET(request: Request, { params }: { params: Promise<{ restaurantSlug: string }> }) {
  try {
    const { restaurantSlug } = await params;
    const { searchParams } = new URL(request.url);
    return await handleDeliveryQuote(restaurantSlug, quoteInputFromSearchParams(restaurantSlug, searchParams));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ restaurantSlug: string }> }) {
  try {
    const { restaurantSlug } = await params;
    return await handleDeliveryQuote(restaurantSlug, await request.json());
  } catch (error) {
    return fail(error);
  }
}
