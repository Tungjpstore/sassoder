"use server";

import { revalidatePath } from "next/cache";
import { promotionDisplaySchema, promotionIdSchema, promotionSchema, promotionStatusSchema, updatePromotionSchema } from "@/lib/validators";
import { invalidateMenuCache } from "@/services/menu-service";
import { createPromotion, deletePromotion, updatePromotion, updatePromotionActiveStatus, updatePromotionCustomerVisibility } from "@/services/promotion-service";
import { requireOperationalAdminSession } from "./shared";

function revalidatePromotionWorkspace(slug: string) {
  invalidateMenuCache();
  revalidatePath("/dashboard/promotions");
  revalidatePath(`/r/${slug}`);
}

export async function createPromotionAction(formData: FormData) {
  const session = await requireOperationalAdminSession("promotions");
  const parsed = promotionSchema.parse({
    name: formData.get("name"),
    code: formData.get("code"),
    discountScope: formData.get("discountScope") ?? "ORDER",
    discountType: formData.get("discountType"),
    discountValue: formData.get("discountValue"),
    minOrderAmount: formData.get("minOrderAmount"),
    totalUsageLimit: formData.get("totalUsageLimit"),
    perCustomerUsageLimit: formData.get("perCustomerUsageLimit"),
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    channels: formData.getAll("channels")
  });

  await createPromotion(session.restaurantId, parsed);
  revalidatePromotionWorkspace(session.restaurant.slug);
}

export async function updatePromotionAction(formData: FormData) {
  const session = await requireOperationalAdminSession("promotions");
  const parsed = updatePromotionSchema.parse({
    promotionId: formData.get("promotionId"),
    name: formData.get("name"),
    code: formData.get("code"),
    discountScope: formData.get("discountScope") ?? "ORDER",
    discountType: formData.get("discountType"),
    discountValue: formData.get("discountValue"),
    minOrderAmount: formData.get("minOrderAmount"),
    totalUsageLimit: formData.get("totalUsageLimit"),
    perCustomerUsageLimit: formData.get("perCustomerUsageLimit"),
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    channels: formData.getAll("channels")
  });

  await updatePromotion(session.restaurantId, parsed);
  revalidatePromotionWorkspace(session.restaurant.slug);
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

  revalidatePromotionWorkspace(session.restaurant.slug);
}

export async function togglePromotionDisplayAction(formData: FormData) {
  const session = await requireOperationalAdminSession("promotions");
  const parsed = promotionDisplaySchema.parse({
    promotionId: formData.get("promotionId"),
    showOnCustomerMenu: formData.get("showOnCustomerMenu") === "true"
  });

  await updatePromotionCustomerVisibility(session.restaurantId, parsed);
  revalidatePromotionWorkspace(session.restaurant.slug);
}

export async function deletePromotionAction(formData: FormData) {
  const session = await requireOperationalAdminSession("promotions");
  const parsed = promotionIdSchema.parse({
    promotionId: formData.get("promotionId")
  });

  await deletePromotion(session.restaurantId, parsed.promotionId);
  revalidatePromotionWorkspace(session.restaurant.slug);
}
