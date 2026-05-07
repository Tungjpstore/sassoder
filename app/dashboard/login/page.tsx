import { headers } from "next/headers";
import { LoginForm } from "@/components/dashboard/login-form";
import { getTenantSlugFromHost, ROOT_DOMAIN } from "@/lib/tenant-domain";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ authError?: string; reset?: string }>;
}) {
  const requestHeaders = await headers();
  const params = await searchParams;
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const tenantSlug = getTenantSlugFromHost(host);

  return <LoginForm rootDomain={ROOT_DOMAIN} tenantSlug={tenantSlug ?? ""} authError={params.authError} resetStatus={params.reset} />;
}
