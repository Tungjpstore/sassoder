const ACTION_STAFF_PERMISSION_KEYS = [
  "dashboard.view",
  "orders.view",
  "orders.update",
  "orders.cancel",
  "orders.reopen",
  "payments.view",
  "payments.confirm",
  "payments.refund",
  "tables.manage",
  "tables.reopen",
  "menu.view",
  "menu.edit",
  "customers.view",
  "promotions.manage",
  "staff.view",
  "staff.create",
  "staff.edit",
  "staff.suspend",
  "staff.archive",
  "staff.roles",
  "attendance.view",
  "attendance.clock",
  "attendance.edit",
  "attendance.approve",
  "shifts.view",
  "shifts.manage",
  "shifts.assign",
  "shifts.override",
  "approvals.review",
  "presence.view",
  "activity_logs.view",
  "activity_logs.export",
  "inventory.view",
  "inventory.manage",
  "inventory.purchase_orders",
  "inventory.suppliers",
  "inventory.transfers",
  "inventory.counts",
  "inventory.analytics",
  "reports.view",
  "settings.view",
  "settings.billing.manage",
  "online.manage",
  "reservations.manage",
  "notifications.manage"
] as const;

const LEGACY_STAFF_PERMISSION_KEYS = [
  "orders.manage",
  "kitchen.view",
  "menu.manage",
  "payments.manage",
  "staff.manage",
  "settings.manage"
] as const;

export const STAFF_PERMISSION_KEYS = [...ACTION_STAFF_PERMISSION_KEYS, ...LEGACY_STAFF_PERMISSION_KEYS] as const;

export type StaffPermissionKey = (typeof STAFF_PERMISSION_KEYS)[number];
export type StaffPermissionProfile = "manager" | "cashier" | "kitchen" | "service" | "delivery" | "viewer";
export type StaffRole = "ADMIN" | "STAFF";
export type StaffRoleTemplateCode =
  | "owner"
  | "manager"
  | "cashier"
  | "waiter"
  | "kitchen"
  | "marketing"
  | "accountant"
  | "delivery";

export type StaffPermissionGroup = {
  key: string;
  title: string;
  description: string;
  permissions: StaffPermissionKey[];
};

export type StaffRoleTemplate = {
  code: StaffRoleTemplateCode;
  title: string;
  role: StaffRole;
  profile: StaffPermissionProfile;
  description: string;
  preview: string;
  permissions: StaffPermissionKey[];
};

export type StaffPermissionPreset = {
  key: StaffPermissionProfile;
  title: string;
  role: StaffRole;
  description: string;
  permissions: StaffPermissionKey[];
};

export const DEFAULT_ELIGIBLE_STAFF_PERMISSIONS = ["attendance.clock"] satisfies StaffPermissionKey[];

export const STAFF_PERMISSION_GROUPS: StaffPermissionGroup[] = [
  {
    key: "orders",
    title: "Đơn hàng & bàn",
    description: "Các quyền thao tác trực tiếp với đơn, bàn và luồng phục vụ.",
    permissions: ["orders.view", "orders.update", "orders.cancel", "orders.reopen", "tables.manage", "tables.reopen"]
  },
  {
    key: "payments",
    title: "Thanh toán & báo cáo",
    description: "Quyền liên quan đến xác nhận tiền, hoàn tiền và theo dõi số liệu.",
    permissions: ["payments.view", "payments.confirm", "payments.refund", "reports.view", "activity_logs.export"]
  },
  {
    key: "staff",
    title: "Nhân sự & chấm công",
    description: "Quyền về hồ sơ nhân viên, hiện diện, phân ca và phê duyệt ngoại lệ.",
    permissions: [
      "staff.view",
      "staff.create",
      "staff.edit",
      "staff.suspend",
      "staff.archive",
      "staff.roles",
      "attendance.view",
      "attendance.clock",
      "attendance.edit",
      "attendance.approve",
      "shifts.view",
      "shifts.manage",
      "shifts.assign",
      "shifts.override",
      "approvals.review",
      "presence.view"
    ]
  },
  {
    key: "catalog",
    title: "Menu & vận hành nền",
    description: "Menu, kho, đặt bàn, khách hàng và kênh bán hàng liên quan tới nhân sự.",
    permissions: [
      "menu.view",
      "menu.edit",
      "inventory.view",
      "inventory.manage",
      "inventory.purchase_orders",
      "inventory.suppliers",
      "inventory.transfers",
      "inventory.counts",
      "inventory.analytics",
      "customers.view",
      "promotions.manage",
      "online.manage",
      "reservations.manage",
      "notifications.manage"
    ]
  },
  {
    key: "governance",
    title: "Kiểm soát & cài đặt",
    description: "Các quyền nhạy cảm cho chủ quán, quản lý và lớp kiểm soát nội bộ.",
    permissions: [
      "dashboard.view",
      "settings.view",
      "settings.billing.manage",
      "activity_logs.view",
      "orders.manage",
      "kitchen.view",
      "menu.manage",
      "payments.manage",
      "staff.manage",
      "settings.manage"
    ]
  }
];

