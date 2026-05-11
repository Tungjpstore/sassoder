"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { checkPersistentAuthRateLimit } from "@/lib/auth-rate-limit";
import { getDashboardDestinationForHost } from "@/lib/dashboard-destination";
import { buildAppUrl } from "@/lib/app-url";
import { getAuthUser, getSessionProfile, requireSession } from "@/lib/session";
import {
  categorySchema,
  emailOtpSchema,
  forgotPasswordSchema,
  loginSchema,
  menuItemSchema,
  onboardingSchema,
  orderingSettingsSchema,
  paymentSettingsSchema,
  promotionDisplaySchema,
  promotionIdSchema,
  promotionSchema,
  promotionStatusSchema,
  reportScheduleSchema,
  reservationSettingsSchema,
  resendEmailOtpSchema,
  resetPasswordSchema,
  restaurantSettingsSchema,
  registerAccountSchema,
  registerOnboardingSchema,
  staffInviteSchema,
  staffRoleSchema,
  staffUserSchema,
  tableIdSchema,
  tableQrStatusSchema,
  tableSchema,
  updateTableSchema,
  updateMenuItemSchema
} from "@/lib/validators";
import {
  assertAdmin,
  getAuthEmailRegistrationStatus,
  loginWithPassword,
  logout,
  requestPasswordReset,
  resendSignupEmailOtp,
  signUpWithEmailOtp,
  updateRecoveredPassword,
  verifySignupEmailOtp
} from "@/services/auth-service";
import { persistMenuImageUrl, uploadMenuImageFile } from "@/services/menu-image-service";
import {
  createCategory,
  createMenuItem,
  deleteMenuItem,
  importMenuItemsFromDraft,
  invalidateMenuCache,
  updateMenuItem,
  updateMenuItemAvailability
} from "@/services/menu-service";
import { createPromotion, deletePromotion, updatePromotionActiveStatus, updatePromotionCustomerVisibility } from "@/services/promotion-service";
import { updateReportSchedule } from "@/services/report-schedule-service";
import { createTable, deleteTable, updateTable, updateTableQrStatus } from "@/services/table-service";
import { updateRestaurantOrderingSettings } from "@/services/delivery-service";
import { updateReservationSettings } from "@/services/reservation-service";
import {
  assertFeatureEntitlement,
  assertRestaurantEntitlement,
  assertRestaurantResourceLimit,
  createSubscriptionPaymentRequest,
  type PlanFeatureKey
} from "@/services/subscription-service";
import {
  applyRestaurantAiBranding,
  completeRestaurantOnboarding,
  consumeRegistrationIntentForUser,
  createRestaurantUser,
  createRegistrationIntent,
  deleteRestaurantUser,
  getRestaurantDashboard,
  invalidateRestaurantDashboardCache,
  updateRestaurantPaymentSettings,
  updateRestaurantUserRole,
  updateRestaurantSettings
} from "@/services/restaurant-service";

async function actionIp() {
  const requestHeaders = await headers();
  return (
    requestHeaders.get("cf-connecting-ip") ||
    requestHeaders.get("x-real-ip") ||
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local"
  );
}

async function checkActionRateLimit(key: string, limit = 10, windowMs = 60_000) {
  const requestHeaders = await headers();
  const ip = await actionIp();
  const [scope, ...rest] = key.split(":");
  const userAgent = requestHeaders.get("user-agent")?.slice(0, 160) || "unknown";

  return checkPersistentAuthRateLimit({
    scope: scope || "auth",
    identifier: `${rest.join(":") || "anonymous"}:${userAgent}`,
    ip,
    limit,
    windowMs
  });
}

async function getDashboardDestination(restaurantSlug: string) {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  return getDashboardDestinationForHost(restaurantSlug, host);
}

async function requireOperationalAdminSession(feature?: PlanFeatureKey) {
  const session = await requireSession();
  assertAdmin(session.role);
  if (feature) await assertFeatureEntitlement(session.restaurantId, feature);
  else await assertRestaurantEntitlement(session.restaurantId);
  return session;
}

