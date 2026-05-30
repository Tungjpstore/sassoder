import "server-only";

import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { DASHBOARD_SMOKE_SESSION_COOKIE, dashboardSmokeAuthEnabled, parseDashboardSmokeCookie } from "@/lib/dashboard-smoke-auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { BusinessType, SessionProfile } from "@/types/domain";

type SmokeRestaurantRow = {
  id: string;
  name: string;
  slug: string;
  staff_code?: string | null;
  business_type?: BusinessType | null;
  platform_status?: SessionProfile["restaurant"]["platformStatus"] | null;
};

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export async function getValidDashboardSmokeCookie() {
  if (!dashboardSmokeAuthEnabled()) return null;

  const secret = process.env.DASHBOARD_SMOKE_AUTH_SECRET;
  if (!secret) return null;

  const cookieStore = await cookies();
  const parsed = parseDashboardSmokeCookie(cookieStore.get(DASHBOARD_SMOKE_SESSION_COOKIE)?.value);
  if (!parsed || !safeEqual(parsed.secret, secret)) return null;

  return parsed;
}

export async function getDashboardSmokeSessionProfile(): Promise<SessionProfile | null> {
  const parsed = await getValidDashboardSmokeCookie();
  if (!parsed) return null;

  const supabase = createAdminSupabaseClient();
  let { data, error } = (await supabase
    .from("restaurants")
    .select("id,name,slug,staff_code,business_type,platform_status")
    .eq("slug", parsed.restaurantSlug)
    .maybeSingle()) as { data: SmokeRestaurantRow | null; error: unknown };

  if (error) {
    const fallback = (await supabase
      .from("restaurants")
      .select("id,name,slug,business_type,platform_status")
      .eq("slug", parsed.restaurantSlug)
      .maybeSingle()) as { data: SmokeRestaurantRow | null; error: unknown };
    data = fallback.data;
    error = fallback.error;
  }

  if (error || !data || data.platform_status === "deleted") return null;

  return {
    userId: "00000000-0000-4000-8000-000000000001",
    email: "dashboard-smoke@logivn.local",
    role: "ADMIN",
    accountStatus: "active",
    restaurantId: data.id,
    restaurant: {
      id: data.id,
      name: data.name,
      slug: data.slug,
      staffCode: data.staff_code ?? null,
      businessType: data.business_type ?? null,
      platformStatus: data.platform_status ?? "active"
    }
  };
}
