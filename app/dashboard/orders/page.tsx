import { Suspense } from "react";
import { ProductionDashboardShell as AdminShell } from "@/components/dashboard-v2/production-shell";
import { RealOrdersWorkspaceV2 } from "@/components/dashboard-v2/real/orders-workspace-v2";
import { requireDashboardPermissionAccess } from "@/lib/dashboard-access";
import { captureServerTimeMs } from "@/lib/server-time";
import { listOrdersForRestaurant } from "@/services/order-service";
import { listOpenServiceRequests } from "@/services/service-request-service";
import { getStaffAuthorizedBranchIds } from "@/features/staff/services/staff-branch-authorization-service";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const { session, entitlement } = await requireDashboardPermissionAccess("order_realtime", "orders.view");
  const authorizedBranchIds = await getStaffAuthorizedBranchIds(session);

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
        <OrdersBoardContent
          restaurantId={session.restaurantId}
          canManageTestOrders={session.role === "ADMIN"}
          authorizedBranchIds={authorizedBranchIds}
        />
      </Suspense>
    </AdminShell>
  );
}

async function OrdersBoardContent({
  restaurantId,
  canManageTestOrders,
  authorizedBranchIds
}: {
  restaurantId: string;
  canManageTestOrders: boolean;
  authorizedBranchIds: ReadonlySet<string> | null;
}) {
  const [orders, serviceRequests] = await Promise.all([
    listOrdersForRestaurant(restaurantId, { authorizedBranchIds }),
    listOpenServiceRequests(restaurantId, { authorizedBranchIds })
  ]);
  const initialOrders = JSON.parse(JSON.stringify(orders));
  const initialRequests = JSON.parse(JSON.stringify(serviceRequests));

  return (
    <RealOrdersWorkspaceV2
      initialOrders={initialOrders}
      initialRequests={initialRequests}
      restaurantId={restaurantId}
      canManageTestOrders={canManageTestOrders}
      initialNowMs={captureServerTimeMs()}
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
