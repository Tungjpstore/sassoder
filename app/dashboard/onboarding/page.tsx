import { OnboardingForm } from "@/components/dashboard/onboarding-form";
import { requireOnboardingUser } from "@/lib/session";

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
  const user = await requireOnboardingUser();

  return <OnboardingForm email={user.email ?? ""} initialPlanCode={normalizePlan(params?.plan)} />;
}
