"use server";

import { redirect } from "next/navigation";
import { buildAppUrl } from "@/lib/app-url";
import { authEmailDeliveryUnavailableMessage, isAuthEmailDeliveryConfigured } from "@/lib/auth-email-delivery";
import { safeDashboardNextPath, safeProtectedDashboardNextPath, verifyEmailPath } from "@/lib/auth-flow-routes";
import { buildOnboardingIntentPath, buildOnboardingIntentParams, normalizeOnboardingPlan } from "@/lib/auth-onboarding-intent";
import { validateOnboardingTableCount } from "@/lib/billing/plan-limits";
import { AppError } from "@/lib/response";
import { getSessionProfile } from "@/lib/session";
import {
  emailOtpSchema,
  forgotPasswordSchema,
  loginSchema,
  pinLoginSchema,
  registerAccountSchema,
  registerOnboardingSchema,
  resendEmailOtpSchema,
  resetPasswordSchema,
  staffAppLoginSchema,
  staffAppPasswordChangeSchema
} from "@/lib/validators";
import {
  getAuthEmailRegistrationStatus,
  loginWithPassword,
  logout,
  requestPasswordReset,
  resendSignupEmailOtp,
  signUpWithEmailOtp,
  updateRecoveredPassword,
  verifyRecoveryOtpAndUpdatePassword,
  verifySignupEmailOtp
} from "@/services/auth-service";
import { loginWithStaffPin } from "@/features/staff/services/staff-pin-service";
import { changeOwnStaffAppPassword, loginWithStaffAppPassword } from "@/features/staff/services/staff-app-auth-service";
import { consumeRegistrationIntentForUser, createRegistrationIntent } from "@/services/restaurant-service";
import { checkActionRateLimit, getDashboardDestination } from "./shared";

export async function loginAction(_prevState: { error?: string; redirectTo?: string } | undefined, formData: FormData) {
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
    const status = await getAuthEmailRegistrationStatus(parsed.data.email).catch(() => null);
    if (status === "pending_verification") {
      const next = safeDashboardNextPath(formData.get("next"));
      return {
        error: "Email này chưa xác thực. LogiVN sẽ mở màn hình nhập mã OTP.",
        redirectTo: verifyEmailPath(parsed.data.email.toLowerCase(), next)
      };
    }

    return { error: "Email hoặc mật khẩu không đúng." };
  }

  const session = await getSessionProfile();
  if (!session) redirect("/dashboard/onboarding");

  const next = safeProtectedDashboardNextPath(formData.get("next"));
  if (next) redirect(next);

  redirect(await getDashboardDestination(session.restaurant.slug));
}

export async function pinLoginAction(_prevState: { error?: string } | undefined, formData: FormData) {
  const parsed = pinLoginSchema.safeParse({
    restaurantSlug: formData.get("restaurantSlug"),
    pin: formData.get("pin")
  });

  if (!parsed.success) {
    return { error: "Vui lòng nhập mã quán và PIN gồm 4-8 chữ số." };
  }

  if (!(await checkActionRateLimit(`pin-login:${parsed.data.restaurantSlug}`, 6, 60_000))) {
    return { error: "Bạn thử PIN quá nhanh. Vui lòng chờ một chút." };
  }

  try {
    await loginWithStaffPin({
      restaurantSlug: parsed.data.restaurantSlug,
      pin: parsed.data.pin
    });
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    return { error: "PIN hoặc mã quán không đúng." };
  }

  const session = await getSessionProfile();
  if (!session) redirect("/dashboard/onboarding");

  const next = safeProtectedDashboardNextPath(formData.get("next"));
  redirect(next || "/dashboard/staff/mobile");
}

export async function staffAppLoginAction(_prevState: { error?: string } | undefined, formData: FormData) {
  const parsed = staffAppLoginSchema.safeParse({
    employeeCode: formData.get("employeeCode"),
    password: formData.get("password")
  });

  if (!parsed.success) {
    return { error: "Vui lòng nhập mã nhân viên và mật khẩu app." };
  }

  if (!(await checkActionRateLimit(`staff-app-login:${parsed.data.employeeCode}`, 8, 60_000))) {
    return { error: "Bạn thử đăng nhập quá nhanh. Vui lòng chờ một chút." };
  }

  let loginResult: Awaited<ReturnType<typeof loginWithStaffAppPassword>>;
  try {
    loginResult = await loginWithStaffAppPassword(parsed.data);
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    return { error: "Mã nhân viên hoặc mật khẩu không đúng." };
  }

  const session = await getSessionProfile();
  if (!session) redirect("/dashboard/onboarding");

  const next = safeProtectedDashboardNextPath(formData.get("next"));
  if (loginResult.mustChangePassword) {
    const params = new URLSearchParams({ next: next || "/dashboard/staff/mobile" });
    redirect(`/staff/change-password?${params.toString()}`);
  }

  redirect(next || "/dashboard/staff/mobile");
}

