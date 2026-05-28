import type { ElementType } from "react";
import {
  Bot,
  ClipboardCheck,
  CreditCard,
  FileSliders,
  FileText,
  GitBranch,
  Globe2,
  MapPinned,
  PackageCheck,
  ServerCog,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  UsersRound
} from "lucide-react";
import type { ActiveSection } from "@/features/platform-admin/types";

export type PlatformAdminSection = {
  key: ActiveSection;
  label: string;
  href: string;
  icon: ElementType;
};

export const platformAdminSections: PlatformAdminSection[] = [
  { key: "overview", label: "Tổng quan", href: "/", icon: SlidersHorizontal },
  { key: "site", label: "Website", href: "/site", icon: FileSliders },
  { key: "content", label: "Nội dung", href: "/content", icon: FileText },
  { key: "plans", label: "Gói dịch vụ", href: "/plans", icon: PackageCheck },
  { key: "billing", label: "Thanh toán gói", href: "/billing", icon: CreditCard },
  { key: "tenants", label: "Cửa hàng", href: "/tenants", icon: Store },
  { key: "users", label: "Người dùng", href: "/users", icon: UsersRound },
  { key: "ai", label: "Vận hành AI", href: "/ai", icon: Bot },
  { key: "maps", label: "Bản đồ", href: "/maps", icon: MapPinned },
  { key: "atlas", label: "Bản đồ hệ thống", href: "/atlas", icon: Globe2 },
  { key: "ops", label: "Hạ tầng", href: "/ops", icon: ServerCog },
  { key: "governance", label: "Quản trị thay đổi", href: "/governance", icon: ClipboardCheck },
  { key: "security", label: "Bảo mật", href: "/security", icon: ShieldCheck },
  { key: "release", label: "Phát hành", href: "/release", icon: GitBranch }
];

export const activePlatformAdminSections = new Set<ActiveSection>(
  platformAdminSections.map((section) => section.key)
);

export function getActivePlatformAdminSection(path?: string[]): ActiveSection {
  const section = path?.[0] || "overview";
  return activePlatformAdminSections.has(section as ActiveSection) ? (section as ActiveSection) : "overview";
}
