import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { StaffPinLoginForm } from "@/features/staff/components/staff-pin-login-form";
import { getTenantSlugFromHost } from "@/lib/tenant-domain";

export const dynamic = "force-dynamic";

function safeRestaurantSlug(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return "";
  const slug = raw.trim().toLowerCase();
  return /^[a-z0-9-]{2,80}$/.test(slug) ? slug : "";
}

export default async function StaffLoginPage({
  searchParams
}: {
  searchParams: Promise<{ restaurant?: string | string[]; session?: string | string[] }>;
}) {
  const [params, requestHeaders] = await Promise.all([searchParams, headers()]);
  const querySlug = safeRestaurantSlug(params.restaurant);
  const hostSlug = safeRestaurantSlug(getTenantSlugFromHost(requestHeaders.get("host")));
  const restaurantSlug = querySlug || hostSlug;

  if (restaurantSlug) {
    redirect(`/staff/${restaurantSlug}/login`);
  }

  return <StaffPinLoginForm mode="gate" />;
}
