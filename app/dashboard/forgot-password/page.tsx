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

  return (
    <main className="min-h-svh overflow-x-hidden bg-[#f7f8fa] text-[#111827]">
      <section className="auth-fade-in mx-auto flex min-h-svh w-full max-w-[400px] flex-col justify-center gap-4 px-4 py-6 sm:px-5">
        {firstParam(params.expired) ? (
          <p className="rounded-md border border-[#F28C28]/35 bg-[#fff7ed] p-3 text-center text-sm font-semibold text-[#9a4a17]">Mã đặt lại đã hết hạn.</p>
        ) : null}
        <ForgotPasswordForm initialEmail={initialEmail} nextPath={nextPath} />
      </section>
    </main>
  );
}
