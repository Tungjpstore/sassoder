"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { invalidateDashboardWorkspaceCaches } from "@/lib/dashboard-workspace-cache";
import { requireSession } from "@/lib/session";
import {
  orderingSettingsSchema,
  paymentSettingsSchema,
  reportScheduleSchema,
  reservationSettingsSchema,
  restaurantSettingsSchema,
  storeBranchSchema,
  updateStoreBranchSchema
} from "@/lib/validators";
import { assertAdmin } from "@/services/auth-service";
import { createStoreBranch, updateStoreBranch } from "@/services/branch-service";
import { updateRestaurantOrderingSettings } from "@/services/delivery-service";
import { updateDeliveryBranchAvailability } from "@/services/delivery/branch-delivery-settings-service";
import { invalidateMenuCache } from "@/services/menu-service";
import { invalidateOnlineOrderingDashboardCache } from "@/services/online-ordering-service";
import { invalidateStaffOperationsBundleCache } from "@/lib/staff-operations-cache";
import { updateReportSchedule } from "@/services/report-schedule-service";
import { updateReservationSettings } from "@/services/reservation-service";
import {
  applyRestaurantAiBranding,
  getRestaurantDashboard,
  invalidateRestaurantDashboardCache,
  updateRestaurantPaymentSettings,
  updateRestaurantSettings
} from "@/services/restaurant-service";
import { assertFeatureEntitlement } from "@/services/subscription-service";
import { requireOperationalAdminSession } from "./shared";

const aiSetupBrandApplySchema = z.object({
  brandSlogan: z.string().trim().max(80).optional().or(z.literal("")),
  brandDescription: z.string().trim().max(500).optional().or(z.literal("")),
  logoUrl: z.string().trim().url().max(2000).optional().or(z.literal("")),
  includeLogo: z.preprocess((value) => value === "true" || value === true, z.boolean().optional())
});

const branchDeliveryAvailabilitySchema = z.object({
  branchId: z.string().uuid(),
  acceptingDelivery: z.boolean(),
  deliveryPaused: z.boolean(),
  temporarilyClosed: z.boolean(),
  deliveryOpeningTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  deliveryClosingTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  deliveryAvailabilityNote: z.string().trim().max(160).optional().or(z.literal(""))
});

function branchFormData(formData: FormData) {
  return {
    branchId: formData.get("branchId"),
    name: formData.get("name"),
    address: formData.get("address") ?? "",
    latitude: formData.get("latitude") ?? "",
    longitude: formData.get("longitude") ?? "",
    isPrimary: formData.get("isPrimary") === "true",
    isActive: formData.get("isActive") === "true"
  };
}

async function revalidateBranchSettingsSurfaces(session: Awaited<ReturnType<typeof requireOperationalAdminSession>>) {
  invalidateRestaurantDashboardCache(session.restaurantId);
  invalidateOnlineOrderingDashboardCache(session.restaurantId);
  invalidateMenuCache();
  await Promise.all([
    invalidateDashboardWorkspaceCaches(session.restaurantId, ["inventory", "online", "overview", "reservations", "tables"]),
    invalidateStaffOperationsBundleCache(session.restaurantId)
  ]);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/tables");
  revalidatePath("/dashboard/staff");
  revalidatePath("/dashboard/staff/mobile");
  revalidatePath("/dashboard/online");
  revalidatePath("/dashboard/reservations");
  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/ai-ops");
  revalidatePath(`/r/${session.restaurant.slug}`);
}

export async function updatePaymentSettingsAction(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
) {
  const session = await requireOperationalAdminSession("vietqr_payments");
  const parsed = paymentSettingsSchema.safeParse({
    bankCode: formData.get("bankCode"),
    bankAccount: formData.get("bankAccount"),
    bankAccountName: formData.get("bankAccountName")
  });

  if (!parsed.success) {
    return { error: "Vui lòng nhập đúng mã ngân hàng, số tài khoản và tên chủ tài khoản." };
  }

  try {
    await updateRestaurantPaymentSettings(session.restaurantId, parsed.data);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Không lưu được thông tin ngân hàng." };
  }

  invalidateRestaurantDashboardCache(session.restaurantId);
  invalidateOnlineOrderingDashboardCache(session.restaurantId);
  await invalidateDashboardWorkspaceCaches(session.restaurantId, ["payments", "online", "overview"]);
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/payments");
  revalidatePath("/dashboard/online");
  revalidatePath("/dashboard");
  return { success: "Đã lưu thông tin ngân hàng. VietQR sẽ dùng thông tin này cho đơn mới." };
}

const restaurantSettingsSuccessMessages: Record<string, string> = {
  profile: "Đã lưu hồ sơ quán.",
  hours: "Đã lưu giờ hoạt động.",
  receipt: "Đã lưu mẫu hoá đơn.",
  brand: "Đã lưu thương hiệu.",
  notifications: "Đã lưu cảnh báo vận hành."
};

