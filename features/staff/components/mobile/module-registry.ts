import {
  Bell,
  Bike,
  Calculator,
  CalendarDays,
  ChefHat,
  ClipboardCheck,
  Home,
  ListChecks,
  Megaphone,
  UserRound,
  Utensils,
  Wallet,
  type LucideIcon
} from "lucide-react";
import type { StaffPermissionKey } from "@/lib/staff-permissions";

/**
 * Module Registry cho PWA nhân viên (Requirement 10).
 *
 * Bottom-nav của app KHÔNG cố định — nó được phân giải từ Effective_Permissions
 * (getStaffEffectivePermissions). Mỗi vai trò chỉ thấy đúng các khối chức năng
 * mà quyền của họ mở khoá; các Baseline_Module (Hôm nay/Hồ sơ/Yêu cầu) luôn hiển thị.
 */

export type StaffModuleId =
  | "home"
  | "kitchen"
  | "cashier"
  | "service"
  | "delivery"
  | "accounting"
  | "marketing"
  | "ops"
  | "schedule"
  | "requests"
  | "inbox"
  | "profile";

export type StaffModuleKind = "baseline" | "operational" | "comms";

export type StaffModule = {
  id: StaffModuleId;
  label: string;
  icon: LucideIcon;
  /** Quyền cần có để mở khoá module vận hành. `null` = Baseline_Module luôn hiển thị. */
  gate: StaffPermissionKey | null;
  /** Càng nhỏ càng ưu tiên chiếm ô bottom-nav. */
  priority: number;
  kind: StaffModuleKind;
};

/** Số tab tối đa hiển thị trên bottom-nav cùng lúc (Req 5.1). */
export const STAFF_NAV_MAX = 5;

/** Module luôn được ghim (không bao giờ rơi vào overflow) — Req 10.4. */
const PINNED_FRONT: StaffModuleId = "home";
const PINNED_BACK: StaffModuleId = "profile";

export const STAFF_MODULES: StaffModule[] = [
  { id: "home", label: "Hôm nay", icon: Home, gate: null, priority: 0, kind: "baseline" },
  { id: "ops", label: "Điều hành", icon: ClipboardCheck, gate: "approvals.review", priority: 9, kind: "operational" },
  { id: "kitchen", label: "Bếp", icon: ChefHat, gate: "kitchen.view", priority: 10, kind: "operational" },
  { id: "cashier", label: "Thu ngân", icon: Wallet, gate: "payments.confirm", priority: 11, kind: "operational" },
  { id: "service", label: "Phục vụ", icon: Utensils, gate: "tables.manage", priority: 12, kind: "operational" },
  { id: "delivery", label: "Giao hàng", icon: Bike, gate: "online.manage", priority: 13, kind: "operational" },
  { id: "accounting", label: "Kế toán", icon: Calculator, gate: "reports.view", priority: 14, kind: "operational" },
  { id: "marketing", label: "Marketing", icon: Megaphone, gate: "promotions.manage", priority: 15, kind: "operational" },
  { id: "schedule", label: "Ca & Chấm công", icon: CalendarDays, gate: null, priority: 80, kind: "baseline" },
  { id: "requests", label: "Yêu cầu", icon: ListChecks, gate: null, priority: 90, kind: "baseline" },
  { id: "inbox", label: "Hộp thư", icon: Bell, gate: null, priority: 91, kind: "comms" },
  { id: "profile", label: "Hồ sơ", icon: UserRound, gate: null, priority: 99, kind: "baseline" }
];

export function getStaffModule(id: StaffModuleId): StaffModule {
  const found = STAFF_MODULES.find((module) => module.id === id);
  if (!found) throw new Error(`Unknown staff module: ${id}`);
  return found;
}

export type ResolvedStaffModules = {
  /** Module hiển thị trên bottom-nav (đã sắp xếp: home → giữa theo ưu tiên → profile). */
  nav: StaffModule[];
  /** Module mở khoá nhưng không đủ ô — truy cập qua lối tắt ở tab "Hôm nay" (Req 10.6). */
  overflow: StaffModule[];
  /** Toàn bộ module mà nhân viên được phép truy cập (nav + overflow). */
  allowed: StaffModule[];
};

/**
 * Phân giải tập module hiển thị từ quyền hiệu lực (Req 10.1, 10.3, 10.4, 10.6, 10.9).
 *
 * - Baseline (gate=null) luôn được phép.
 * - Operational chỉ được phép khi `gate ∈ effectivePermissions`.
 * - `home` ghim đầu, `profile` ghim cuối; ở giữa lấy theo ưu tiên cho tới khi đủ STAFF_NAV_MAX.
 * - Phần dư rơi vào `overflow` (không bị loại bỏ).
 */
export function resolveStaffModules(effectivePermissions: Set<string>): ResolvedStaffModules {
  const allowed = STAFF_MODULES.filter((module) => {
    if (module.gate === null) return true;
    return effectivePermissions.has(module.gate);
  });

  const front = allowed.find((module) => module.id === PINNED_FRONT) ?? getStaffModule(PINNED_FRONT);
  const back = allowed.find((module) => module.id === PINNED_BACK) ?? getStaffModule(PINNED_BACK);

  const middleCandidates = allowed
    .filter((module) => module.id !== PINNED_FRONT && module.id !== PINNED_BACK)
    .sort((a, b) => a.priority - b.priority);

  const middleSlots = Math.max(0, STAFF_NAV_MAX - 2);
  const navMiddle = middleCandidates.slice(0, middleSlots);
  const overflow = middleCandidates.slice(middleSlots);

  return {
    nav: [front, ...navMiddle, back],
    overflow,
    allowed: [front, ...middleCandidates, back]
  };
}
