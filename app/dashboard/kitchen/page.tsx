import { Suspense } from "react";
import { RealKitchenWorkspaceV2 } from "@/components/dashboard-v2/real/kitchen-workspace-v2";
import { ProductionDashboardShell as AdminShell } from "@/components/dashboard-v2/production-shell";
import { requireDashboardAccess } from "@/lib/dashboard-access";
import { listKitchenOrdersForRestaurant } from "@/services/order-service";

export const dynamic = "force-dynamic";

export default async function AdminKitchenPage() {
  const { session, entitlement } = await requireDashboardAccess("kitchen_screen");

  return (
    <AdminShell
      title="Màn hình bếp"
      restaurantName={session.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Tập trung vào lượt gọi món cần xử lý, hẹn giờ ra món và cảnh báo quá giờ."
    >
      <Suspense fallback={<KitchenBoardSkeleton />}>
        <KitchenBoardContent restaurantId={session.restaurantId} />
      </Suspense>
    </AdminShell>
  );
}

async function KitchenBoardContent({ restaurantId }: { restaurantId: string }) {
  const initialOrders = await listKitchenOrdersForRestaurant(restaurantId);
  return <RealKitchenWorkspaceV2 initialOrders={initialOrders} restaurantId={restaurantId} />;
}

function KitchenBoardSkeleton() {
  return (
    <div className="dashboard-panel animate-pulse p-4">
      <div className="h-12 w-64 rounded-xl bg-[#A9C5A1]/18" />
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-44 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)]" />
        ))}
      </div>
    </div>
  );
}
