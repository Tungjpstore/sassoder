export const STAFF_PERMISSION_KEYS = [
  "dashboard.view",
  "orders.manage",
  "kitchen.view",
  "menu.manage",
  "tables.manage",
  "payments.manage",
  "online.manage",
  "reservations.manage",
  "promotions.manage",
  "reports.view",
  "staff.manage",
  "settings.manage"
] as const;

export type StaffPermissionKey = (typeof STAFF_PERMISSION_KEYS)[number];
export type StaffPermissionProfile = "manager" | "cashier" | "kitchen" | "service" | "delivery" | "viewer";
export type StaffRole = "ADMIN" | "STAFF";

export type StaffPermissionPreset = {
  key: StaffPermissionProfile;
  title: string;
  role: StaffRole;
  description: string;
  permissions: StaffPermissionKey[];
};

export const STAFF_PERMISSION_PRESETS: StaffPermissionPreset[] = [
  {
    key: "manager",
    title: "Quản lý",
    role: "ADMIN",
    description: "Toàn quyền vận hành, nhân viên và cài đặt quán.",
    permissions: [...STAFF_PERMISSION_KEYS]
  },
  {
    key: "cashier",
    title: "Thu ngân",
    role: "STAFF",
    description: "Theo dõi đơn, xác nhận thanh toán và đối soát trong ca.",
    permissions: ["dashboard.view", "orders.manage", "tables.manage", "payments.manage", "reports.view"]
  },
  {
    key: "kitchen",
    title: "Bếp",
    role: "STAFF",
    description: "Xem đơn bếp và cập nhật tiến độ ra món.",
    permissions: ["dashboard.view", "orders.manage", "kitchen.view"]
  },
  {
    key: "service",
    title: "Phục vụ",
    role: "STAFF",
    description: "Xử lý bàn, gọi hỗ trợ và theo dõi đơn tại bàn.",
    permissions: ["dashboard.view", "orders.manage", "tables.manage", "reservations.manage"]
  },
  {
    key: "delivery",
    title: "Giao hàng",
    role: "STAFF",
    description: "Theo dõi đơn online, trạng thái giao và liên hệ khách.",
    permissions: ["dashboard.view", "orders.manage", "online.manage"]
  },
  {
    key: "viewer",
    title: "Theo dõi",
    role: "STAFF",
    description: "Chỉ quan sát dashboard và báo cáo ca.",
    permissions: ["dashboard.view", "reports.view"]
  }
];

export const staffPermissionProfiles = STAFF_PERMISSION_PRESETS.map((preset) => preset.key) as [
  StaffPermissionProfile,
  ...StaffPermissionProfile[]
];

export function getStaffPermissionPreset(profile: StaffPermissionProfile | string | null | undefined) {
  return STAFF_PERMISSION_PRESETS.find((preset) => preset.key === profile) ?? STAFF_PERMISSION_PRESETS[3];
}

export function staffPermissionLabel(permission: StaffPermissionKey | string) {
  const labels: Record<StaffPermissionKey, string> = {
    "dashboard.view": "Tổng quan",
    "orders.manage": "Đơn hàng",
    "kitchen.view": "Bếp",
    "menu.manage": "Menu",
    "tables.manage": "Bàn & QR",
    "payments.manage": "Thanh toán",
    "online.manage": "Đặt online",
    "reservations.manage": "Đặt bàn",
    "promotions.manage": "Khuyến mãi",
    "reports.view": "Báo cáo",
    "staff.manage": "Nhân viên",
    "settings.manage": "Cài đặt"
  };

  return permission in labels ? labels[permission as StaffPermissionKey] : String(permission);
}

export function normalizeStaffPermissions(value: unknown, fallbackProfile: StaffPermissionProfile | string | null | undefined) {
  const fallback = getStaffPermissionPreset(fallbackProfile).permissions;
  if (!Array.isArray(value)) return fallback;

  const allowed = new Set<string>(STAFF_PERMISSION_KEYS);
  const permissions = value.filter((item): item is StaffPermissionKey => typeof item === "string" && allowed.has(item));
  return permissions.length ? permissions : fallback;
}
