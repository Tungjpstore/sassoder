"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { assertAdmin } from "@/services/auth-service";
import { createSubscriptionPaymentRequest } from "@/services/subscription-service";

export async function requestSubscriptionPaymentAction(formData: FormData) {
  const session = await requireSession();
  assertAdmin(session.role);
  const months = Number(formData.get("months") ?? 1);
  const planCode = String(formData.get("planCode") ?? "").trim() || undefined;

  try {
    await createSubscriptionPaymentRequest({
      restaurantId: session.restaurantId,
      ownerEmail: session.email,
      months: Number.isFinite(months) ? months : 1,
      planCode
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không tạo được yêu cầu thanh toán gói.";
    redirect(`/dashboard/settings?section=billing&billingStep=payment&billingError=${encodeURIComponent(message.slice(0, 240))}`);
  }

  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings?section=billing&billingStep=payment");
}
