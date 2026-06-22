import { RestaurantOnboardingFlowV2 } from "@/components/dashboard-v2/onboarding/restaurant-onboarding-flow-v2";
import { requireOnboardingUserForPath } from "@/lib/session";
import { getPublicActivePlans } from "@/services/subscription-service";

export const dynamic = "force-dynamic";

function normalizePlan(value: string | string[] | undefined) {
  const plan = Array.isArray(value) ? value[0] : value;
  return plan === "premium" || plan === "pro" ? plan : "pro";
}

export default async function AdminOnboardingPage({
  searchParams
}: {
  searchParams?: Promise<{ plan?: string | string[] }>;
}) {
  const params = await searchParams;
  const onboardingPath = `/dashboard/onboarding?plan=${encodeURIComponent(normalizePlan(params?.plan))}`;
  const [user, plans] = await Promise.all([requireOnboardingUserForPath(onboardingPath), getPublicActivePlans()]);

  return <RestaurantOnboardingFlowV2 email={user.email ?? ""} initialPlanCode={normalizePlan(params?.plan)} plans={plans} />;
}