export const STAFF_ROLE_TEMPLATES: StaffRoleTemplate[] = [
  {
    code: "owner",
    title: "Chủ quán",
    role: "ADMIN",
    profile: "manager",
    description: "Toàn quyền vận hành, gói dịch vụ, phân quyền và kiểm soát rủi ro theo chi nhánh.",
    preview: "Tất cả hành động nhạy cảm, phê duyệt, gói dịch vụ và nhật ký điều tra.",
    permissions: [...STAFF_PERMISSION_KEYS]
  },
  {
    code: "manager",
    title: "Quản lý",
    role: "ADMIN",
    profile: "manager",
    description: "Điều phối ca, nhân sự, phê duyệt chấm công và theo dõi vận hành theo thời gian thực.",
    preview: "Điều phối ca, duyệt ngoại lệ, xem log, không chạm gói dịch vụ.",
    permissions: STAFF_PERMISSION_KEYS.filter((permission) => permission !== "settings.billing.manage")
  },
  {
    code: "cashier",
    title: "Thu ngân",
    role: "STAFF",
    profile: "cashier",
    description: "Xác nhận thanh toán, đóng bàn và theo dõi chênh lệch tiền trong ca.",
    preview: "Thu tiền, xác nhận giao dịch và xem lịch sử thanh toán.",
    permissions: [
      "dashboard.view",
      "orders.view",
      "orders.update",
      "payments.view",
      "payments.confirm",
      "tables.manage",
      "attendance.clock",
      "attendance.view",
      "presence.view",
      "reports.view",
      "payments.manage"
    ]
  },
  {
    code: "waiter",
    title: "Phục vụ",
    role: "STAFF",
    profile: "service",
    description: "Xử lý bàn, theo dõi khách, chấm công và phối hợp với bếp trong giờ cao điểm.",
    preview: "Điều phối phục vụ tại bàn, chấm công và theo dõi bàn được giao.",
    permissions: [
      "dashboard.view",
      "orders.view",
      "orders.update",
      "tables.manage",
      "attendance.clock",
      "attendance.view",
      "presence.view",
      "customers.view",
      "reservations.manage"
    ]
  },
  {
    code: "kitchen",
    title: "Bếp",
    role: "STAFF",
    profile: "kitchen",
    description: "Theo dõi queue bếp, cập nhật tiến độ món và quan sát nguyên liệu liên quan đến ca.",
    preview: "Tập trung vào bếp, hàng chờ món và tín hiệu chậm.",
    permissions: [
      "dashboard.view",
      "orders.view",
      "orders.update",
      "inventory.view",
      "presence.view",
      "attendance.clock",
      "kitchen.view"
    ]
  },
  {
    code: "marketing",
    title: "Marketing",
    role: "STAFF",
    profile: "viewer",
    description: "Theo dõi hiệu quả bán, khuyến mãi và kênh online mà không chạm vào quyền nhạy cảm.",
    preview: "Theo dõi lưu lượng, ưu đãi và dữ liệu bán online.",
    permissions: [
      "dashboard.view",
      "customers.view",
      "promotions.manage",
      "online.manage",
      "reports.view",
      "menu.view",
      "attendance.clock",
      "attendance.view"
    ]
  },
  {
    code: "accountant",
    title: "Kế toán",
    role: "STAFF",
    profile: "viewer",
    description: "Đối soát dòng tiền, xem log, xuất dữ liệu và hỗ trợ khóa kỳ tính công.",
    preview: "Xem log thanh toán, báo cáo cuối ca và đối soát.",
    permissions: [
      "dashboard.view",
      "payments.view",
      "reports.view",
      "activity_logs.view",
      "activity_logs.export",
      "attendance.clock",
      "attendance.view"
    ]
  },
  {
    code: "delivery",
    title: "Giao hàng",
    role: "STAFF",
    profile: "delivery",
    description: "Theo dõi đơn online, trạng thái giao và hiện diện thiết bị theo ca.",
    preview: "Tập trung vào đơn từ xa, trạng thái giao và đơn online.",
    permissions: [
      "dashboard.view",
      "orders.view",
      "orders.update",
      "online.manage",
      "presence.view",
      "attendance.clock"
    ]
  }
];

