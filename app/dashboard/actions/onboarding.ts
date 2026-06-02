"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthUser, getSessionProfile } from "@/lib/session";
import { validateOnboardingTableCount } from "@/lib/billing/plan-limits";
import { onboardingSchema } from "@/lib/validators";
import { completeRestaurantOnboarding } from "@/services/restaurant-service";
import { getDashboardDestination } from "./shared";

export async function onboardingAction(_prevState: { error?: string } | undefined, formData: FormData) {
  const session = await getSessionProfile();
  if (session) redirect(await getDashboardDestination(session.restaurant.slug));

  const user = await getAuthUser();
  if (!user) {
    return { error: "Phiên đăng ký đã hết hạn. Vui lòng đăng nhập lại, LogiVN sẽ giữ bản nháp đã nhập trên trình duyệt này." };
  }

  const parsed = onboardingSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    businessType: formData.get("businessType"),
    customBusinessType: formData.get("customBusinessType"),
    tableCount: formData.get("tableCount"),
    address: formData.get("address"),
    storeLat: formData.get("storeLat"),
    storeLng: formData.get("storeLng"),
    hotline: formData.get("hotline"),
    initialItemName: formData.get("initialItemName"),
    initialItemPrice: formData.get("initialItemPrice"),
    initialItemCategory: formData.get("initialItemCategory"),
    initialMenuItems: formData.get("initialMenuItems"),
    brandSlogan: formData.get("brandSlogan"),
    brandDescription: formData.get("brandDescription"),
    generatedLogoUrl: formData.get("generatedLogoUrl"),
    bankCode: formData.get("bankCode"),
    bankAccount: formData.get("bankAccount"),
    bankAccountName: formData.get("bankAccountName"),
    planCode: formData.get("planCode")
  });

  if (!parsed.success) {
    return { error: "Vui lòng kiểm tra tên quán, đường dẫn, số bàn và thông tin ngân hàng." };
  }

  const tableLimit = validateOnboardingTableCount({
    planCode: parsed.data.planCode,
    tableCount: parsed.data.tableCount
  });
  if (!tableLimit.ok) return { error: tableLimit.message };

  let completed = false;
  try {
    const restaurant = await completeRestaurantOnboarding({
      userId: user.id,
      email: user.email!,
      name: parsed.data.name,
      slug: parsed.data.slug,
      businessType: parsed.data.businessType,
      customBusinessType: parsed.data.customBusinessType || undefined,
      tableCount: parsed.data.tableCount,
      address: parsed.data.address || undefined,
      storeLat: parsed.data.storeLat,
      storeLng: parsed.data.storeLng,
      hotline: parsed.data.hotline || undefined,
      logoFile: formData.get("logoFile"),
      logoUrl: parsed.data.generatedLogoUrl || undefined,
      brandSlogan: parsed.data.brandSlogan || undefined,
      brandDescription: parsed.data.brandDescription || undefined,
      initialMenuItem:
        parsed.data.initialMenuItems.length === 0 && parsed.data.initialItemName && parsed.data.initialItemPrice !== undefined
          ? {
              name: parsed.data.initialItemName,
              price: parsed.data.initialItemPrice,
              categoryName: parsed.data.initialItemCategory || undefined
            }
          : undefined,
      initialMenuItems: parsed.data.initialMenuItems,
      bankCode: parsed.data.bankCode || undefined,
      bankAccount: parsed.data.bankAccount || undefined,
      bankAccountName: parsed.data.bankAccountName || undefined,
      planCode: tableLimit.planCode
    });
    revalidatePath("/dashboard");
    completed = Boolean(restaurant.id);
  } catch (error) {
    console.error("[dashboard/onboarding] Onboarding failed", {
      userId: user.id,
      email: user.email,
      message: error instanceof Error ? error.message : String(error)
    });
    return { error: "Không hoàn tất được thiết lập quán. Vui lòng thử lại, LogiVN sẽ không tạo trùng dữ liệu đã khởi tạo." };
  }

  redirect(completed ? "/dashboard?onboarded=1" : "/dashboard/onboarding");
}
