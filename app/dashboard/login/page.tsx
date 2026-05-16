import { headers } from "next/headers";
import { LoginForm } from "@/components/dashboard/login-form";
import { getTenantSlugFromHost, ROOT_DOMAIN } from "@/lib/tenant-domain";

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ authError?: string | string[]; reset?: string | string[]; email?: string | string[]; session?: string | string[] }>;
}) {
  const requestHeaders = await headers();
  const params = await searchParams;
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const tenantSlug = getTenantSlugFromHost(host);

  return (
    <LoginForm
      rootDomain={ROOT_DOMAIN}
      tenantSlug={tenantSlug ?? ""}
      authError={firstParam(params.authError)}
      resetStatus={firstParam(params.reset)}
      sessionStatus={firstParam(params.session)}
      initialEmail={firstParam(params.email)?.trim().toLowerCase() ?? ""}
    />
  );
}
