import { AppError, fail, ok } from "@/lib/response";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { calculateShippingFee } from "@/services/maps/delivery-fee-service";
import { assertMapRateLimit } from "@/services/maps/provider-service";

export const preferredRegion = "sin1";

export async function POST(request: Request) {
  try {
    assertMapRateLimit(`delivery:fee:${await getRequestIpKey()}`, 30, 60_000);
    const body = (await request.json()) as {
      distanceKm?: number;
      freeRadiusKm?: number;
      baseFee?: number;
      feePerKm?: number;
      customThresholdKm?: number;
    };

    if (!Number.isFinite(body.distanceKm)) {
      throw new AppError("Thiếu khoảng cách để tính phí ship.", 400);
    }

    return ok(
      calculateShippingFee(Number(body.distanceKm), {
        freeRadiusKm: Number(body.freeRadiusKm ?? 0),
        baseFee: Number(body.baseFee ?? 0),
        feePerKm: Number(body.feePerKm ?? 0),
        customThresholdKm: Number(body.customThresholdKm ?? 0)
      })
    );
  } catch (error) {
    return fail(error);
  }
}
