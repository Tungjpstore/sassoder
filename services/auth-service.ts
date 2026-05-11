import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { createServerSupabaseClient, expireSupabaseAuthSessionCookies } from "@/lib/supabase/server";
import type { UserRole } from "@/types/domain";

export type AuthEmailRegistrationStatus = "available" | "registered" | "pending_verification";
type SignupOtpDelivery = "resend";

function appendAuthTokenParams(redirectTo: string, tokenHash: string, type: "signup" | "magiclink") {
  const url = new URL(redirectTo);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  return url.toString();
}

function authEmailFrom() {
  return process.env.AUTH_EMAIL_FROM ?? process.env.RESEND_FROM ?? "LogiVN <no-reply@logivn.com>";
}

function buildSignupOtpEmail({
  token,
  actionLink
}: {
  token: string;
  actionLink: string;
}) {
  const html = `<!doctype html>
<html lang="vi">
  <body style="margin:0;background:#fff8ec;font-family:Inter,Arial,sans-serif;color:#102a1f;">
    <div style="max-width:560px;margin:0 auto;padding:28px 16px;">
      <div style="border:1px solid #e5d8c4;border-radius:24px;background:#fffdf8;overflow:hidden;box-shadow:0 22px 70px rgba(15,77,58,.08);">
        <div style="padding:28px 28px 10px;text-align:center;">
          <div style="font-size:13px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:#0f4d3a;">LogiVN</div>
          <h1 style="margin:14px 0 8px;font-size:28px;line-height:1.2;letter-spacing:-.04em;color:#102a1f;">Mã xác thực tài khoản</h1>
          <p style="margin:0;color:#647267;font-size:15px;line-height:1.7;">Nhập mã này tại màn hình xác thực email để tiếp tục tạo quán.</p>
        </div>
        <div style="padding:14px 28px;">
          <div style="background:#f5efe4;border:1px solid #e5d8c4;border-radius:20px;padding:22px;text-align:center;">
            <div style="font-size:12px;font-weight:800;color:#647267;margin-bottom:10px;text-transform:uppercase;letter-spacing:.12em;">Mã OTP 6 số</div>
            <div style="font-size:38px;letter-spacing:.24em;font-weight:900;color:#0f4d3a;">${token}</div>
          </div>
        </div>
        <div style="padding:10px 28px 8px;text-align:center;">
          <a href="${actionLink}" style="display:inline-block;background:#0f4d3a;color:#fff8ec;text-decoration:none;font-weight:900;border-radius:16px;padding:14px 22px;">Xác thực bằng liên kết</a>
        </div>
        <div style="padding:14px 28px 28px;">
          <p style="margin:0;color:#647267;font-size:13px;line-height:1.7;">Nếu bạn không yêu cầu tạo tài khoản LogiVN, có thể bỏ qua email này. Không chia sẻ mã OTP cho người khác.</p>
        </div>
      </div>
    </div>
  </body>
</html>`;

  const text = [
    "LogiVN - Mã xác thực tài khoản",
    "",
    `Mã OTP của bạn: ${token}`,
    "",
    `Hoặc bấm liên kết xác thực: ${actionLink}`,
    "",
    "Nếu bạn không yêu cầu tạo tài khoản LogiVN, có thể bỏ qua email này."
  ].join("\n");

  return { html, text };
}

async function sendSignupOtpEmail({
  to,
  token,
  actionLink
}: {
  to: string;
  token: string;
  actionLink: string;
}): Promise<SignupOtpDelivery> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new AppError("Hệ thống email OTP chưa được cấu hình. Vui lòng liên hệ LogiVN để kiểm tra kênh gửi email.", 500);
  }

  const email = buildSignupOtpEmail({ token, actionLink });
  let response: Response;

  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: authEmailFrom(),
        to: [to],
        subject: "Mã xác thực LogiVN của bạn",
        html: email.html,
        text: email.text
      }),
      signal: AbortSignal.timeout(12_000)
    });
  } catch {
    throw new AppError("Không kết nối được dịch vụ gửi email OTP. Vui lòng thử lại sau ít phút.", 502);
  }

  const payload = (await response.json().catch(() => null)) as { message?: string; name?: string } | null;
  if (!response.ok) {
    throw new AppError(payload?.message || "Không gửi được email OTP qua Resend.", 502);
  }

  return "resend";
}

async function generateSignupOtpEmail({
  email,
  password,
  emailRedirectTo
}: {
  email: string;
  password: string;
  emailRedirectTo: string;
}) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: {
      redirectTo: emailRedirectTo
    }
  });

  if (error || !data.properties?.email_otp || !data.properties.hashed_token || !data.user) {
    throw new AppError(error?.message || "Không tạo được mã OTP đăng ký.", 400);
  }

  const actionLink = appendAuthTokenParams(emailRedirectTo, data.properties.hashed_token, "signup");
  await sendSignupOtpEmail({
    to: email,
    token: data.properties.email_otp,
    actionLink
  });

  return data.user;
}

async function generateMagiclinkOtpEmail({
  email,
  emailRedirectTo
}: {
  email: string;
  emailRedirectTo: string;
}) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      redirectTo: emailRedirectTo
    }
  });

  if (error || !data.properties?.email_otp || !data.properties.hashed_token) {
    throw new AppError(error?.message || "Không tạo được mã OTP xác thực.", 400);
  }

  const actionLink = appendAuthTokenParams(emailRedirectTo, data.properties.hashed_token, "magiclink");
  await sendSignupOtpEmail({
    to: email,
    token: data.properties.email_otp,
    actionLink
  });
}

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
  const normalizedEmail = email.toLowerCase();
  return generateSignupOtpEmail({
    email: normalizedEmail,
    password,
    emailRedirectTo
  });
}

export async function verifySignupEmailOtp(email: string, token: string) {
  await expireSupabaseAuthSessionCookies();
  const supabase = await createServerSupabaseClient({ ignoreAuthSession: true });
  const normalizedEmail = email.toLowerCase();
  const types = ["signup", "email", "magiclink"] as const;
  let lastErrorMessage = "";

  for (const type of types) {
    const { data, error } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token,
      type
    });

    if (!error && data.user) return data.user;
    lastErrorMessage = error?.message || lastErrorMessage;
  }

  throw new AppError(lastErrorMessage || "Mã xác thực không đúng hoặc đã hết hạn", 400);
}

export async function resendSignupEmailOtp(email: string, emailRedirectTo: string) {
  await generateMagiclinkOtpEmail({
    email: email.toLowerCase(),
    emailRedirectTo
  });
}

export async function getAuthEmailRegistrationStatus(email: string): Promise<AuthEmailRegistrationStatus> {
  const supabase = createAdminSupabaseClient();
  const normalizedEmail = email.trim().toLowerCase();
  const now = new Date().toISOString();

  const [profileResult, pendingIntentResult] = await Promise.all([
    supabase.from("users").select("id").eq("email", normalizedEmail).maybeSingle(),
    supabase
      .from("registration_intents")
      .select("id")
      .eq("email", normalizedEmail)
      .is("consumed_at", null)
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  throwIfSupabaseError(profileResult.error);
  throwIfSupabaseError(pendingIntentResult.error);

  if (profileResult.data) return "registered";
  if (pendingIntentResult.data) return "pending_verification";
  return "available";
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
