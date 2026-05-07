import { AppError } from "@/lib/response";
import { createServerSupabaseClient, expireSupabaseAuthSessionCookies } from "@/lib/supabase/server";
import type { UserRole } from "@/types/domain";

export async function loginWithPassword(email: string, password: string) {
  await expireSupabaseAuthSessionCookies();
  const supabase = await createServerSupabaseClient({ ignoreAuthSession: true });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.toLowerCase(),
    password
  });

  if (error || !data.user) {
    throw new AppError("Email hoặc mật khẩu không đúng", 401);
  }

  return data.user;
}

export async function signUpWithEmailOtp({
  email,
  password,
  emailRedirectTo
}: {
  email: string;
  password: string;
  emailRedirectTo: string;
}) {
  await expireSupabaseAuthSessionCookies();
  const supabase = await createServerSupabaseClient({ ignoreAuthSession: true });
  const normalizedEmail = email.toLowerCase();
  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      emailRedirectTo
    }
  });

  if (error || !data.user) {
    throw new AppError(error?.message ?? "Không tạo được tài khoản", 400);
  }

  if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new AppError("Không tạo được tài khoản", 400);
  }

  return data.user;
}

export async function verifySignupEmailOtp(email: string, token: string) {
  await expireSupabaseAuthSessionCookies();
  const supabase = await createServerSupabaseClient({ ignoreAuthSession: true });
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.toLowerCase(),
    token,
    type: "signup"
  });

  if (error || !data.user) {
    throw new AppError(error?.message ?? "Mã xác thực không đúng hoặc đã hết hạn", 400);
  }

  return data.user;
}

export async function resendSignupEmailOtp(email: string, emailRedirectTo: string) {
  const supabase = await createServerSupabaseClient({ ignoreAuthSession: true });
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: email.toLowerCase(),
    options: {
      emailRedirectTo
    }
  });

  if (error) {
    throw new AppError(error.message || "Không gửi lại được mã xác thực", 400);
  }
}

export async function requestPasswordReset(email: string, emailRedirectTo: string) {
  const supabase = await createServerSupabaseClient({ ignoreAuthSession: true });
  const { error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase(), {
    redirectTo: emailRedirectTo
  });

  if (error) {
    throw new AppError("Không gửi được hướng dẫn đặt lại mật khẩu", 400);
  }
}

export async function updateRecoveredPassword(password: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new AppError("Phiên đặt lại mật khẩu đã hết hạn", 401);
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    throw new AppError("Không cập nhật được mật khẩu", 400);
  }

  await supabase.auth.signOut({ scope: "global" });
  await expireSupabaseAuthSessionCookies();
}

export async function logout() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut({ scope: "global" });
  await expireSupabaseAuthSessionCookies();
}

export function assertAdmin(role: UserRole) {
  if (role !== "ADMIN") {
    throw new AppError("Cần quyền quản trị", 403);
  }
}
