"use server";

import { revalidatePath } from "next/cache";
import { promotionDisplaySchema, promotionIdSchema, promotionSchema, promotionStatusSchema } from "@/lib/validators";
import { invalidateMenuCache } from "@/services/menu-service";
import { createPromotion, deletePromotion, updatePromotionActiveStatus, updatePromotionCustomerVisibility } from "@/services/promotion-service";
import { requireOperationalAdminSession } from "./shared";

export async function createPromotionAction(formData: FormData) {
  const session = await requireOperationalAdminSession("promotions");
  const parsed = promotionSchema.parse({
    name: formData.get("name"),
    code: formData.get("code"),
    discountType: formData.get("discountType"),
    discountValue: formData.get("discountValue"),
    minOrderAmount: formData.get("minOrderAmount"),
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    channels: formData.getAll("channels")
  });

  await createPromotion(session.restaurantId, parsed);
  invalidateMenuCache();
  revalidatePath("/dashboard/promotions");
  revalidatePath(`/r/${session.restaurant.slug}`);
}

export async function togglePromotionAction(formData: FormData) {
  const session = await requireOperationalAdminSession("promotions");
  const parsed = promotionStatusSchema.parse({
    promotionId: formData.get("promotionId"),
    isActive: formData.get("isActive") === "true"
  });

  await updatePromotionActiveStatus(session.restaurantId, {
    promotionId: parsed.promotionId,
    isActive: parsed.isActive
  });

  invalidateMenuCache();
  revalidatePath("/dashboard/promotions");
  revalidatePath(`/r/${session.restaurant.slug}`);
}

export async function togglePromotionDisplayAction(formData: FormData) {
  const session = await requireOperationalAdminSession("promotions");
  const parsed = promotionDisplaySchema.parse({
    promotionId: formData.get("promotionId"),
    showOnCustomerMenu: formData.get("showOnCustomerMenu") === "true"
  });

  await updatePromotionCustomerVisibility(session.restaurantId, parsed);
  invalidateMenuCache();
  revalidatePath("/dashboard/promotions");
  revalidatePath(`/r/${session.restaurant.slug}`);
}

export async function deletePromotionAction(formData: FormData) {
  const session = await requireOperationalAdminSession("promotions");
  const parsed = promotionIdSchema.parse({
    promotionId: formData.get("promotionId")
  });

  await deletePromotion(session.restaurantId, parsed.promotionId);
  invalidateMenuCache();
  revalidatePath("/dashboard/promotions");
  revalidatePath(`/r/${session.restaurant.slug}`);
}