export const staffRoleTemplateCodes = STAFF_ROLE_TEMPLATES.map((role) => role.code) as [
  StaffRoleTemplateCode,
  ...StaffRoleTemplateCode[]
];

export const STAFF_PERMISSION_PRESETS: StaffPermissionPreset[] = [
  {
    key: "manager",
    title: "Quản lý",
    role: "ADMIN",
    description: "Điều phối vận hành, nhân sự, chấm công và hàng chờ phê duyệt.",
    permissions: getStaffRoleTemplate("manager").permissions
  },
  {
    key: "cashier",
    title: "Thu ngân",
    role: "STAFF",
    description: "Thu tiền, xác nhận giao dịch và xử lý đóng bàn.",
    permissions: getStaffRoleTemplate("cashier").permissions
  },
  {
    key: "kitchen",
    title: "Bếp",
    role: "STAFF",
    description: "Theo dõi queue bếp, tiến độ món và nguyên liệu liên quan.",
    permissions: getStaffRoleTemplate("kitchen").permissions
  },
  {
    key: "service",
    title: "Phục vụ",
    role: "STAFF",
    description: "Điều phối bàn, đơn tại chỗ và chấm công trong ca.",
    permissions: getStaffRoleTemplate("waiter").permissions
  },
  {
    key: "delivery",
    title: "Giao hàng",
    role: "STAFF",
    description: "Xử lý đơn online, cập nhật trạng thái giao và hiện diện thiết bị.",
    permissions: getStaffRoleTemplate("delivery").permissions
  },
  {
    key: "viewer",
    title: "Theo dõi",
    role: "STAFF",
    description: "Xem báo cáo, nhật ký và hỗ trợ đối soát mà không can thiệp vận hành.",
    permissions: getStaffRoleTemplate("accountant").permissions
  }
];

export const staffPermissionProfiles = STAFF_PERMISSION_PRESETS.map((preset) => preset.key) as [
  StaffPermissionProfile,
  ...StaffPermissionProfile[]
];

const dangerPermissions = new Set<StaffPermissionKey>([
  "orders.cancel",
  "orders.reopen",
  "payments.confirm",
  "payments.refund",
  "menu.edit",
  "staff.create",
  "staff.edit",
  "staff.suspend",
  "staff.archive",
  "staff.roles",
  "attendance.edit",
  "attendance.approve",
  "shifts.manage",
  "shifts.assign",
  "shifts.override",
  "approvals.review",
  "activity_logs.export",
  "inventory.manage",
  "inventory.purchase_orders",
  "inventory.suppliers",
  "inventory.transfers",
  "inventory.counts",
  "settings.billing.manage",
  "notifications.manage",
  "orders.manage",
  "menu.manage",
  "payments.manage",
  "staff.manage",
  "settings.manage"
]);

export function getStaffRoleTemplate(code: StaffRoleTemplateCode | string | null | undefined) {
  return STAFF_ROLE_TEMPLATES.find((role) => role.code === code) ?? STAFF_ROLE_TEMPLATES[3];
}

export function getStaffPermissionPreset(profile: StaffPermissionProfile | string | null | undefined) {
  return STAFF_PERMISSION_PRESETS.find((preset) => preset.key === profile) ?? STAFF_PERMISSION_PRESETS[3];
}

export function mapPermissionProfileToRoleTemplateCode(profile: StaffPermissionProfile | string | null | undefined): StaffRoleTemplateCode {
  if (profile === "manager") return "manager";
  if (profile === "cashier") return "cashier";
  if (profile === "kitchen") return "kitchen";
  if (profile === "delivery") return "delivery";
  if (profile === "viewer") return "accountant";
  return "waiter";
}

export function mapRoleTemplateToPermissionProfile(code: StaffRoleTemplateCode | string | null | undefined): StaffPermissionProfile {
  const role = getStaffRoleTemplate(code);
  return role.profile;
}

export function isDangerPermission(permission: StaffPermissionKey | string) {
  return dangerPermissions.has(permission as StaffPermissionKey);
}

