import { headers } from "next/headers";
import { LoginForm } from "@/components/dashboard/login-form";
import { firstStringParam, safeProtectedDashboardNextPath } from "@/lib/auth-flow-routes";
import { redirectAuthenticatedDashboardUser } from "@/lib/session";
import { getTenantSlugFromHost, ROOT_DOMAIN } from "@/lib/tenant-domain";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ authError?: string | string[]; reset?: string | string[]; email?: string | string[]; session?: string | string[]; next?: string | string[] }>;
}) {
  const requestHeaders = await headers();
  const params = await searchParams;
  await redirectAuthenticatedDashboardUser(params.next);
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const tenantSlug = getTenantSlugFromHost(host);

  return (
    <LoginForm
      rootDomain={ROOT_DOMAIN}
      tenantSlug={tenantSlug ?? ""}
      authError={firstStringParam(params.authError)}
      resetStatus={firstStringParam(params.reset)}
      sessionStatus={firstStringParam(params.session)}
      initialEmail={firstStringParam(params.email).trim().toLowerCase()}
      nextPath={safeProtectedDashboardNextPath(params.next)}
    />
  );
}
