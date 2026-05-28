import { Suspense } from "react";
import { AdminShell } from "@/components/dashboard/app-shell";
import { AdminLiveActionCenter } from "@/components/dashboard/live-action-center";
import { OrdersBoard } from "@/components/dashboard/orders-board";
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
      subtitle="Một nơi để nhận đơn, theo dõi bếp, xác nhận thanh toán và chốt đơn giao hàng."
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
    <div className="dashboard-order-service-shell grid gap-3 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="dashboard-order-live-panel xl:sticky xl:top-[92px] xl:h-[calc(100vh-112px)]">
        <AdminLiveActionCenter
          initialOrders={initialOrders}
          initialRequests={initialRequests}
          restaurantId={restaurantId}
          variant="panel"
        />
      </div>
      <OrdersBoard initialOrders={initialOrders} restaurantId={restaurantId} canManageTestOrders={canManageTestOrders} />
    </div>
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
