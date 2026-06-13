/* action-stream — gom việc cần xử lý của toàn bộ dashboard vào một mảng
 * `ActionStreamItem` để ActionRail hiển thị xuyên suốt mọi workspace.
 *
 * Đây là xương sống "liên thông": chủ quán đang ở settings cũng thấy
 * đơn mới, kho thiếu, đặt bàn sắp tới, không phải nhảy menu thủ công.
 */

import type { ActionStreamItem } from "@/components/dashboard-v2/action-rail";

export type DashboardActionInputs = {
  operations?: {
    pending: number;
    waitingPayment: number;
    waitingConfirm: number;
    openOrderTotal: number;
    todayOrders: number;
    todayRevenue: number;
  } | null;
  recentOrders?: Array<{
    id: string;
    status: string;
    total: number;
    tableName?: string | null;
    createdAt: string;
  }> | null;
  inventory?: {
    schemaReady: boolean;
    lowStockCount: number;
    lowStockIngredients?: Array<{ name: string; unit: string; onHandQuantity: number; minimumQuantity: number }>;
  } | null;
  reservations?: {
    upcomingCount: number;
    next?: { id: string; customerName: string; partySize: number; startsAt: string } | null;
    waitingDepositCount?: number;
  } | null;
  staff?: {
    pendingApprovals: number;
  } | null;
  tables?: {
    overdueTables: number;
  } | null;
};

const VND = (n: number) => `${n.toLocaleString("vi-VN")}₫`;

function elapsedMin(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
}

export function buildDashboardActionStream(input: DashboardActionInputs): ActionStreamItem[] {
  const items: ActionStreamItem[] = [];

  // 1. Đơn mới (pending) — urgent nếu > 5 phút
  if (input.operations?.pending && input.operations.pending > 0) {
    const oldestPending = input.recentOrders?.find((o) => o.status === "pending");
    const min = oldestPending ? elapsedMin(oldestPending.createdAt) : 0;
    items.push({
      id: "ops-pending",
      kind: "order",
      title: `${input.operations.pending} đơn mới chưa nhận`,
      detail: oldestPending ? `${oldestPending.tableName ?? "Bàn"} · ${min}p` : "Vào trang Đơn để nhận",
      href: "/dashboard/orders",
      urgent: min >= 5
    });
  }

  // 2. Bàn quá giờ
  if (input.tables?.overdueTables && input.tables.overdueTables > 0) {
    items.push({
      id: "tables-overdue",
      kind: "table",
      title: `${input.tables.overdueTables} bàn quá giờ phục vụ`,
      detail: "Kiểm tra và dọn bàn",
      href: "/dashboard/tables",
      urgent: true
    });
  }

  // 3. Thanh toán chờ xác nhận
  const waiting = (input.operations?.waitingPayment ?? 0) + (input.operations?.waitingConfirm ?? 0);
  if (waiting > 0) {
    items.push({
      id: "payments-waiting",
      kind: "payment",
      title: `${waiting} bill chờ thu`,
      detail: VND(input.operations?.openOrderTotal ?? 0),
      href: "/dashboard/payments",
      amount: VND(input.operations?.openOrderTotal ?? 0)
    });
  }

  // 4. Đặt bàn sắp tới (≤ 60 phút)
  if (input.reservations?.next) {
    const min = Math.floor((new Date(input.reservations.next.startsAt).getTime() - Date.now()) / 60_000);
    if (min >= 0 && min <= 60) {
      items.push({
        id: "reservation-next",
        kind: "table",
        title: `${input.reservations.next.customerName} · ${input.reservations.next.partySize} khách`,
        detail: `Tới trong ${min}p`,
        href: "/dashboard/reservations",
        urgent: min <= 15
      });
    }
  }
  if (input.reservations?.waitingDepositCount && input.reservations.waitingDepositCount > 0) {
    items.push({
      id: "reservation-deposit",
      kind: "table",
      title: `${input.reservations.waitingDepositCount} đặt bàn chờ cọc`,
      detail: "Xác nhận để giữ chỗ",
      href: "/dashboard/reservations"
    });
  }

  // 5. Kho thiếu
  if (input.inventory?.schemaReady && input.inventory.lowStockCount > 0) {
    const top = input.inventory.lowStockIngredients?.[0];
    items.push({
      id: "inventory-low",
      kind: "inventory",
      title: `${input.inventory.lowStockCount} nguyên liệu sắp hết`,
      detail: top ? `${top.name}: ${top.onHandQuantity}/${top.minimumQuantity} ${top.unit}` : "Cần đặt thêm",
      href: "/dashboard/inventory",
      urgent: input.inventory.lowStockCount >= 3
    });
  }

  // 6. Approvals chờ duyệt (staff)
  if (input.staff?.pendingApprovals && input.staff.pendingApprovals > 0) {
    items.push({
      id: "staff-approvals",
      kind: "ai",
      title: `${input.staff.pendingApprovals} yêu cầu nhân sự`,
      detail: "Chấm công, ca làm cần duyệt",
      href: "/dashboard/staff"
    });
  }

  // 7. Trống → một item "Tất cả ổn"
  if (items.length === 0) {
    items.push({
      id: "all-clear",
      kind: "ai",
      title: "Mọi thứ đang ổn",
      detail: "Không có việc gấp cần xử lý",
      href: "/dashboard"
    });
  }

  return items;
}