const aiSetupBrandApplySchema = z.object({
  brandSlogan: z.string().trim().max(80).optional().or(z.literal("")),
  brandDescription: z.string().trim().max(500).optional().or(z.literal("")),
  logoUrl: z.string().trim().url().max(2000).optional().or(z.literal("")),
  includeLogo: z.preprocess((value) => value === "true" || value === true, z.boolean().optional())
});

export async function loginAction(_prevState: { error?: string } | undefined, formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password")
  });

  if (!parsed.success) {
    return { error: "Vui lòng nhập email và mật khẩu." };
  }

  if (!(await checkActionRateLimit(`login:${parsed.data.email.toLowerCase()}`, 8, 60_000))) {
    return { error: "Bạn thử đăng nhập quá nhanh. Vui lòng chờ một chút." };
  }

  try {
    await loginWithPassword(parsed.data.email, parsed.data.password);
  } catch {
    return { error: "Email hoặc mật khẩu không đúng." };
  }

  const session = await getSessionProfile();
  if (!session) redirect("/dashboard/onboarding");

  redirect(await getDashboardDestination(session.restaurant.slug));
}

export async function registerAccountAction(
  _prevState: { error?: string; success?: string; redirectTo?: string } | undefined,
  formData: FormData
) {
  const parsed = registerAccountSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword")
  });

  if (!parsed.success) {
    return { error: "Vui lòng nhập email hợp lệ và mật khẩu đủ mạnh, xác nhận phải khớp." };
  }

  const email = parsed.data.email.toLowerCase();
  const planCode = String(formData.get("planCode") ?? "").trim().toLowerCase();
  const onboardingPath = planCode === "premium" ? "/dashboard/onboarding?plan=premium" : "/dashboard/onboarding?plan=pro";

  if (!(await checkActionRateLimit(`register:${email}`, 5, 10 * 60_000))) {
    return { error: "Bạn tạo tài khoản quá nhanh. Vui lòng thử lại sau vài phút." };
  }

  try {
    const emailStatus = await getAuthEmailRegistrationStatus(email);
    if (emailStatus === "registered") {
      return { error: "Email này đã có tài khoản LogiVN. Bạn có thể đăng nhập hoặc dùng Quên mật khẩu." };
    }
    if (emailStatus === "pending_verification") {
      return {
        success: "Email này đang chờ xác minh. LogiVN sẽ mở lại trang xác thực.",
        redirectTo: `/verify-email?email=${encodeURIComponent(email)}`
      };
    }

    await signUpWithEmailOtp({
      email,
      password: parsed.data.password,
      emailRedirectTo: buildAppUrl(`/auth/confirm?next=${encodeURIComponent(onboardingPath)}`)
    });

    return {
      success: "Đã gửi email xác thực. Vui lòng kiểm tra hộp thư để tiếp tục.",
      redirectTo: `/verify-email?email=${encodeURIComponent(email)}`
    };
  } catch (error) {
    try {
      await resendSignupEmailOtp(email, buildAppUrl(`/auth/confirm?next=${encodeURIComponent(onboardingPath)}`));
      return {
        success: "Email này đang chờ xác thực. LogiVN đã gửi lại email xác thực.",
        redirectTo: `/verify-email?email=${encodeURIComponent(email)}`
      };
    } catch {
      // Keep the public error intentionally generic so we do not leak account state.
    }

    console.error("[dashboard/register] Account registration failed", {
      email,
      message: error instanceof Error ? error.message : String(error)
    });
    return { error: "Không tạo được tài khoản. Nếu email đã đăng ký, vui lòng đăng nhập hoặc dùng Quên mật khẩu." };
  }
}