export function staffPermissionLabel(permission: StaffPermissionKey | string) {
  const labels: Record<StaffPermissionKey, string> = {
    "dashboard.view": "Xem dashboard",
    "orders.view": "Xem đơn",
    "orders.update": "Cập nhật đơn",
    "orders.cancel": "Huỷ đơn",
    "orders.reopen": "Mở lại đơn",
    "payments.view": "Xem thanh toán",
    "payments.confirm": "Xác nhận thanh toán",
    "payments.refund": "Hoàn tiền",
    "tables.manage": "Quản lý bàn",
    "tables.reopen": "Mở lại bàn",
    "menu.view": "Xem menu",
    "menu.edit": "Sửa menu",
    "customers.view": "Xem khách hàng",
    "promotions.manage": "Quản lý khuyến mãi",
    "staff.view": "Xem nhân sự",
    "staff.create": "Tạo nhân sự",
    "staff.edit": "Sửa nhân sự",
    "staff.suspend": "Tạm khoá nhân sự",
    "staff.archive": "Lưu trữ nhân sự",
    "staff.roles": "Quản lý vai trò",
    "attendance.view": "Xem chấm công",
    "attendance.clock": "Chấm công",
    "attendance.edit": "Sửa chấm công",
    "attendance.approve": "Duyệt chấm công",
    "shifts.view": "Xem ca làm",
    "shifts.manage": "Quản lý ca làm",
    "shifts.assign": "Phân ca",
    "shifts.override": "Ghi đè ca",
    "approvals.review": "Xử lý phê duyệt",
    "presence.view": "Xem hiện diện",
    "activity_logs.view": "Xem nhật ký hoạt động",
    "activity_logs.export": "Xuất nhật ký hoạt động",
    "inventory.view": "Xem kho",
    "inventory.manage": "Quản lý kho",
    "inventory.purchase_orders": "Quản lý đơn mua hàng",
    "inventory.suppliers": "Quản lý nhà cung cấp",
    "inventory.transfers": "Điều chuyển kho",
    "inventory.counts": "Kiểm kê kho",
    "inventory.analytics": "Phân tích kho",
    "reports.view": "Xem báo cáo",
    "settings.view": "Xem cài đặt",
    "settings.billing.manage": "Quản lý gói dịch vụ",
    "online.manage": "Quản lý kênh online",
    "reservations.manage": "Quản lý đặt bàn",
    "notifications.manage": "Quản lý thông báo",
    "orders.manage": "Điều phối đơn",
    "kitchen.view": "Màn hình bếp",
    "menu.manage": "Quản lý menu",
    "payments.manage": "Điều phối thanh toán",
    "staff.manage": "Quản lý nhân sự",
    "settings.manage": "Quản lý cài đặt"
  };

  return permission in labels ? labels[permission as StaffPermissionKey] : String(permission);
}

function fallbackPermissions(fallback: StaffPermissionProfile | StaffRoleTemplateCode | string | null | undefined) {
  if (!fallback) return getStaffPermissionPreset("service").permissions;

  const roleTemplate = STAFF_ROLE_TEMPLATES.find((role) => role.code === fallback);
  if (roleTemplate) return roleTemplate.permissions;

  return getStaffPermissionPreset(fallback).permissions;
}

function withDefaultEligibleStaffPermissions(permissions: StaffPermissionKey[]) {
  return Array.from(new Set([...permissions, ...DEFAULT_ELIGIBLE_STAFF_PERMISSIONS]));
}

const legacyPermissionAliases: Partial<Record<StaffPermissionKey, StaffPermissionKey[]>> = {
  "orders.manage": ["orders.view", "orders.update", "orders.cancel", "orders.reopen", "tables.manage"],
  "menu.manage": ["menu.view", "menu.edit"],
  "payments.manage": ["payments.view", "payments.confirm", "payments.refund", "reports.view"],
  "staff.manage": [
    "staff.view",
    "staff.create",
    "staff.edit",
    "staff.suspend",
    "staff.archive",
    "staff.roles",
    "attendance.view",
    "attendance.edit",
    "attendance.approve",
    "shifts.view",
    "shifts.manage",
    "shifts.assign",
    "shifts.override",
    "approvals.review",
    "presence.view",
    "activity_logs.view"
  ],
  "settings.manage": ["settings.view", "notifications.manage"]
};

export function expandStaffPermissionAliases(permissions: StaffPermissionKey[]) {
  const expanded = new Set<StaffPermissionKey>();
  permissions.forEach((permission) => {
    expanded.add(permission);
    legacyPermissionAliases[permission]?.forEach((alias) => expanded.add(alias));
  });
  return [...expanded];
}

export function normalizeStaffPermissions(
  value: unknown,
  fallback: StaffPermissionProfile | StaffRoleTemplateCode | string | null | undefined
) {
  const defaultPermissions = fallbackPermissions(fallback);
  if (!Array.isArray(value)) return withDefaultEligibleStaffPermissions(expandStaffPermissionAliases(defaultPermissions));

  const allowed = new Set<string>(STAFF_PERMISSION_KEYS);
  const permissions = value.filter((item): item is StaffPermissionKey => typeof item === "string" && allowed.has(item));
  return withDefaultEligibleStaffPermissions(expandStaffPermissionAliases(permissions.length ? permissions : defaultPermissions));
}
