import { Suspense } from "react";
import { ProductionDashboardShell as AdminShell } from "@/components/dashboard-v2/production-shell";
import { RealPaymentsWorkspaceV2 } from "@/components/dashboard-v2/real/payments-workspace-v2";
import { readThroughDashboardWorkspaceCache } from "@/lib/dashboard-workspace-cache";
import { requireDashboardAccess } from "@/lib/dashboard-access";
import { formatVnd } from "@/lib/money";
import { getAdminReport } from "@/services/dashboard-report-service";
import { getRestaurantAdminDashboard } from "@/services/restaurant-service";

export const dynamic = "force-dynamic";

function percent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

export default async function AdminPaymentsPage() {
  const { session, entitlement } = await requireDashboardAccess("vietqr_payments");
  return (
    <AdminShell
      title="Thanh toán"
      restaurantName={session.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Theo dõi giao dịch, xác nhận VietQR và quản lý tiền mặt"
    >
      <Suspense fallback={<PaymentsWorkspaceSkeleton />}>
        <PaymentsWorkspaceContent restaurantId={session.restaurantId} />
      </Suspense>
    </AdminShell>
  );
}

async function PaymentsWorkspaceContent({ restaurantId }: { restaurantId: string }) {
  const { dashboardBundle, report } = await readThroughDashboardWorkspaceCache({
    restaurantId,
    workspace: "payments",
    ttlSeconds: 4,
    load: async () => {
      const [dashboardBundle, report] = await Promise.all([
        getRestaurantAdminDashboard(restaurantId),
        getAdminReport(restaurantId)
      ]);

      return { dashboardBundle, report };
    }
  });
  const { dashboard, operations } = dashboardBundle;

  const totalPaid = operations.qrRevenue + operations.cashRevenue;
  const waitingAmount = operations.openOrderTotal;
  const stats = [
    { label: "Giao dịch hôm nay", value: operations.todayOrders, meta: `${operations.paid} đã thanh toán`, icon: "credit" as const },
    { label: "Tiền mặt", value: formatVnd(operations.cashRevenue), meta: `${percent(operations.cashRevenue, totalPaid)}% doanh thu`, icon: "cash" as const },
    { label: "VietQR", value: formatVnd(operations.qrRevenue), meta: `${percent(operations.qrRevenue, totalPaid)}% doanh thu`, icon: "qr" as const },
    { label: "Chờ xác nhận", value: formatVnd(waitingAmount), meta: `${operations.waitingConfirm + operations.waitingPayment} bill`, icon: "clock" as const }
  ];

  return (
    <RealPaymentsWorkspaceV2
      stats={stats}
      transactions={report.paymentTransactions}
      restaurantId={restaurantId}
      bankCode={dashboard.restaurant.bank_code}
      bankAccount={dashboard.restaurant.bank_account}
      bankAccountName={dashboard.restaurant.bank_account_name}
      restaurantName={dashboard.restaurant.name}
      totalPaid={totalPaid}
      waitingAmount={waitingAmount}
      cashRevenue={operations.cashRevenue}
      qrRevenue={operations.qrRevenue}
    />
  );
}

function PaymentsWorkspaceSkeleton() {
  return (
    <div className="dashboard-panel grid gap-4 p-4">
      <div className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-xl bg-[#A9C5A1]/18" />
        ))}
      </div>
      <div className="h-[420px] animate-pulse rounded-xl border border-[var(--border)] bg-[var(--soft-surface)]" />
    </div>
  );
}
