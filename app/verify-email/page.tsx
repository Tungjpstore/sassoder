import { VerifyEmailForm } from "@/components/dashboard/verify-email-form";
import { firstStringParam, safeDashboardNextPath } from "@/lib/auth-flow-routes";
import { redirectAuthenticatedDashboardUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function VerifyEmailAliasPage({
  searchParams
}: {
  searchParams: Promise<{ email?: string | string[]; next?: string | string[] }>;
}) {
  const params = await searchParams;
  await redirectAuthenticatedDashboardUser(params.next);
  return <VerifyEmailForm email={firstStringParam(params.email)} nextPath={safeDashboardNextPath(params.next)} />;
}
