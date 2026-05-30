import { Suspense } from "react";
import { requireDashboardAdminAccess } from "@/lib/dashboard-access";
import { StaffRedesignWorkspace } from "@/features/staff/components/staff-redesign-workspace";
import { getStaffOperationsBundle } from "@/features/staff/services/staff-operations-service";

export const dynamic = "force-dynamic";

export default async function AdminStaffPage() {
  const { session } = await requireDashboardAdminAccess("staff_management");

  return (
    <Suspense fallback={<StaffWorkspaceSkeleton restaurantName={session.restaurant.name} />}>
      <StaffWorkspaceContent
        restaurantId={session.restaurantId}
        userId={session.userId}
        restaurantName={session.restaurant.name}
        restaurantStaffCode={session.restaurant.staffCode ?? null}
      />
    </Suspense>
  );
}

async function StaffWorkspaceContent({
  restaurantId,
  userId,
  restaurantName,
  restaurantStaffCode
}: {
  restaurantId: string;
  userId: string;
  restaurantName: string;
  restaurantStaffCode: string | null;
}) {
  const bundle = await getStaffOperationsBundle(restaurantId, userId);

  return (
    <StaffRedesignWorkspace
      bundle={bundle}
      restaurantId={restaurantId}
      restaurantName={restaurantName}
      restaurantStaffCode={restaurantStaffCode}
    />
  );
}

function StaffWorkspaceSkeleton({ restaurantName }: { restaurantName: string }) {
  return (
    <main className="staff-brand-page dashboard-density min-h-screen text-[#2B2B2B]">
      <aside className="staff-brand-sidebar fixed inset-y-0 left-0 z-40 hidden w-72 border-r lg:flex lg:flex-col">
        <div className="px-6 pb-5 pt-6">
          <div className="h-10 w-36 animate-pulse rounded-xl bg-[#D8D1C7]/55" />
          <div className="mt-3 h-3 w-44 animate-pulse rounded-full bg-[#D8D1C7]/45" />
        </div>
        <div className="space-y-2 px-3">
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className="h-11 animate-pulse rounded-xl bg-[#E5EEE2]/70" />
          ))}
        </div>
      </aside>
      <section className="min-h-screen lg:pl-72">
        <header className="staff-brand-topbar sticky top-0 z-30 hidden h-20 items-center justify-between border-b px-8 lg:flex">
          <div>
            <div className="h-7 w-48 animate-pulse rounded-xl bg-[#D8D1C7]/55" />
            <div className="mt-2 h-3 w-64 animate-pulse rounded-full bg-[#D8D1C7]/40" />
          </div>
          <div className="text-sm font-bold text-[#0F4D3A]">{restaurantName}</div>
        </header>
        <div className="mx-auto grid w-full max-w-[1280px] gap-4 px-5 pb-28 pt-6 sm:px-7 lg:px-8 lg:pb-10 lg:pt-8">
          <section className="staff-brand-panel grid gap-3 p-5">
            <div className="h-7 w-56 animate-pulse rounded-xl bg-[#D8D1C7]/55" />
            <div className="grid gap-3 md:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-xl bg-[#E5EEE2]/70" />
              ))}
            </div>
          </section>
          <section className="staff-brand-panel h-[460px] animate-pulse p-5" />
        </div>
      </section>
    </main>
  );
}
