import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getDashboardDestinationForHost } from "@/lib/dashboard-destination";
import { createServerSupabaseClient, expireSupabaseAuthSessionCookies } from "@/lib/supabase/server";
import { consumeRegistrationIntentForUser, getRestaurantForUser } from "@/services/restaurant-service";

const emailOtpTypes = new Set(["signup", "magiclink", "recovery", "invite", "email_change", "email"]);

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  if (!value.startsWith("/dashboard")) return "/dashboard";
  return value;
}

function redirectUrl(request: Request, pathOrUrl: string) {
  const response = pathOrUrl.startsWith("http")
    ? NextResponse.redirect(pathOrUrl)
    : NextResponse.redirect(new URL(pathOrUrl, request.url));
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function authErrorResponse(request: Request, authError: string) {
  const url = new URL("/dashboard/login", request.url);
  url.searchParams.set("authError", authError);
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");

  if (!tokenHash || !type || !emailOtpTypes.has(type)) {
    return redirectUrl(request, "/dashboard/login?authError=invalid_link");
  }

  const next = safeNextPath(requestUrl.searchParams.get("next") ?? (type === "recovery" ? "/dashboard/reset-password" : null));

  await expireSupabaseAuthSessionCookies();

  const supabase = await createServerSupabaseClient({ ignoreAuthSession: true });
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as EmailOtpType
  });

  if (error) {
    console.error("[auth/confirm] OTP link verification failed", {
      type,
      message: error.message
    });
    return authErrorResponse(request, "confirm");
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user?.id || !user.email) {
    console.error("[auth/confirm] Missing verified user session", {
      type,
      message: userError?.message,
      hasUser: Boolean(user?.id),
      hasEmail: Boolean(user?.email)
    });
    return authErrorResponse(request, "session");
  }

  if (type === "recovery") {
    return redirectUrl(request, next);
  }

  const restaurant =
    (await consumeRegistrationIntentForUser({ userId: user.id, email: user.email })) ??
    (await getRestaurantForUser(user.id, user.email));

  if (restaurant) {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    return redirectUrl(request, getDashboardDestinationForHost(restaurant.slug, host));
  }

  return redirectUrl(request, next === "/dashboard" ? "/dashboard/onboarding" : next);
}
