import { notFound } from "next/navigation";
import { DashboardShellV2 } from "@/components/dashboard-v2/shell";
import type { ActionStreamItem } from "@/components/dashboard-v2/action-rail";
import { OverviewDemo } from "@/components/dashboard-v2/demo/overview-demo";
import { OrdersDemo } from "@/components/dashboard-v2/demo/orders-demo";
import { KitchenDemo } from "@/components/dashboard-v2/demo/kitchen-demo";
import { TablesDemo } from "@/components/dashboard-v2/demo/tables-demo";
import { PaymentsDemo } from "@/components/dashboard-v2/demo/payments-demo";
import { OnlineDemo } from "@/components/dashboard-v2/demo/online-demo";
import { ReservationsDemo } from "@/components/dashboard-v2/demo/reservations-demo";
import { MenuDemo } from "@/components/dashboard-v2/demo/menu-demo";
import { InventoryDemo } from "@/components/dashboard-v2/demo/inventory-demo";
import { StaffDemo } from "@/components/dashboard-v2/demo/staff-demo";
import { PromotionsDemo } from "@/components/dashboard-v2/demo/promotions-demo";
import { AnalyticsDemo } from "@/components/dashboard-v2/demo/analytics-demo";
import { SettingsDemo } from "@/components/dashboard-v2/demo/settings-demo";
import { AiDemo } from "@/components/dashboard-v2/demo/ai-demo";
import "@/app/styles/dashboard-tokens-v2.css";

export const dynamic = "force-dynamic";

const PREVIEW_BASE = "/preview/dashboard-v2";

const SHARED_STREAM: ActionStreamItem[] = [
  { id: "1", kind: "table", title: "Bàn 07 quá giờ phục vụ", detail: "12 phút chưa ra món", href: `${PREVIEW_BASE}/tables`, urgent: true },
  { id: "2", kind: "order", title: "3 đơn mới chờ nhận", detail: "Bàn 02, 09, Mang đi #91", href: `${PREVIEW_BASE}/orders`, urgent: true },
  { id: "3", kind: "payment", title: "Bàn 12 yêu cầu thanh toán", detail: "VietQR", href: `${PREVIEW_BASE}/payments`, amount: "340.000₫", urgent: true },
  { id: "4", kind: "kitchen", title: "Bàn 04 báo thiếu topping", detail: "Trân châu trắng", href: `${PREVIEW_BASE}/kitchen` },
  { id: "5", kind: "inventory", title: "Sữa tươi sắp hết", detail: "Còn 2/20 lít", href: `${PREVIEW_BASE}/inventory` },
  { id: "6", kind: "ai", title: "Gợi ý đẩy combo Bạc xỉu", detail: "Đang bán tốt giờ này", href: `${PREVIEW_BASE}/ai` }
];

const WORKSPACES: Record<string, { title: string; component: React.ComponentType }> = {
  orders: { title: "Đơn hàng realtime", component: OrdersDemo },
  kitchen: { title: "Bếp", component: KitchenDemo },
  tables: { title: "Bàn & QR", component: TablesDemo },
  payments: { title: "Thanh toán", component: PaymentsDemo },
  online: { title: "Đặt online", component: OnlineDemo },
  reservations: { title: "Đặt bàn", component: ReservationsDemo },
  menu: { title: "Menu món", component: MenuDemo },
  inventory: { title: "Kho hàng", component: InventoryDemo },
  staff: { title: "Nhân viên", component: StaffDemo },
  promotions: { title: "Khuyến mãi", component: PromotionsDemo },
  analytics: { title: "Báo cáo", component: AnalyticsDemo },
  settings: { title: "Cài đặt", component: SettingsDemo },
  ai: { title: "Trợ lý AI", component: AiDemo },
  "logibot-ai": { title: "Trợ lý AI", component: AiDemo },
  overview: { title: "Tổng quan", component: OverviewDemo }
};

export const metadata = { title: "Preview · Dashboard v2 workspace", robots: { index: false, follow: false } };

export default async function WorkspacePreviewPage({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  const entry = WORKSPACES[workspace];
  if (!entry) notFound();
  const Body = entry.component;

  return (
    <DashboardShellV2 title={entry.title} restaurantName="Quán Cafe Demo" actionStream={SHARED_STREAM} basePath={PREVIEW_BASE}>
      <Body />
    </DashboardShellV2>
  );
}
