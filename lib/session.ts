import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isSupabaseAuthSessionCookieName } from "@/lib/supabase/cookie-guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { SessionProfile } from "@/types/domain";

type AuthIdentity = {
  id: string;
  email: string;
};

type ProfileRow = {
  id: string;
  email: string;
  role: SessionProfile["role"];
  account_status?: SessionProfile["accountStatus"];
  restaurant_id: string;
  restaurant:
    | (SessionProfile["restaurant"] & {
        business_type?: SessionProfile["restaurant"]["businessType"];
        platform_status?: SessionProfile["restaurant"]["platformStatus"];
      })
    | Array<
        SessionProfile["restaurant"] & {
          business_type?: SessionProfile["restaurant"]["businessType"];
          platform_status?: SessionProfile["restaurant"]["platformStatus"];
        }
      >
    | null;
};

async function readAuthIdentity(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>): Promise<AuthIdentity | null> {
  try {
    const { data: claimsData } = await supabase.auth.getClaims();
    const claims = claimsData?.claims;
    if (typeof claims?.sub === "string" && typeof claims.email === "string") {
      return { id: claims.sub, email: claims.email };
    }
  } catch {
    // Fall back to getUser below. Server code must not trust an unchecked session cookie.
  }

  try {
    const {
      data: { user }
    } = await supabase.auth.getUser();

    return user?.id && user.email ? { id: user.id, email: user.email } : null;
  } catch {
    return null;
  }
}

async function hasAuthSessionCookie() {
  const cookieStore = await cookies();
  return cookieStore.getAll().some((cookie) => isSupabaseAuthSessionCookieName(cookie.name));
}

export const getAuthUser = cache(async () => {
  if (!(await hasAuthSessionCookie())) return null;
  const supabase = await createServerSupabaseClient();
  return readAuthIdentity(supabase);
});

async function readProfileWithAdmin(user: AuthIdentity) {
  const supabase = createAdminSupabaseClient();
  const initialProfileResult = (await supabase
    .from("users")
    .select("id,email,role,account_status,restaurant_id,restaurant:restaurants(id,name,slug,business_type,platform_status)")
    .eq("id", user.id)
    .maybeSingle()) as any;
  let data = initialProfileResult.data;
  let error = initialProfileResult.error;

  if (error) {
    const legacy = (await supabase
      .from("users")
      .select("id,email,role,restaurant_id,restaurant:restaurants(id,name,slug,business_type)")
      .eq("id", user.id)
      .maybeSingle()) as any;

    data = legacy.data;
    error = legacy.error;
  }

  if (!data && !error) {
    const fallback = (await supabase
      .from("users")
      .select("id,email,role,account_status,restaurant_id,restaurant:restaurants(id,name,slug,business_type,platform_status)")
      .eq("email", user.email.toLowerCase())
      .maybeSingle()) as any;

    data = fallback.data;
    error = fallback.error;

    if (error) {
      const legacyFallback = (await supabase
        .from("users")
        .select("id,email,role,restaurant_id,restaurant:restaurants(id,name,slug,business_type)")
        .eq("email", user.email.toLowerCase())
        .maybeSingle()) as any;

      data = legacyFallback.data;
      error = legacyFallback.error;
    }
  }

  return error ? null : (data as ProfileRow | null);
}

export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  if (!(await hasAuthSessionCookie())) return null;
  const supabase = await createServerSupabaseClient();
  const user = await readAuthIdentity(supabase);
  if (!user) return null;

  const initialProfileResult = (await supabase
    .from("users")
    .select("id,email,role,account_status,restaurant_id,restaurant:restaurants(id,name,slug,business_type,platform_status)")
    .eq("id", user.id)
    .maybeSingle()) as any;
  let data = initialProfileResult.data;
  let error = initialProfileResult.error;

  if (error) {
    const legacy = (await supabase
      .from("users")
      .select("id,email,role,restaurant_id,restaurant:restaurants(id,name,slug,business_type)")
      .eq("id", user.id)
      .maybeSingle()) as any;

    data = legacy.data;
    error = legacy.error;
  }

  if (!data && !error) {
    const fallback = (await supabase
      .from("users")
      .select("id,email,role,account_status,restaurant_id,restaurant:restaurants(id,name,slug,business_type,platform_status)")
      .eq("email", user.email.toLowerCase())
      .maybeSingle()) as any;

    data = fallback.data;
    error = fallback.error;

    if (error) {
      const legacyFallback = (await supabase
        .from("users")
        .select("id,email,role,restaurant_id,restaurant:restaurants(id,name,slug,business_type)")
        .eq("email", user.email.toLowerCase())
        .maybeSingle()) as any;

      data = legacyFallback.data;
      error = legacyFallback.error;
    }
  }

  let profileRow = data as ProfileRow | null;
  if (error || !profileRow || !profileRow.restaurant) {
    profileRow = await readProfileWithAdmin(user);
    if (profileRow?.restaurant) error = null;
  }

  if (error || !profileRow || !profileRow.restaurant) return null;
  if (profileRow.account_status === "blocked") return null;

  const restaurant = Array.isArray(profileRow.restaurant) ? profileRow.restaurant[0] : profileRow.restaurant;
  if (!restaurant) return null;
  if (restaurant.platform_status === "deleted") return null;

  const profile = {
    userId: profileRow.id,
    email: profileRow.email,
    role: profileRow.role,
    accountStatus: profileRow.account_status ?? "active",
    restaurantId: profileRow.restaurant_id,
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      businessType: restaurant.business_type ?? null,
      platformStatus: restaurant.platform_status ?? "active"
    }
  } satisfies SessionProfile;

  return profile;
});

export async function requireSession() {
  const session = await getSessionProfile();
  if (!session) {
    const user = await getAuthUser();
    if (user) redirect("/dashboard/onboarding");
    redirect("/dashboard/login");
  }
  return session;
}

export async function requireOnboardingUser() {
  const session = await getSessionProfile();
  if (session) redirect("/dashboard");

  const user = await getAuthUser();
  if (!user) redirect("/dashboard/login");
  return user;
}