export async function staffAppPasswordChangeAction(_prevState: { error?: string; success?: string } | undefined, formData: FormData) {
  const parsed = staffAppPasswordChangeSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword")
  });

  if (!parsed.success) {
    return { error: parsed.error.issues.map((issue) => issue.message).join(" ") || "Mật khẩu mới chưa hợp lệ." };
  }

  const session = await getSessionProfile();

  if (!session) return { error: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." };

  if (!(await checkActionRateLimit(`staff-password-change:${session.userId}`, 5, 10 * 60_000))) {
    return { error: "Bạn đổi mật khẩu quá nhanh. Vui lòng thử lại sau vài phút." };
  }

  try {
    await changeOwnStaffAppPassword({
      session,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword
    });
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    return { error: "Không đổi được mật khẩu app lúc này." };
  }

  const next = safeProtectedDashboardNextPath(formData.get("next"));
  redirect(next || "/dashboard/staff/mobile");
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
  const planCode = normalizeOnboardingPlan(formData.get("planCode"));
  const source = String(formData.get("source") ?? "").trim().slice(0, 80);
  const variant = String(formData.get("variant") ?? "").trim().slice(0, 40);
  const pilotGoal = String(formData.get("pilotGoal") ?? "").trim().slice(0, 80);
  const restaurantName = String(formData.get("restaurantName") ?? "").trim().slice(0, 140);
  const businessType = String(formData.get("businessType") ?? "").trim().slice(0, 80);
  const onboardingIntent = { plan: planCode, source, variant, pilotGoal };
  const onboardingParams = buildOnboardingIntentParams(onboardingIntent);
  const onboardingPath = buildOnboardingIntentPath(onboardingIntent);

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
        redirectTo: verifyEmailPath(email, onboardingPath)
      };
    }
    if (!isAuthEmailDeliveryConfigured()) {
      return { error: authEmailDeliveryUnavailableMessage };
    }

    await signUpWithEmailOtp({
      email,
      password: parsed.data.password,
      emailRedirectTo: buildAppUrl(`/auth/confirm?next=${encodeURIComponent(onboardingPath)}`),
      metadata: {
        planCode: onboardingParams.get("plan"),
        source: source || undefined,
        variant: variant || undefined,
        pilotGoal: pilotGoal || undefined,
        restaurantName: restaurantName || undefined,
        businessType: businessType || undefined
      }
    });

    return {
      success: "Đã gửi email xác thực. Vui lòng kiểm tra hộp thư để tiếp tục.",
      redirectTo: verifyEmailPath(email, onboardingPath)
    };
  } catch (error) {
    let emailRetryError: unknown;
    try {
      await resendSignupEmailOtp(email, buildAppUrl(`/auth/confirm?next=${encodeURIComponent(onboardingPath)}`));
      return {
        success: "Email này đang chờ xác thực. LogiVN đã gửi lại email xác thực.",
        redirectTo: verifyEmailPath(email, onboardingPath)
      };
    } catch (caughtEmailRetryError) {
      emailRetryError = caughtEmailRetryError;
      // Keep the public error intentionally generic so we do not leak account state.
    }

    console.error("[dashboard/register] Account registration failed", {
      email,
      message: error instanceof Error ? error.message : String(error),
      retryMessage: emailRetryError instanceof Error ? emailRetryError.message : emailRetryError ? String(emailRetryError) : undefined
    });
    if (emailRetryError instanceof AppError && emailRetryError.status >= 500) {
      return { error: emailRetryError.message };
    }
    if (error instanceof AppError && error.status >= 500) {
      return { error: error.message };
    }
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

  const tableLimit = validateOnboardingTableCount({
    planCode: parsed.data.planCode,
    tableCount: parsed.data.tableCount
  });
  if (!tableLimit.ok) return { error: tableLimit.message };

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
        redirectTo: verifyEmailPath(parsed.data.email.toLowerCase(), "/dashboard/onboarding")
      };
    }
    if (!isAuthEmailDeliveryConfigured()) {
      return { error: authEmailDeliveryUnavailableMessage };
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
        planCode: tableLimit.planCode
      }
    });

    return {
      success: "Đã gửi mã xác thực đến email của bạn.",
      redirectTo: verifyEmailPath(parsed.data.email.toLowerCase(), "/dashboard/onboarding")
    };
  } catch (error) {
    console.error("[dashboard/register] Registration failed", {
      email: parsed.data.email.toLowerCase(),
      message: error instanceof Error ? error.message : String(error)
    });
    if (error instanceof AppError && error.status >= 500) {
      return { error: error.message };
    }
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

  let destination = safeDashboardNextPath(formData.get("next")) || "/dashboard/onboarding";
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
    const nextPath = safeDashboardNextPath(formData.get("next")) || "/dashboard/onboarding";
    await resendSignupEmailOtp(parsed.data.email, buildAppUrl(`/auth/confirm?next=${encodeURIComponent(nextPath)}`));
    return { success: "Đã gửi lại mã xác thực. Vui lòng kiểm tra hộp thư." };
  } catch (error) {
    console.error("[dashboard/resend-email] Email OTP retry failed", {
      email: parsed.data.email.toLowerCase(),
      message: error instanceof Error ? error.message : String(error)
    });
    return { error: "Không gửi lại được mã xác thực lúc này. Vui lòng thử lại sau ít phút." };
  }
}

