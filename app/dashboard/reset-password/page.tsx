import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/dashboard/reset-password-form";
import { safeProtectedDashboardNextPath } from "@/lib/auth-flow-routes";
import { getAuthUser } from "@/lib/session";

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ResetPasswordPage({
  searchParams
}: {
  searchParams?: Promise<{ email?: string | string[]; otp?: string | string[]; next?: string | string[] }>;
}) {
  const params = await searchParams;
  const resetEmail = firstParam(params?.email)?.trim().toLowerCase() ?? "";
  const requiresOtp = Boolean(resetEmail && firstParam(params?.otp));
  const nextPath = safeProtectedDashboardNextPath(params?.next);
  const user = await getAuthUser();
  if (!user && !requiresOtp) redirect("/dashboard/forgot-password?expired=1");

  return <ResetPasswordForm email={user?.email ?? resetEmail} requiresOtp={!user && requiresOtp} nextPath={nextPath} />;
}