export async function registerOnboardingAction(_prevState: { error?: string } | undefined, formData: FormData) {
  const parsed = registerOnboardingSchema.safeParse({
    ownerName: formData.get("ownerName"),
    email: formData.get("email"),
    password: formData.get("password"),
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
    return { error: "Vui lòng kiểm tra tài khoản, tên quán, đường dẫn, số bàn và thông tin ngân hàng." };
  }

  if (!(await checkActionRateLimit(`register:${parsed.data.email.toLowerCase()}`, 5, 10 * 60_000))) {
    return { error: "Bạn tạo tài khoản quá nhanh. Vui lòng thử lại sau vài phút." };
  }

  try {
    const emailStatus = await getAuthEmailRegistrationStatus(parsed.data.email);
    if (emailStatus === "registered") {
      return { error: "Email này đã có tài khoản LogiVN. Vui lòng đăng nhập hoặc dùng Quên mật khẩu." };
    }
    if (emailStatus === "pending_verification") {
      return {
        success: "Email này đang chờ xác minh. LogiVN sẽ mở lại trang nhập mã OTP.",
        redirectTo: `/dashboard/verify-email?email=${encodeURIComponent(parsed.data.email.toLowerCase())}`
      };
    }

    const user = await signUpWithEmailOtp({
      email: parsed.data.email,
      password: parsed.data.password,
      emailRedirectTo: buildAppUrl("/auth/confirm?next=/dashboard/onboarding")
    });

    await createRegistrationIntent({
      userId: user.id,
      email: user.email!,
      payload: {
        name: parsed.data.name,
        slug: parsed.data.slug,
        businessType: parsed.data.businessType,
        customBusinessType: parsed.data.customBusinessType || undefined,
        tableCount: parsed.data.tableCount,
        address: parsed.data.address || undefined,
        storeLat: parsed.data.storeLat,
        storeLng: parsed.data.storeLng,
        hotline: parsed.data.hotline || undefined,
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
        planCode: parsed.data.planCode || undefined
      }
    });

    return {
      success: "Đã gửi mã xác thực đến email của bạn.",
      redirectTo: `/dashboard/verify-email?email=${encodeURIComponent(parsed.data.email.toLowerCase())}`
    };
  } catch (error) {
    console.error("[dashboard/register] Registration failed", {
      email: parsed.data.email.toLowerCase(),
      message: error instanceof Error ? error.message : String(error)
    });
    return { error: "Không hoàn tất được đăng ký quán. Vui lòng kiểm tra email hoặc thử lại sau ít phút." };
  }
}

export async function verifyEmailOtpAction(_prevState: { error?: string } | undefined, formData: FormData) {
  const parsed = emailOtpSchema.safeParse({
    email: formData.get("email"),
    token: formData.get("token")
  });

  if (!parsed.success) {
    return { error: "Vui lòng nhập email và mã OTP gồm 6 chữ số." };
  }

  if (!(await checkActionRateLimit(`verify-email:${parsed.data.email.toLowerCase()}`, 8, 10 * 60_000))) {
    return { error: "Bạn nhập mã quá nhiều lần. Vui lòng thử lại sau ít phút." };
  }

  let destination = "/dashboard/onboarding";
  try {
    const user = await verifySignupEmailOtp(parsed.data.email, parsed.data.token);
    const restaurant = await consumeRegistrationIntentForUser({
      userId: user.id,
      email: user.email ?? parsed.data.email
    });

    if (restaurant) destination = await getDashboardDestination(restaurant.slug);
  } catch (error) {
    console.error("[dashboard/verify-email] OTP verification failed", {
      email: parsed.data.email.toLowerCase(),
      message: error instanceof Error ? error.message : String(error)
    });
    return { error: "Mã xác thực không đúng hoặc đã hết hạn. Vui lòng kiểm tra email và thử lại." };
  }

  redirect(destination);
}

export async function resendEmailOtpAction(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
) {
  const parsed = resendEmailOtpSchema.safeParse({
    email: formData.get("email")
  });

  if (!parsed.success) {
    return { error: "Vui lòng nhập email hợp lệ." };
  }

  if (!(await checkActionRateLimit(`resend-email:${parsed.data.email.toLowerCase()}`, 3, 10 * 60_000))) {
    return { error: "Bạn yêu cầu gửi mã quá nhanh. Vui lòng chờ thêm." };
  }

  try {
    await resendSignupEmailOtp(parsed.data.email, buildAppUrl("/auth/confirm?next=/dashboard/onboarding"));
    return { success: "Đã gửi lại mã xác thực. Vui lòng kiểm tra hộp thư." };
  } catch (error) {
    console.error("[dashboard/resend-email] Resend OTP failed", {
      email: parsed.data.email.toLowerCase(),
      message: error instanceof Error ? error.message : String(error)
    });
    return { error: "Không gửi lại được mã xác thực lúc này. Vui lòng thử lại sau ít phút." };
  }
}

export async function requestPasswordResetAction(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
) {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email")
  });

  if (!parsed.success) {
    return { error: "Vui lòng nhập email hợp lệ." };
  }

  if (!(await checkActionRateLimit(`forgot-password:${parsed.data.email.toLowerCase()}`, 3, 15 * 60_000))) {
    return { error: "Bạn yêu cầu đặt lại mật khẩu quá nhanh. Vui lòng chờ thêm trước khi thử lại." };
  }

  const genericSuccess = "Nếu email này tồn tại, LogiVN đã gửi hướng dẫn đặt lại mật khẩu.";

  try {
    await requestPasswordReset(parsed.data.email, buildAppUrl("/auth/confirm?next=/dashboard/reset-password"));
  } catch (error) {
    console.error("[dashboard/forgot-password] Password reset request failed", {
      email: parsed.data.email.toLowerCase(),
      message: error instanceof Error ? error.message : String(error)
    });
  }

  return { success: genericSuccess };
}

