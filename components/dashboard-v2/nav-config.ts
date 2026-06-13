/* ============================================================
 * Nav config v2 — nguồn duy nhất cho điều hướng dashboard.
 * Dùng chung cho sidebar, tablet rail, mobile sheet, command palette.
 * ============================================================ */

import type { PlanFeatureKey } from "@/services/subscription-service";
import type { DashboardIconId } from "@/components/dashboard/dashboard-icon-assets";

export type NavLink = {
  href: string;
  label: string;
  icon: DashboardIconId;
  keywords?: string;
  featureKey?: PlanFeatureKey;
  premiumHint?: string;
};

export type NavGroup = {
  id: string;
  title: string;
  links: NavLink[];
};

export const navGroups: NavGroup[] = [
  {
    id: "today",
    title: "Hôm nay",
    links: [{ href: "/dashboard", label: "Ca bán hôm nay", icon: "todayShift", keywords: "tong quan ca ban hom nay overview" }]
  },
  {
    id: "operations",
    title: "Vận hành",
    links: [
      { href: "/dashboard/orders", label: "Đơn hàng", icon: "orders", keywords: "don hang order realtime" },
      { href: "/dashboard/kitchen", label: "Bếp", icon: "kitchen", keywords: "bep kitchen queue mon" },
      { href: "/dashboard/tables", label: "Bàn & QR", icon: "tablesQr", keywords: "ban qr table so do" },
      { href: "/dashboard/payments", label: "Thanh toán", icon: "payments", keywords: "thanh toan vietqr doi soat" }
    ]
  },
  {
    id: "sales",
    title: "Bán hàng",
    links: [
      { href: "/dashboard/online", label: "Đặt online", icon: "onlineOrders", keywords: "dat online pickup giao hang" },
      { href: "/dashboard/reservations", label: "Đặt bàn", icon: "reservations", keywords: "dat ban truoc coc", featureKey: "reservations", premiumHint: "Premium mở đặt bàn trước và nhận cọc." },
      { href: "/dashboard/promotions", label: "Khuyến mãi", icon: "promotions", keywords: "khuyen mai giam gia voucher" }
    ]
  },
  {
    id: "management",
    title: "Quản lý",
    links: [
      { href: "/dashboard/menu", label: "Menu món", icon: "menuItems", keywords: "menu mon gia danh muc" },
      { href: "/dashboard/inventory", label: "Kho hàng", icon: "inventory", keywords: "kho ton nguyen lieu po ocr", featureKey: "inventory_premium", premiumHint: "Premium mở PO, lô/HSD, OCR và AI tối ưu kho." },
      { href: "/dashboard/staff", label: "Nhân viên", icon: "staff", keywords: "nhan vien ca lam phan quyen" }
    ]
  },
  {
    id: "intelligence",
    title: "Báo cáo & AI",
    links: [
      { href: "/dashboard/analytics", label: "Báo cáo", icon: "analytics", keywords: "bao cao doanh thu insight", featureKey: "advanced_reports", premiumHint: "Premium mở báo cáo nâng cao và insight thông minh." },
      { href: "/dashboard/logibot-ai", label: "Trợ lý AI", icon: "logibotAi", keywords: "logibot ai tro ly van hanh" }
    ]
  },
  {
    id: "system",
    title: "Hệ thống",
    links: [{ href: "/dashboard/settings", label: "Cài đặt", icon: "settings", keywords: "cai dat thiet lap quan" }]
  }
];

export const allNavLinks = navGroups.flatMap((g) => g.links);

/* Mobile bottom bar — 4 lối tắt chính + nút "Thêm". */
export const mobilePrimaryLinks: NavLink[] = [
  { href: "/dashboard", label: "Tổng quan", icon: "todayShift" },
  { href: "/dashboard/orders", label: "Đơn hàng", icon: "orders" },
  { href: "/dashboard/tables", label: "Bàn/Bếp", icon: "tablesQr" },
  { href: "/dashboard/payments", label: "Thu tiền", icon: "payments" }
];

export function isNavActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname.startsWith(href);
}

/* resolveHref — đổi href "/dashboard/*" sang basePath khác (cho preview).
 * base="" giữ nguyên route thật; base="/preview/dashboard-v2" cho demo. */
export function resolveHref(href: string, basePath = "") {
  if (!basePath) return href;
  if (href === "/dashboard") return basePath || "/dashboard";
  return basePath + href.slice("/dashboard".length);
}
