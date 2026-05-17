import { redirect } from "next/navigation";
import { RegisterAccountForm } from "@/components/dashboard/register-account-form";
import { getAuthUser, getSessionProfile } from "@/lib/session";

function normalizePlan(value: string | string[] | undefined) {
  const plan = Array.isArray(value) ? value[0] : value;
  return plan === "premium" || plan === "pro" ? plan : "pro";
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function RegisterPage({
  searchParams
}: {
  searchParams?: Promise<{
    plan?: string | string[];
    source?: string | string[];
    variant?: string | string[];
    contact?: string | string[];
    restaurant?: string | string[];
    businessType?: string | string[];
    pilotGoal?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const planCode = normalizePlan(params?.plan);
  const source = firstParam(params?.source);
  const variant = firstParam(params?.variant);
  const contact = firstParam(params?.contact);
  const restaurant = firstParam(params?.restaurant);
  const businessType = firstParam(params?.businessType);
  const pilotGoal = firstParam(params?.pilotGoal);
  const session = await getSessionProfile();
  if (session) redirect("/dashboard");

  const user = await getAuthUser();
  if (user) {
    const onboardingParams = new URLSearchParams({ plan: planCode });
    if (source) onboardingParams.set("source", source);
    if (variant) onboardingParams.set("variant", variant);
    if (pilotGoal) onboardingParams.set("pilotGoal", pilotGoal);
    redirect(`/dashboard/onboarding?${onboardingParams.toString()}`);
  }

  return (
    <RegisterAccountForm
      initialPlanCode={planCode}
      initialSource={source}
      initialVariant={variant}
      initialContact={contact}
      initialRestaurantName={restaurant}
      initialBusinessType={businessType}
      initialPilotGoal={pilotGoal}
    />
  );
}
