import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/dashboard/onboarding-form";
import { getAuthUser, getSessionProfile } from "@/lib/session";

function normalizePlan(value: string | string[] | undefined) {
  const plan = Array.isArray(value) ? value[0] : value;
  return plan === "premium" || plan === "pro" ? plan : "pro";
}

export default async function RegisterPage({
  searchParams
}: {
  searchParams?: Promise<{ plan?: string | string[] }>;
}) {
  const params = await searchParams;
  const planCode = normalizePlan(params?.plan);
  const session = await getSessionProfile();
  if (session) redirect("/dashboard");

  const user = await getAuthUser();
  if (user) redirect(`/dashboard/onboarding?plan=${planCode}`);

  return <OnboardingForm mode="register" initialPlanCode={planCode} />;
}
