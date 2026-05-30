import { redirect } from "next/navigation";
import { StaffAppPasswordChangeForm } from "@/features/staff/components/staff-app-password-change-form";
import { getStaffPasswordGateForSession } from "@/features/staff/services/staff-app-auth-service";
import { safeProtectedDashboardNextPath } from "@/lib/auth-flow-routes";
import { getSessionProfile } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function StaffChangePasswordPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const [params, session] = await Promise.all([searchParams, getSessionProfile()]);
  if (!session) redirect("/staff/login");

  const nextPath = safeProtectedDashboardNextPath(params.next) || "/dashboard/staff/mobile";
  const passwordGate = await getStaffPasswordGateForSession(session);
  if (!passwordGate.mustChangePassword && session.role === "STAFF") redirect(nextPath);

  return <StaffAppPasswordChangeForm employeeCode={passwordGate.employeeCode} nextPath={nextPath} />;
}