export async function resendPasswordResetOtpAction(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
) {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email")
  });

  if (!parsed.success) {
    return { error: "Vui lòng nhập email hợp lệ." };
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  if (!(await checkActionRateLimit(`reset-resend:${normalizedEmail}`, 3, 15 * 60_000))) {
    return { error: "Bạn yêu cầu gửi lại mã quá nhanh. Vui lòng chờ thêm trước khi thử lại." };
  }

  const next = safeProtectedDashboardNextPath(formData.get("next"));
  const resetCallbackPath = next ? `/dashboard/reset-password?next=${encodeURIComponent(next)}` : "/dashboard/reset-password";

  try {
    await requestPasswordReset(normalizedEmail, buildAppUrl(resetCallbackPath));
  } catch (error) {
    console.error("[dashboard/reset-password] Recovery OTP email failed", {
      email: normalizedEmail,
      message: error instanceof Error ? error.message : String(error)
    });
  }

  return { success: "Nếu email này tồn tại, LogiVN đã gửi lại mã đặt mật khẩu." };
}

export async function requestPasswordResetAction(
  _prevState: { error?: string; success?: string; redirectTo?: string } | undefined,
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

  const normalizedEmail = parsed.data.email.toLowerCase();
  const next = safeProtectedDashboardNextPath(formData.get("next"));
  const genericSuccess = "Nếu email này tồn tại, LogiVN đã gửi mã OTP đặt lại mật khẩu.";
  const resetCallbackPath = next ? `/dashboard/reset-password?next=${encodeURIComponent(next)}` : "/dashboard/reset-password";

  try {
    await requestPasswordReset(parsed.data.email, buildAppUrl(resetCallbackPath));
  } catch (error) {
    console.error("[dashboard/forgot-password] Password reset request failed", {
      email: normalizedEmail,
      message: error instanceof Error ? error.message : String(error)
    });
  }

  const resetParams = new URLSearchParams({ email: normalizedEmail, otp: "1" });
  if (next) resetParams.set("next", next);

  return {
    success: genericSuccess,
    redirectTo: `/dashboard/reset-password?${resetParams.toString()}`
  };
}

export async function updateRecoveredPasswordAction(_prevState: { error?: string } | undefined, formData: FormData) {
  const parsed = resetPasswordSchema.safeParse({
    email: formData.get("email"),
    token: formData.get("token"),
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
    if (parsed.data.email && parsed.data.token) {
      await verifyRecoveryOtpAndUpdatePassword({
        email: parsed.data.email,
        token: parsed.data.token,
        password: parsed.data.password
      });
    } else {
      await updateRecoveredPassword(parsed.data.password);
    }
  } catch (error) {
    console.error("[dashboard/reset-password] Password update failed", {
      message: error instanceof Error ? error.message : String(error)
    });
    return { error: "Mã OTP hoặc phiên đặt lại mật khẩu đã hết hạn. Vui lòng yêu cầu mã mới." };
  }

  const session = await getSessionProfile();
  const next = safeProtectedDashboardNextPath(formData.get("next"));
  if (!session) redirect("/dashboard/onboarding");
  if (next) redirect(next);
  redirect(await getDashboardDestination(session.restaurant.slug));
}

export async function logoutAction() {
  await logout();
  redirect("/dashboard/login");
}