export async function updateRecoveredPasswordAction(_prevState: { error?: string } | undefined, formData: FormData) {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword")
  });

  if (!parsed.success) {
    return { error: "Mật khẩu mới cần ít nhất 10 ký tự, có chữ hoa, chữ thường, chữ số và xác nhận khớp." };
  }

  if (!(await checkActionRateLimit("reset-password:session", 5, 15 * 60_000))) {
    return { error: "Bạn đổi mật khẩu quá nhanh. Vui lòng thử lại sau ít phút." };
  }

  try {
    await updateRecoveredPassword(parsed.data.password);
  } catch (error) {
    console.error("[dashboard/reset-password] Password update failed", {
      message: error instanceof Error ? error.message : String(error)
    });
    return { error: "Liên kết đặt lại mật khẩu đã hết hạn hoặc không hợp lệ. Vui lòng yêu cầu liên kết mới." };
  }

  redirect("/dashboard/login?reset=success");
}

export async function logoutAction() {
  await logout();
  redirect("/dashboard/login");
}

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
      planCode: parsed.data.planCode || undefined
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

export async function createCategoryAction(formData: FormData) {
  const session = await requireOperationalAdminSession("menu_management");
  const parsed = categorySchema.parse({ name: formData.get("name") });
  await createCategory(session.restaurantId, parsed.name);
  invalidateRestaurantDashboardCache(session.restaurantId);
  revalidatePath("/dashboard/menu");
  revalidatePath("/dashboard");
  revalidatePath(`/r/${session.restaurant.slug}`);
}

export async function createMenuItemAction(formData: FormData) {
  const session = await requireOperationalAdminSession("menu_management");
  const parsed = menuItemSchema.parse({
    categoryId: formData.get("categoryId"),
    name: formData.get("name"),
    price: formData.get("price"),
    image: formData.get("image") ?? ""
  });
  const uploadedImage = await uploadMenuImageFile({
    restaurantId: session.restaurantId,
    file: formData.get("imageFile")
  });
  const persistedImage = uploadedImage
    ? uploadedImage
    : await persistMenuImageUrl({
        restaurantId: session.restaurantId,
        imageUrl: parsed.image || undefined
      });
  await assertRestaurantResourceLimit({
    restaurantId: session.restaurantId,
    featureKey: "menu_management",
    table: "menu_items",
    label: "món"
  });

  await createMenuItem({
    restaurantId: session.restaurantId,
    ...parsed,
    image: persistedImage ?? (parsed.image || undefined)
  });
  invalidateRestaurantDashboardCache(session.restaurantId);
  revalidatePath("/dashboard/menu");
  revalidatePath("/dashboard");
}

