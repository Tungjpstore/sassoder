import { type NextRequest } from "next/server";
import { fail, ok } from "@/lib/response";
import { applyBillingPaymentWebhook } from "@/services/billing/payment-webhook";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signatureHeader = request.headers.get("x-logivn-signature") ?? request.headers.get("x-billing-signature");
    const result = await applyBillingPaymentWebhook({
      rawBody,
      signatureHeader,
      secret: process.env.BILLING_WEBHOOK_SECRET
    });

    return ok(result, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return fail(error);
  }
}
