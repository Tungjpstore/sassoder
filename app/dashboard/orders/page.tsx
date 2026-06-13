import { Suspense } from "react";
import { ProductionDashboardShell as AdminShell } from "@/components/dashboard-v2/production-shell";
import { RealOrdersWorkspaceV2 } from "@/components/dashboard-v2/real/orders-workspace-v2";
import { requireDashboardAccess } from "@/lib/dashboard-access";
import { listOrdersForRestaurant } from "@/services/order-service";
import { listOpenServiceRequests } from "@/services/service-request-service";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const { session, entitlement } = await requireDashboardAccess("order_realtime");

  return (
    <AdminShell
      title="Đơn hàng realtime"
      restaurantName={session.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Đơn, bếp, thanh toán và giao hàng."
      showLiveActionCenter={false}
    >
      <Suspense fallback={<OrdersBoardSkeleton />}>
        <OrdersBoardContent restaurantId={session.restaurantId} canManageTestOrders={session.role === "ADMIN"} />
      </Suspense>
    </AdminShell>
  );
}

async function OrdersBoardContent({ restaurantId, canManageTestOrders }: { restaurantId: string; canManageTestOrders: boolean }) {
  const [orders, serviceRequests] = await Promise.all([
    listOrdersForRestaurant(restaurantId),
    listOpenServiceRequests(restaurantId)
  ]);
  const initialOrders = JSON.parse(JSON.stringify(orders));
  const initialRequests = JSON.parse(JSON.stringify(serviceRequests));

  return (
    <RealOrdersWorkspaceV2
      initialOrders={initialOrders}
      initialRequests={initialRequests}
      restaurantId={restaurantId}
      canManageTestOrders={canManageTestOrders}
    />
  );
}

function OrdersBoardSkeleton() {
  return (
    <div className="dashboard-panel animate-pulse p-4">
      <div className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-24 rounded-2xl bg-[#A9C5A1]/14" />
        ))}
      </div>
      <div className="mt-5 h-[420px] rounded-xl border border-[var(--border)] bg-[var(--soft-surface)]" />
    </div>
  );
}
