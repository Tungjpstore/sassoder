import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  authenticatedDashboardLandingPath,
  dashboardLoginPathForOnboarding,
  onboardingDashboardLandingPath
} from "@/lib/auth-flow-routes";
import { getDashboardSmokeSessionProfile } from "@/lib/dashboard-smoke-session";
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
            staff_code?: SessionProfile["restaurant"]["staffCode"];
            business_type?: SessionProfile["restaurant"]["businessType"];
            platform_status?: SessionProfile["restaurant"]["platformStatus"];
          })
        | Array<
            SessionProfile["restaurant"] & {
              staff_code?: SessionProfile["restaurant"]["staffCode"];
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
      return {
        id: claims.sub,
        email: claims.email
      };
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
    .select("id,email,role,account_status,restaurant_id,restaurant:restaurants(id,name,slug,staff_code,business_type,platform_status)")
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

  return error ? null : (data as ProfileRow | null);
}

async function readStaffRevocationWithAdmin(restaurantId: string, userId: string) {
  const supabase = createAdminSupabaseClient();
  return (await supabase
    .from("staff_members")
    .select("auth_revoked_at,archived_at,employment_status")
    .eq("restaurant_id", restaurantId)
    .eq("user_id", userId)
    .maybeSingle()) as any;
}

export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  const smokeProfile = await getDashboardSmokeSessionProfile();
  if (smokeProfile) return smokeProfile;

  if (!(await hasAuthSessionCookie())) return null;
  const supabase = await createServerSupabaseClient();
  const user = await readAuthIdentity(supabase);
  if (!user) return null;

  const initialProfileResult = (await supabase
    .from("users")
    .select("id,email,role,account_status,restaurant_id,restaurant:restaurants(id,name,slug,staff_code,business_type,platform_status)")
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

  let profileRow = data as ProfileRow | null;
  if (error || !profileRow || !profileRow.restaurant) {
    profileRow = await readProfileWithAdmin(user);
    if (profileRow?.restaurant) error = null;
  }

  if (error || !profileRow || !profileRow.restaurant) return null;
  if (profileRow.account_status === "blocked") return null;

  // A valid Supabase JWT is not enough after an HR force logout. Bind any
  // linked staff profile (including non-owner ADMIN staff) to the auth epoch.
  const staffRevocation = await readStaffRevocationWithAdmin(profileRow.restaurant_id, user.id);
  if (staffRevocation.error) return null;
  if (staffRevocation.data) {
    // Keep the epoch closed until the staff member proves credentials again.
    // Comparing only JWT `iat` lets a refresh token bypass force logout.
    if (staffRevocation.data.auth_revoked_at) return null;
    if (staffRevocation.data.archived_at || staffRevocation.data.employment_status !== "active") return null;
  } else if (profileRow.role === "STAFF") {
    // STAFF sessions must always have a staff record to bind the auth epoch.
    return null;
  }

  const restaurant = Array.isArray(profileRow.restaurant) ? profileRow.restaurant[0] : profileRow.restaurant;
  if (!restaurant) return null;
  // Platform-suspended tenants must not keep a normal owner session.
  if (restaurant.platform_status === "deleted" || restaurant.platform_status === "suspended") return null;

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
      staffCode: restaurant.staff_code ?? null,
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

export async function requireOnboardingUserForPath(next?: unknown) {
  const session = await getSessionProfile();
  if (session) redirect(authenticatedDashboardLandingPath(next));

  const user = await getAuthUser();
  if (!user) {
    redirect(dashboardLoginPathForOnboarding(next));
  }
  return user;
}

export async function redirectAuthenticatedDashboardUser(next?: unknown) {
  const session = await getSessionProfile();
  if (session) redirect(authenticatedDashboardLandingPath(next));

  const user = await getAuthUser();
  if (user) redirect(onboardingDashboardLandingPath(next));
}