const menuOcrImportItemSchema = z.object({
  categoryName: z.string().trim().max(80).optional().or(z.literal("")),
  name: z.string().trim().min(2).max(120),
  price: z.coerce.number().int().min(1000).max(100000000)
});

export async function importMenuOcrItemsAction(
  _prevState: { error?: string; success?: string; inserted?: number; skipped?: number; categoriesCreated?: number; skippedNames?: string[] } | undefined,
  formData: FormData
) {
  const session = await requireOperationalAdminSession("menu_management");
  const rawItems = String(formData.get("itemsJson") ?? "");
  let parsedJson: unknown = [];

  try {
    parsedJson = JSON.parse(rawItems);
  } catch {
    parsedJson = [];
  }

  const parsed = z.array(menuOcrImportItemSchema).max(80).safeParse(parsedJson);
  if (!parsed.success || parsed.data.length === 0) {
    return { error: "Không có món hợp lệ để nhập vào menu." };
  }

  const result = await importMenuItemsFromDraft({
    restaurantId: session.restaurantId,
    items: parsed.data,
    beforeInsert: async (increment) => {
      await assertRestaurantResourceLimit({
        restaurantId: session.restaurantId,
        featureKey: "menu_management",
        table: "menu_items",
        label: "món",
        increment
      });
    }
  });
  invalidateRestaurantDashboardCache(session.restaurantId);
  revalidatePath("/dashboard/menu");
  revalidatePath("/dashboard");
  revalidatePath(`/r/${session.restaurant.slug}`);

  if (result.inserted === 0) {
    return {
      ...result,
      success: result.skipped > 0 ? `Không thêm món mới vì ${result.skipped} món đã có trong menu.` : "Không có món mới để thêm."
    };
  }

  return {
    ...result,
    success: `Đã thêm ${result.inserted} món vào menu${result.skipped ? `, bỏ qua ${result.skipped} món trùng` : ""}.`
  };
}

export async function deleteMenuItemAction(formData: FormData) {
  const session = await requireOperationalAdminSession("menu_management");
  const itemId = String(formData.get("itemId") ?? "");
  await deleteMenuItem(session.restaurantId, itemId);
  invalidateRestaurantDashboardCache(session.restaurantId);
  revalidatePath("/dashboard/menu");
  revalidatePath("/dashboard");
}

export async function toggleMenuItemAvailabilityAction(formData: FormData) {
  const session = await requireOperationalAdminSession("menu_management");
  const itemId = String(formData.get("itemId") ?? "");
  const isAvailable = String(formData.get("isAvailable") ?? "") === "true";
  await updateMenuItemAvailability(session.restaurantId, itemId, isAvailable);
  invalidateRestaurantDashboardCache(session.restaurantId);
  revalidatePath("/dashboard/menu");
  revalidatePath("/dashboard");
}

export async function updateMenuItemAction(formData: FormData) {
  const session = await requireOperationalAdminSession("menu_management");
  const parsed = updateMenuItemSchema.parse({
    itemId: formData.get("itemId"),
    categoryId: formData.get("categoryId"),
    name: formData.get("name"),
    price: formData.get("price"),
    image: formData.get("image") ?? "",
    isAvailable: formData.get("isAvailable") === "true"
  });
  const uploadedImage = await uploadMenuImageFile({
    restaurantId: session.restaurantId,
    file: formData.get("imageFile")
  });
  const persistedImage = uploadedImage
    ? uploadedImage
    : await persistMenuImageUrl({
        restaurantId: session.restaurantId,
        imageUrl: parsed.image || undefined
      });

  await updateMenuItem({
    restaurantId: session.restaurantId,
    itemId: parsed.itemId,
    categoryId: parsed.categoryId,
    name: parsed.name,
    price: parsed.price,
    image: persistedImage ?? (parsed.image || undefined),
    isAvailable: parsed.isAvailable
  });
  invalidateRestaurantDashboardCache(session.restaurantId);
  revalidatePath("/dashboard/menu");
  revalidatePath("/dashboard");
  revalidatePath(`/r/${session.restaurant.slug}`);
}

