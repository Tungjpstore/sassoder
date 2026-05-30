import type { Metadata, Viewport } from "next";
import { requireDashboardAccess } from "@/lib/dashboard-access";
import { StaffMobileRedesignWorkspace } from "@/features/staff/components/staff-mobile-redesign-workspace";
import { getStaffOperationsBundle } from "@/features/staff/services/staff-operations-service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "LogiVN Staff",
  appleWebApp: {
    capable: true,
    title: "LogiVN Staff",
    statusBarStyle: "black-translucent"
  }
};
export const viewport: Viewport = {
  themeColor: "#0F4D3A",
  viewportFit: "cover"
};

export default async function StaffMobilePage() {
  const { session } = await requireDashboardAccess("staff_management");
  const bundle = await getStaffOperationsBundle(session.restaurantId, session.userId, { scope: "self" });

  return (
    <StaffMobileRedesignWorkspace
      initialBundle={bundle}
      restaurantId={session.restaurantId}
      restaurantName={session.restaurant.name}
      restaurantSlug={session.restaurant.slug}
      userId={session.userId}
      enableHeartbeat={bundle.members.length > 0}
    />
  );
}
