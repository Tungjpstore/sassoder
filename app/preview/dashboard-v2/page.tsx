import { DashboardShellV2 } from "@/components/dashboard-v2/shell";
import { OverviewDemo } from "@/components/dashboard-v2/demo/overview-demo";
import type { ActionStreamItem } from "@/components/dashboard-v2/action-rail";
import "@/app/styles/dashboard-tokens-v2.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Preview · Dashboard v2",
  robots: { index: false, follow: false }
};

const demoStream: ActionStreamItem[] = [
  { id: "1", kind: "table", title: "Bàn 07 quá giờ phục vụ", detail: "12 phút chưa ra món", href: "#", urgent: true },
  { id: "2", kind: "order", title: "3 đơn mới chờ nhận", detail: "Bàn 02, 09, Mang đi #91", href: "#", urgent: true },
  { id: "3", kind: "payment", title: "Bàn 12 yêu cầu thanh toán", detail: "VietQR", href: "#", amount: "340.000₫", urgent: true },
  { id: "4", kind: "payment", title: "Bill mang đi #88 chờ xác nhận", detail: "Chuyển khoản", href: "#", amount: "65.000₫" },
  { id: "5", kind: "kitchen", title: "Bàn 04 báo thiếu topping", detail: "Trân châu trắng", href: "#" },
  { id: "6", kind: "inventory", title: "Sữa tươi sắp hết", detail: "Còn 2/20 lít", href: "#" },
  { id: "7", kind: "ai", title: "Gợi ý đẩy combo Bạc xỉu", detail: "Đang bán tốt giờ này", href: "#" }
];

export default function DashboardV2PreviewPage() {
  return (
    <DashboardShellV2 title="Tổng quan" restaurantName="Quán Cafe Demo" actionStream={demoStream}>
      <OverviewDemo />
    </DashboardShellV2>
  );
}
