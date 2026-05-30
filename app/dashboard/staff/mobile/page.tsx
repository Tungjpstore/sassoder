import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { requireDashboardAccess } from "@/lib/dashboard-access";
import { StaffMobileRedesignWorkspace } from "@/features/staff/components/staff-mobile-redesign-workspace";
import { getStaffPasswordGateForSession } from "@/features/staff/services/staff-app-auth-service";
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

  return (
    <Suspense fallback={<StaffMobileSkeleton />}>
      <StaffMobileContent
        restaurantId={session.restaurantId}
        restaurantName={session.restaurant.name}
        restaurantSlug={session.restaurant.slug}
        userId={session.userId}
        session={session}
      />
    </Suspense>
  );
}

async function StaffMobileContent({
  restaurantId,
  restaurantName,
  restaurantSlug,
  userId,
  session
}: {
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  userId: string;
  session: Awaited<ReturnType<typeof requireDashboardAccess>>["session"];
}) {
  const passwordGatePromise = getStaffPasswordGateForSession(session);
  const bundlePromise = getStaffOperationsBundle(restaurantId, userId, { scope: "self" });
  const passwordGate = await passwordGatePromise;
  if (passwordGate.mustChangePassword) {
    redirect(`/staff/change-password?${new URLSearchParams({ next: "/dashboard/staff/mobile" }).toString()}`);
  }

  const bundle = await bundlePromise;

  return (
    <StaffMobileRedesignWorkspace
      initialBundle={bundle}
      restaurantId={restaurantId}
      restaurantName={restaurantName}
      restaurantSlug={restaurantSlug}
      userId={userId}
      enableHeartbeat={bundle.members.length > 0}
    />
  );
}

function StaffMobileSkeleton() {
  return (
    <main className="staff-brand-page staff-brand-page--mobile grid min-h-screen gap-4 p-5 text-[#2B2B2B]">
      <header className="staff-brand-mobile-header sticky top-0 z-30 -mx-5 -mt-5 flex h-[68px] items-center justify-between border-b px-5">
        <div className="h-9 w-36 animate-pulse rounded-xl bg-[#D8D1C7]/55" />
        <div className="h-11 w-11 animate-pulse rounded-full bg-[#E5EEE2]" />
      </header>
      <section className="staff-brand-panel p-5">
        <div className="h-7 w-48 animate-pulse rounded-xl bg-[#D8D1C7]/55" />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="h-24 animate-pulse rounded-xl bg-[#E5EEE2]/70" />
          <div className="h-24 animate-pulse rounded-xl bg-[#E5EEE2]/70" />
        </div>
      </section>
      <section className="staff-brand-panel h-80 animate-pulse p-5" />
      <nav className="staff-brand-bottom-nav fixed inset-x-0 bottom-0 z-50 grid h-[88px] grid-cols-5 border-t px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="mx-auto h-12 w-12 animate-pulse rounded-xl bg-[#E5EEE2]/80" />
        ))}
      </nav>
    </main>
  );
}