export async function createTableAction(formData: FormData) {
  const session = await requireOperationalAdminSession("table_qr");
  const parsed = tableSchema.parse({
    name: formData.get("name"),
    area: formData.get("area"),
    capacity: formData.get("capacity")
  });
  await assertRestaurantResourceLimit({
    restaurantId: session.restaurantId,
    featureKey: "table_qr",
    table: "tables",
    label: "bàn"
  });
  await createTable(session.restaurantId, session.restaurant.slug, parsed);
  invalidateRestaurantDashboardCache(session.restaurantId);
  revalidatePath("/dashboard/tables");
  revalidatePath("/dashboard");
}

export async function updateTableAction(formData: FormData) {
  const session = await requireOperationalAdminSession("table_qr");
  const parsed = updateTableSchema.parse({
    tableId: formData.get("tableId"),
    name: formData.get("name"),
    area: formData.get("area"),
    capacity: formData.get("capacity")
  });
  await updateTable(session.restaurantId, parsed);
  invalidateRestaurantDashboardCache(session.restaurantId);
  revalidatePath("/dashboard/tables");
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
}

export async function toggleTableQrAction(formData: FormData) {
  const session = await requireOperationalAdminSession("table_qr");
  const parsed = tableQrStatusSchema.parse({
    tableId: formData.get("tableId"),
    qrEnabled: formData.get("qrEnabled") === "true"
  });
  await updateTableQrStatus(session.restaurantId, parsed);
  invalidateRestaurantDashboardCache(session.restaurantId);
  revalidatePath("/dashboard/tables");
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
}

export async function deleteTableAction(formData: FormData) {
  const session = await requireOperationalAdminSession("table_qr");
  const parsed = tableIdSchema.parse({
    tableId: formData.get("tableId")
  });
  await deleteTable(session.restaurantId, parsed.tableId);
  invalidateRestaurantDashboardCache(session.restaurantId);
  revalidatePath("/dashboard/tables");
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
}

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

export async function createStaffAction(formData: FormData) {
  const session = await requireOperationalAdminSession("staff_management");
  const parsed = staffInviteSchema.parse({
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role") || "STAFF"
  });
  await assertRestaurantResourceLimit({
    restaurantId: session.restaurantId,
    featureKey: "staff_management",
    table: "users",
    label: "tài khoản nhân viên"
  });

  await createRestaurantUser({
    restaurantId: session.restaurantId,
    email: parsed.email,
    password: parsed.password,
    role: parsed.role
  });

  revalidatePath("/dashboard/staff");
}

export async function updateStaffRoleAction(formData: FormData) {
  const session = await requireOperationalAdminSession("staff_management");
  const parsed = staffRoleSchema.parse({
    userId: formData.get("userId"),
    role: formData.get("role")
  });

  await updateRestaurantUserRole({
    restaurantId: session.restaurantId,
    userId: parsed.userId,
    actorUserId: session.userId,
    role: parsed.role
  });

  revalidatePath("/dashboard/staff");
}

export async function deleteStaffAction(formData: FormData) {
  const session = await requireOperationalAdminSession("staff_management");
  const parsed = staffUserSchema.parse({
    userId: formData.get("userId")
  });

  await deleteRestaurantUser({
    restaurantId: session.restaurantId,
    userId: parsed.userId,
    actorUserId: session.userId
  });

  revalidatePath("/dashboard/staff");
}
