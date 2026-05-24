import { redirect } from "next/navigation";
import { RegisterAccountForm } from "@/components/dashboard/register-account-form";
import { buildOnboardingIntentPath, normalizeOnboardingPlan } from "@/lib/auth-onboarding-intent";
import { getAuthUser, getSessionProfile } from "@/lib/session";

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
  const planCode = normalizeOnboardingPlan(params?.plan);
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
    redirect(buildOnboardingIntentPath({ plan: planCode, source, variant, pilotGoal }));
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
