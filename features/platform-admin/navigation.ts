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
  { key: "content", label: "Content", href: "/content", icon: FileText },
  { key: "plans", label: "Gói dịch vụ", href: "/plans", icon: PackageCheck },
  { key: "billing", label: "Thanh toán gói", href: "/billing", icon: CreditCard },
  { key: "tenants", label: "Cửa hàng", href: "/tenants", icon: Store },
  { key: "users", label: "User", href: "/users", icon: UsersRound },
  { key: "ai", label: "AI", href: "/ai", icon: Bot },
  { key: "maps", label: "Maps", href: "/maps", icon: MapPinned },
  { key: "atlas", label: "Atlas", href: "/atlas", icon: Globe2 },
  { key: "ops", label: "Ops", href: "/ops", icon: ServerCog },
  { key: "governance", label: "Governance", href: "/governance", icon: ClipboardCheck },
  { key: "security", label: "Bảo mật", href: "/security", icon: ShieldCheck },
  { key: "release", label: "Release", href: "/release", icon: GitBranch }
];

export const activePlatformAdminSections = new Set<ActiveSection>(
  platformAdminSections.map((section) => section.key)
);

export function getActivePlatformAdminSection(path?: string[]): ActiveSection {
  const section = path?.[0] || "overview";
  return activePlatformAdminSections.has(section as ActiveSection) ? (section as ActiveSection) : "overview";
}
