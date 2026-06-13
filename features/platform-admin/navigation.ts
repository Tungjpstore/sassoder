import type { ElementType } from "react";
import {
  AlertTriangle,
  Bot,
  ChartNoAxesCombined,
  CreditCard,
  Flag,
  GitBranch,
  HardDrive,
  ListTree,
  RadioTower,
  Rows3,
  ServerCog,
  Settings2,
  Siren,
  Store,
  TerminalSquare,
  Workflow,
  Zap
} from "lucide-react";
import type { ActiveSection } from "@/features/platform-admin/types";

export type PlatformAdminSection = {
  key: ActiveSection;
  label: string;
  href: string;
  icon: ElementType;
};

export const platformAdminSections: PlatformAdminSection[] = [
  { key: "overview", label: "Tổng quan", href: "/", icon: ChartNoAxesCombined },
  { key: "system-map", label: "Bản đồ hệ thống", href: "/system-map", icon: Workflow },
  { key: "deployments", label: "Triển khai", href: "/deployments", icon: GitBranch },
  { key: "services", label: "Dịch vụ", href: "/services", icon: ServerCog },
  { key: "backup", label: "Backup", href: "/backup", icon: HardDrive },
  { key: "queues", label: "Hàng đợi", href: "/queues", icon: ListTree },
  { key: "redis", label: "Redis", href: "/redis", icon: Rows3 },
  { key: "telegram", label: "Telegram", href: "/telegram", icon: RadioTower },
  { key: "ai", label: "Vận hành AI", href: "/ai", icon: Bot },
  { key: "payments", label: "Thanh toán", href: "/payments", icon: CreditCard },
  { key: "tenants", label: "Tenant", href: "/tenants", icon: Store },
  { key: "logs", label: "Nhật ký", href: "/logs", icon: TerminalSquare },
  { key: "alerts", label: "Cảnh báo", href: "/alerts", icon: AlertTriangle },
  { key: "incidents", label: "Sự cố", href: "/incidents", icon: Siren },
  { key: "flags", label: "Cờ tính năng", href: "/flags", icon: Flag },
  { key: "settings", label: "Cài đặt", href: "/settings", icon: Settings2 }
];

const legacySectionAliases: Record<string, ActiveSection> = {
  site: "settings",
  content: "settings",
  plans: "payments",
  billing: "payments",
  users: "settings",
  maps: "services",
  atlas: "system-map",
  ops: "services",
  governance: "settings",
  security: "settings",
  release: "deployments"
};

export const activePlatformAdminSections = new Set<ActiveSection>(
  platformAdminSections.map((section) => section.key)
);

export function getActivePlatformAdminSection(path?: string[]): ActiveSection {
  const section = path?.[0] || "overview";
  if (legacySectionAliases[section]) return legacySectionAliases[section];
  return activePlatformAdminSections.has(section as ActiveSection) ? (section as ActiveSection) : "overview";
}

export const platformAdminQuickActions = [
  { label: "Mở bản đồ hệ thống", href: "/system-map", shortcut: "G M", icon: Workflow },
  { label: "Xem hàng đợi", href: "/queues", shortcut: "G Q", icon: ListTree },
  { label: "Mở Redis", href: "/redis", shortcut: "G R", icon: Rows3 },
  { label: "Xoay khoá AI", href: "/ai", shortcut: "A K", icon: Bot },
  { label: "Xử lý thanh toán chờ", href: "/payments", shortcut: "P", icon: CreditCard },
  { label: "Mở nhật ký realtime", href: "/logs", shortcut: "L", icon: TerminalSquare },
  { label: "Phòng xử lý sự cố", href: "/incidents", shortcut: "I", icon: Siren },
  { label: "Bật cờ tính năng", href: "/flags", shortcut: "F", icon: Zap },
  { label: "Cài đặt bảo mật", href: "/settings", shortcut: "S", icon: Settings2 }
] as const;
