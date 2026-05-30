import { StaffPinLoginForm } from "@/features/staff/components/staff-pin-login-form";
import { safeProtectedDashboardNextPath } from "@/lib/auth-flow-routes";
import { getRestaurantBySlug } from "@/services/restaurant-service";

export const dynamic = "force-dynamic";

function safeRestaurantSlug(value: string) {
  const slug = value.trim().toLowerCase();
  return /^[a-z0-9-]{2,80}$/.test(slug) ? slug : "";
}

export default async function ScopedStaffLoginPage({
  params,
  searchParams
}: {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ session?: string | string[]; next?: string | string[] }>;
}) {
  const [routeParams, query] = await Promise.all([params, searchParams]);
  const restaurantSlug = safeRestaurantSlug(routeParams.restaurantSlug);
  const restaurant = restaurantSlug ? await getRestaurantBySlug(restaurantSlug).catch(() => null) : null;
  const nextPath = safeProtectedDashboardNextPath(query.next);

  return (
    <StaffPinLoginForm
      mode="pin"
      restaurantSlug={restaurantSlug}
      restaurantName={restaurant?.name ?? restaurantSlug}
      nextPath={nextPath}
    />
  );
}
