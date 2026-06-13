import { ForgotPasswordForm } from "@/components/dashboard/forgot-password-form";
import { safeProtectedDashboardNextPath } from "@/lib/auth-flow-routes";
import { redirectAuthenticatedDashboardUser } from "@/lib/session";

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ForgotPasswordPage({
  searchParams
}: {
  searchParams: Promise<{ expired?: string | string[]; email?: string | string[]; next?: string | string[] }>;
}) {
  const params = await searchParams;
  await redirectAuthenticatedDashboardUser(params.next);
  const initialEmail = firstParam(params.email)?.trim().toLowerCase() ?? "";
  const nextPath = safeProtectedDashboardNextPath(params.next);

  return <ForgotPasswordForm initialEmail={initialEmail} nextPath={nextPath} expired={Boolean(firstParam(params.expired))} />;
}
