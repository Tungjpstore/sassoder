"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/session";
import {
  orderingSettingsSchema,
  paymentSettingsSchema,
  reportScheduleSchema,
  reservationSettingsSchema,
  restaurantSettingsSchema
} from "@/lib/validators";
import { assertAdmin } from "@/services/auth-service";
import { updateRestaurantOrderingSettings } from "@/services/delivery-service";
import { invalidateMenuCache } from "@/services/menu-service";
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
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  return { success: "Đã lưu thông tin ngân hàng. VietQR sẽ dùng thông tin này cho đơn mới." };
}

export async function updateRestaurantSettingsAction(formData: FormData) {
  const session = await requireSession();
  assertAdmin(session.role);
  const current = (await getRestaurantDashboard(session.restaurantId)).restaurant;
  const section = String(formData.get("settingsSection") ?? "profile");
  const parsed = restaurantSettingsSchema.parse({
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

  await updateRestaurantSettings(session.restaurantId, parsed);
  invalidateRestaurantDashboardCache(session.restaurantId);
  invalidateMenuCache();
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
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
  invalidateMenuCache();
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  return { success: parsed.data.includeLogo ? "Đã áp dụng slogan, mô tả và logo AI vào hồ sơ quán." : "Đã áp dụng slogan và mô tả AI vào hồ sơ quán." };
}

export async function updateReportScheduleAction(formData: FormData) {
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
    throw new Error("Vui lòng kiểm tra email nhận báo cáo và lịch gửi.");
  }

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

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/analytics");
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
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/orders");
  revalidatePath(`/r/${session.restaurant.slug}`);
  return { success: "Đã lưu cấu hình đặt món online." };
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
  revalidatePath("/dashboard/reservations");
  revalidatePath(`/r/${session.restaurant.slug}/reserve`);
  return { success: "Đã lưu cấu hình đặt bàn trước." };
}
