import { AdminShell } from "@/components/dashboard/app-shell";
import { PaymentsWorkspace } from "@/components/dashboard/payments-workspace";
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
  const [{ dashboard, operations }, report] = await Promise.all([
    getRestaurantAdminDashboard(session.restaurantId),
    getAdminReport(session.restaurantId)
  ]);

  const totalPaid = operations.qrRevenue + operations.cashRevenue;
  const waitingAmount = operations.openOrderTotal;
  const stats = [
    { label: "Giao dịch hôm nay", value: operations.todayOrders, meta: `${operations.paid} đã thanh toán`, icon: "credit" as const },
    { label: "Tiền mặt", value: formatVnd(operations.cashRevenue), meta: `${percent(operations.cashRevenue, totalPaid)}% doanh thu`, icon: "cash" as const },
    { label: "VietQR", value: formatVnd(operations.qrRevenue), meta: `${percent(operations.qrRevenue, totalPaid)}% doanh thu`, icon: "qr" as const },
    { label: "Chờ xác nhận", value: formatVnd(waitingAmount), meta: `${operations.waitingConfirm + operations.waitingPayment} bill`, icon: "clock" as const }
  ];

  return (
    <AdminShell
      title="Thanh toán"
      restaurantName={dashboard.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Theo dõi giao dịch, xác nhận VietQR và quản lý tiền mặt"
    >
      <PaymentsWorkspace
        stats={stats}
        transactions={report.paymentTransactions}
        bankCode={dashboard.restaurant.bank_code}
        bankAccount={dashboard.restaurant.bank_account}
        bankAccountName={dashboard.restaurant.bank_account_name}
        restaurantName={dashboard.restaurant.name}
        totalPaid={totalPaid}
        waitingAmount={waitingAmount}
        cashRevenue={operations.cashRevenue}
        qrRevenue={operations.qrRevenue}
      />
    </AdminShell>
  );
}
