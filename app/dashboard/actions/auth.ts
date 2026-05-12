"use server";

import { redirect } from "next/navigation";
import { buildAppUrl } from "@/lib/app-url";
import { getSessionProfile } from "@/lib/session";
import {
  emailOtpSchema,
  forgotPasswordSchema,
  loginSchema,
  registerAccountSchema,
  registerOnboardingSchema,
  resendEmailOtpSchema,
  resetPasswordSchema
} from "@/lib/validators";
import {
  getAuthEmailRegistrationStatus,
  loginWithPassword,
  logout,
  requestPasswordReset,
  resendSignupEmailOtp,
  signUpWithEmailOtp,
  updateRecoveredPassword,
  verifySignupEmailOtp
} from "@/services/auth-service";
import { consumeRegistrationIntentForUser, createRegistrationIntent } from "@/services/restaurant-service";
import { checkActionRateLimit, getDashboardDestination } from "./shared";

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
