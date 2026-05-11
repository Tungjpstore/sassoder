import { RestaurantOnboardingFlow } from "@/components/dashboard/restaurant-onboarding-flow";
import { requireOnboardingUser } from "@/lib/session";
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
  const [user, plans] = await Promise.all([requireOnboardingUser(), getPublicActivePlans()]);

  return <RestaurantOnboardingFlow email={user.email ?? ""} initialPlanCode={normalizePlan(params?.plan)} plans={plans} />;
}