export async function updateRestaurantSettingsAction(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
) {
  const session = await requireSession();
  assertAdmin(session.role);
  const current = (await getRestaurantDashboard(session.restaurantId)).restaurant;
  const section = String(formData.get("settingsSection") ?? "profile");
  const parsed = restaurantSettingsSchema.safeParse({
    name: formData.get("name") ?? current.name,
    businessType: formData.get("businessType") ?? current.business_type ?? "",
    contactEmail: formData.get("contactEmail") ?? current.contact_email ?? "",
    hotline: formData.get("hotline") ?? current.hotline ?? "",
    address: formData.get("address") ?? current.address ?? "",
    description: formData.get("description") ?? current.description ?? "",
    openingTime: formData.get("openingTime") ?? current.opening_time?.slice(0, 5) ?? "",
    closingTime: formData.get("closingTime") ?? current.closing_time?.slice(0, 5) ?? "",
    brandPrimary: formData.get("brandPrimary") ?? current.brand_primary ?? "",
    brandAccent: formData.get("brandAccent") ?? current.brand_accent ?? "",
    allowLegacyQr: section === "hours" ? formData.get("allowLegacyQr") === "true" : current.allow_legacy_qr,
    notifyNewOrder: section === "notifications" ? formData.get("notifyNewOrder") === "true" : current.notify_new_order,
    notifyPaymentWaiting: section === "notifications" ? formData.get("notifyPaymentWaiting") === "true" : current.notify_payment_waiting,
    showPromotionsOnMenu: section === "notifications" ? formData.get("showPromotionsOnMenu") === "true" : current.show_promotions_on_menu,
    receiptFooter: formData.get("receiptFooter") ?? current.receipt_footer ?? "",
    receiptShowQr: section === "receipt" ? formData.get("receiptShowQr") === "true" : current.receipt_show_qr
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Vui lòng kiểm tra lại thông tin cài đặt quán." };
  }

  try {
    await updateRestaurantSettings(session.restaurantId, {
      ...parsed.data,
      logoFile: formData.get("logoFile"),
      removeLogo: section === "profile" && formData.get("removeLogo") === "true"
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Không lưu được cài đặt quán." };
  }

  invalidateRestaurantDashboardCache(session.restaurantId);
  invalidateMenuCache();
  await invalidateDashboardWorkspaceCaches(session.restaurantId, ["menu", "online", "overview", "payments", "reservations", "tables"]);
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/menu");
  revalidatePath("/dashboard/online");
  revalidatePath("/dashboard/payments");
  revalidatePath("/dashboard/reservations");
  revalidatePath("/dashboard/tables");
  revalidatePath("/dashboard");
  return { success: restaurantSettingsSuccessMessages[section] ?? "Đã lưu cài đặt quán." };
}

export async function applyAiSetupBrandAction(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
) {
  const session = await requireOperationalAdminSession();
  const parsed = aiSetupBrandApplySchema.safeParse({
    brandSlogan: formData.get("brandSlogan"),
    brandDescription: formData.get("brandDescription"),
    logoUrl: formData.get("logoUrl"),
    includeLogo: formData.get("includeLogo")
  });

  if (!parsed.success) {
    return { error: "AI draft chưa hợp lệ để áp dụng vào hồ sơ quán." };
  }

  try {
    await applyRestaurantAiBranding({
      restaurantId: session.restaurantId,
      brandSlogan: parsed.data.brandSlogan || undefined,
      brandDescription: parsed.data.brandDescription || undefined,
      logoUrl: parsed.data.includeLogo ? parsed.data.logoUrl || undefined : undefined
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Không áp dụng được AI draft vào hồ sơ quán." };
  }

  invalidateRestaurantDashboardCache(session.restaurantId);
  invalidateOnlineOrderingDashboardCache(session.restaurantId);
  invalidateMenuCache();
  await invalidateDashboardWorkspaceCaches(session.restaurantId, ["menu", "online", "overview"]);
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/menu");
  revalidatePath("/dashboard/online");
  revalidatePath("/dashboard");
  return { success: parsed.data.includeLogo ? "Đã áp dụng slogan, mô tả và logo AI vào hồ sơ quán." : "Đã áp dụng slogan và mô tả AI vào hồ sơ quán." };
}

export async function updateReportScheduleAction(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
) {
  const session = await requireOperationalAdminSession("scheduled_reports");
  const parsed = reportScheduleSchema.safeParse({
    enabled: formData.get("enabled") === "true",
    frequency: formData.get("frequency"),
    recipients: formData.get("recipients"),
    sendHour: formData.get("sendHour"),
    sendDayOfWeek: formData.get("sendDayOfWeek"),
    sendDayOfMonth: formData.get("sendDayOfMonth"),
    sendMonth: formData.get("sendMonth"),
    includeCsv: formData.get("includeCsv") === "true",
    includeJson: formData.get("includeJson") === "true"
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Vui lòng kiểm tra email nhận báo cáo và lịch gửi." };
  }

  try {
    await updateReportSchedule(session.restaurantId, {
      enabled: parsed.data.enabled ?? false,
      frequency: parsed.data.frequency,
      recipients: parsed.data.recipients,
      sendHour: parsed.data.sendHour,
      sendDayOfWeek: parsed.data.sendDayOfWeek,
      sendDayOfMonth: parsed.data.sendDayOfMonth,
      sendMonth: parsed.data.sendMonth,
      includeCsv: parsed.data.includeCsv ?? false,
      includeJson: parsed.data.includeJson ?? false
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Không lưu được lịch gửi báo cáo." };
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/analytics");
  return { success: "Đã lưu lịch gửi báo cáo qua email." };
}

export async function createStoreBranchAction(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
) {
  const session = await requireOperationalAdminSession();
  const parsed = storeBranchSchema.safeParse(branchFormData(formData));

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Vui lòng kiểm tra thông tin chi nhánh." };
  }

  try {
    await createStoreBranch(session.restaurantId, parsed.data);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Không tạo được chi nhánh." };
  }

  await revalidateBranchSettingsSurfaces(session);
  return { success: "Đã tạo chi nhánh và đồng bộ quyền vận hành cho quán." };
}

export async function updateStoreBranchAction(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
) {
  const session = await requireOperationalAdminSession();
  const parsed = updateStoreBranchSchema.safeParse(branchFormData(formData));

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Vui lòng kiểm tra thông tin chi nhánh." };
  }

  try {
    await updateStoreBranch(session.restaurantId, parsed.data.branchId, parsed.data);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Không lưu được chi nhánh." };
  }

  await revalidateBranchSettingsSurfaces(session);
  return { success: "Đã cập nhật chi nhánh và quyền vận hành liên quan." };
}

export async function updateOrderingSettingsAction(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
) {
  const session = await requireOperationalAdminSession("online_ordering");
  const parsed = orderingSettingsSchema.safeParse({
    address: formData.get("address") ?? "",
    onlineOrderingEnabled: formData.get("onlineOrderingEnabled") === "true",
    pickupEnabled: formData.get("pickupEnabled") === "true",
    deliveryEnabled: formData.get("deliveryEnabled") === "true",
    onlinePaymentMode: formData.get("onlinePaymentMode") ?? "PAY_AFTER",
    deliveryTrackingEnabled: formData.get("deliveryTrackingEnabled") === "true",
    mapGeocodingProvider: formData.get("mapGeocodingProvider") ?? "nominatim",
    mapRoutingProvider: formData.get("mapRoutingProvider") ?? "osrm",
    mapDefaultZoom: formData.get("mapDefaultZoom") ?? "14",
    mapDisplayStyle: formData.get("mapDisplayStyle") ?? "LIGHT",
    showStoreMarkerOnOrdering: formData.get("showStoreMarkerOnOrdering") === "true",
    showCustomerDistance: formData.get("showCustomerDistance") === "true",
    storeLat: formData.get("storeLat") ?? "",
    storeLng: formData.get("storeLng") ?? "",
    deliveryRadiusKm: formData.get("deliveryRadiusKm"),
    freeDeliveryRadiusKm: formData.get("freeDeliveryRadiusKm"),
    deliveryBaseFee: formData.get("deliveryBaseFee"),
    deliveryFeePerKm: formData.get("deliveryFeePerKm"),
    deliveryAreaMode: formData.get("deliveryAreaMode") ?? "RADIUS",
    deliveryAreaName: formData.get("deliveryAreaName") ?? "",
    deliveryAreaNote: formData.get("deliveryAreaNote") ?? "",
    deliveryAreaWardCount: formData.get("deliveryAreaWardCount") ?? "0",
    deliveryAreaPolygon: formData.get("deliveryAreaPolygon") ?? "[]",
    deliveryExclusionZones: formData.get("deliveryExclusionZones") ?? "[]",
    deliveryFeeEnabled: formData.get("deliveryFeeEnabled") === "true",
    deliveryFeeTiers: formData.get("deliveryFeeTiers") ?? "[]",
    minOrderForDelivery: formData.get("minOrderForDelivery"),
    pickupEtaMinutes: formData.get("pickupEtaMinutes"),
    deliveryEtaMinutes: formData.get("deliveryEtaMinutes"),
    serviceFeeEnabled: formData.get("serviceFeeEnabled") === "true",
    serviceFeeType: formData.get("serviceFeeType") ?? "ORDER_PERCENT",
    serviceFeePercent: formData.get("serviceFeePercent") ?? "0",
    serviceFeeMin: formData.get("serviceFeeMin") ?? "0",
    serviceFeeMax: formData.get("serviceFeeMax") ?? "",
    allowOutsideDeliveryArea: formData.get("allowOutsideDeliveryArea") === "true",
    showDeliveryEta: formData.get("showDeliveryEta") === "true",
    requireOutsideAreaConfirmation: formData.get("requireOutsideAreaConfirmation") === "true",
    autoSuggestNearestBranch: formData.get("autoSuggestNearestBranch") === "true"
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Vui lòng kiểm tra lại cấu hình đặt món online." };
  }

  try {
    if (parsed.data.deliveryEnabled) {
      await assertFeatureEntitlement(session.restaurantId, "delivery_basic");
    }
    if (parsed.data.deliveryTrackingEnabled) {
      await assertFeatureEntitlement(session.restaurantId, "delivery_realtime_tracking");
    }
    await updateRestaurantOrderingSettings(session.restaurantId, parsed.data);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Không lưu được cấu hình đặt món online." };
  }

  invalidateRestaurantDashboardCache(session.restaurantId);
  invalidateMenuCache();
  invalidateOnlineOrderingDashboardCache(session.restaurantId);
  await invalidateDashboardWorkspaceCaches(session.restaurantId, ["menu", "online", "overview"]);
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/online");
  revalidatePath("/dashboard/orders");
  revalidatePath(`/r/${session.restaurant.slug}`);
  return { success: "Đã lưu cấu hình đặt món online." };
}

export async function updateBranchDeliveryAvailabilityAction(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
) {
  const session = await requireOperationalAdminSession("online_ordering");
  const parsed = branchDeliveryAvailabilitySchema.safeParse({
    branchId: formData.get("branchId"),
    acceptingDelivery: formData.get("acceptingDelivery") === "true",
    deliveryPaused: formData.get("deliveryPaused") === "true",
    temporarilyClosed: formData.get("temporarilyClosed") === "true",
    deliveryOpeningTime: formData.get("deliveryOpeningTime") ?? "",
    deliveryClosingTime: formData.get("deliveryClosingTime") ?? "",
    deliveryAvailabilityNote: formData.get("deliveryAvailabilityNote") ?? ""
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Vui lòng kiểm tra cấu hình giao hàng của chi nhánh." };
  }

  try {
    await updateDeliveryBranchAvailability(session.restaurantId, parsed.data);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Không cập nhật được trạng thái giao hàng của chi nhánh." };
  }

  invalidateRestaurantDashboardCache(session.restaurantId);
  invalidateOnlineOrderingDashboardCache(session.restaurantId);
  await invalidateDashboardWorkspaceCaches(session.restaurantId, ["online", "overview"]);
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/online");
  revalidatePath("/dashboard/orders");
  revalidatePath(`/r/${session.restaurant.slug}`);
  return { success: "Đã cập nhật trạng thái giao hàng của chi nhánh." };
}

export async function updateReservationSettingsAction(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
) {
  const session = await requireOperationalAdminSession("reservations");
  const parsed = reservationSettingsSchema.safeParse({
    reservationsEnabled: formData.get("reservationsEnabled") === "true",
    reservationDepositEnabled: formData.get("reservationDepositEnabled") === "true",
    reservationDepositType: formData.get("reservationDepositType") ?? "FIXED",
    reservationDepositValue: formData.get("reservationDepositValue"),
    reservationHoldMinutes: formData.get("reservationHoldMinutes"),
    reservationDurationMinutes: formData.get("reservationDurationMinutes"),
    reservationBufferMinutes: formData.get("reservationBufferMinutes"),
    reservationMinNoticeMinutes: formData.get("reservationMinNoticeMinutes"),
    reservationMaxDaysAhead: formData.get("reservationMaxDaysAhead"),
    reservationArrivalGraceMinutes: formData.get("reservationArrivalGraceMinutes")
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Vui lòng kiểm tra cấu hình đặt bàn." };
  }

  try {
    if (parsed.data.reservationDepositEnabled) {
      await assertFeatureEntitlement(session.restaurantId, "reservation_deposits");
    }
    await updateReservationSettings(session.restaurantId, parsed.data);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Không lưu được cấu hình đặt bàn." };
  }

  invalidateRestaurantDashboardCache(session.restaurantId);
  await invalidateDashboardWorkspaceCaches(session.restaurantId, ["reservations", "tables", "overview"]);
  revalidatePath("/dashboard/reservations");
  revalidatePath("/dashboard/tables");
  revalidatePath(`/r/${session.restaurant.slug}/reserve`);
  return { success: "Đã lưu cấu hình đặt bàn trước." };
}
