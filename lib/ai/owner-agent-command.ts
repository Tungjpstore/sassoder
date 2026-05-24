import type { PlanFeatureKey } from "@/services/subscription-service";

export type OwnerAgentDomain =
  | "setup"
  | "overview"
  | "orders"
  | "kitchen"
  | "menu"
  | "inventory"
  | "tables"
  | "payments"
  | "promotions"
  | "staff"
  | "online"
  | "reservations"
  | "reports"
  | "settings"
  | "security"
  | "growth"
  | "support"
  | "branch";

export type OwnerAgentCommand =
  | "run_operational_sweep"
  | "create_setup_checklist"
  | "create_order_workflow"
  | "create_kitchen_workflow"
  | "create_menu_draft"
  | "create_purchase_order_draft"
  | "create_floor_checklist"
  | "create_payment_reconciliation"
  | "create_promotion_draft"
  | "create_staffing_workflow"
  | "create_online_delivery_draft"
  | "create_reservation_policy_draft"
  | "create_report_brief"
  | "create_settings_checklist"
  | "create_security_checklist"
  | "create_growth_campaign"
  | "create_support_playbook"
  | "create_branch_watchlist";

export type OwnerAgentSafety = "safe" | "confirm" | "manual_only";

export type OwnerAgentToolContract = {
  domain: OwnerAgentDomain;
  command: OwnerAgentCommand;
  label: string;
  route: string;
  reads: string[];
  writes: string[];
  requiredFeature?: PlanFeatureKey;
  safety: OwnerAgentSafety;
  confirmationRequired: boolean;
  output: "db_draft" | "workflow" | "checklist" | "report";
};

export const ownerAgentToolRegistry: Record<OwnerAgentCommand, OwnerAgentToolContract> = {
  run_operational_sweep: {
    domain: "overview",
    command: "run_operational_sweep",
    label: "Quét ca bán và xếp hàng việc ưu tiên",
    route: "/dashboard/ai-ops",
    reads: ["summary24h", "recentOrders", "tables", "payments", "inventory", "operationInsights"],
    writes: ["none"],
    requiredFeature: "ai_owner_assistant",
    safety: "safe",
    confirmationRequired: false,
    output: "workflow"
  },
  create_setup_checklist: {
    domain: "setup",
    command: "create_setup_checklist",
    label: "Tạo checklist setup vận hành",
    route: "/dashboard/settings",
    reads: ["restaurant profile", "menu count", "tables", "payment config", "online settings"],
    writes: ["none"],
    requiredFeature: "ai_owner_assistant",
    safety: "safe",
    confirmationRequired: false,
    output: "checklist"
  },
  create_order_workflow: {
    domain: "orders",
    command: "create_order_workflow",
    label: "Tạo workflow xử lý đơn",
    route: "/dashboard/orders",
    reads: ["recentOrders", "order status", "payment status", "table", "service_due_at"],
    writes: ["none"],
    requiredFeature: "order_realtime",
    safety: "confirm",
    confirmationRequired: true,
    output: "workflow"
  },
  create_kitchen_workflow: {
    domain: "kitchen",
    command: "create_kitchen_workflow",
    label: "Tạo workflow điều phối bếp",
    route: "/dashboard/kitchen",
    reads: ["active orders", "items", "created_at", "service_due_at"],
    writes: ["none"],
    requiredFeature: "kitchen_screen",
    safety: "safe",
    confirmationRequired: false,
    output: "workflow"
  },
  create_menu_draft: {
    domain: "menu",
    command: "create_menu_draft",
    label: "Tạo menu/món nháp bị ẩn",
    route: "/dashboard/menu",
    reads: ["restaurant profile", "menu categories", "menu items", "price range"],
    writes: ["menu_categories", "menu_items(is_available=false)"],
    requiredFeature: "menu_management",
    safety: "confirm",
    confirmationRequired: true,
    output: "db_draft"
  },
  create_purchase_order_draft: {
    domain: "inventory",
    command: "create_purchase_order_draft",
    label: "Tạo PO nháp từ tồn thấp",
    route: "/dashboard/inventory",
    reads: ["inventory snapshot", "lowStockIngredients", "reference_unit_cost"],
    writes: ["purchase_orders(draft)", "purchase_order_lines"],
    requiredFeature: "inventory_management",
    safety: "confirm",
    confirmationRequired: true,
    output: "db_draft"
  },
  create_floor_checklist: {
    domain: "tables",
    command: "create_floor_checklist",
    label: "Tạo checklist bàn & QR",
    route: "/dashboard/tables",
    reads: ["tables", "active orders", "unpaid totals", "qr status"],
    writes: ["none"],
    requiredFeature: "table_qr",
    safety: "safe",
    confirmationRequired: false,
    output: "checklist"
  },
  create_payment_reconciliation: {
    domain: "payments",
    command: "create_payment_reconciliation",
    label: "Tạo checklist đối soát thanh toán",
    route: "/dashboard/payments",
    reads: ["payment logs", "waiting_confirm orders", "totals", "payment method"],
    writes: ["none"],
    requiredFeature: "vietqr_payments",
    safety: "manual_only",
    confirmationRequired: true,
    output: "checklist"
  },
  create_promotion_draft: {
    domain: "promotions",
    command: "create_promotion_draft",
    label: "Tạo promotion draft chưa public",
    route: "/dashboard/promotions",
    reads: ["summary24h", "topItems", "active promotions", "menu price range"],
    writes: ["promotions(is_active=false,show_on_customer_menu=false)"],
    requiredFeature: "promotions",
    safety: "confirm",
    confirmationRequired: true,
    output: "db_draft"
  },
  create_staffing_workflow: {
    domain: "staff",
    command: "create_staffing_workflow",
    label: "Tạo workflow nhân sự",
    route: "/dashboard/staff",
    reads: ["staff snapshot", "attendance", "approvals", "shifts", "reviews"],
    writes: ["ai_automation_runs when schema is ready"],
    requiredFeature: "staff_management",
    safety: "confirm",
    confirmationRequired: true,
    output: "workflow"
  },
  create_online_delivery_draft: {
    domain: "online",
    command: "create_online_delivery_draft",
    label: "Tạo draft cấu hình online/giao hàng",
    route: "/dashboard/online",
    reads: ["online settings", "delivery radius", "fees", "payment mode", "store coordinates"],
    writes: ["none"],
    requiredFeature: "online_ordering",
    safety: "safe",
    confirmationRequired: false,
    output: "checklist"
  },
  create_reservation_policy_draft: {
    domain: "reservations",
    command: "create_reservation_policy_draft",
    label: "Tạo draft chính sách đặt bàn",
    route: "/dashboard/reservations",
    reads: ["reservation settings", "deposit settings", "table capacity", "hold expiry"],
    writes: ["none"],
    requiredFeature: "reservations",
    safety: "safe",
    confirmationRequired: false,
    output: "checklist"
  },
  create_report_brief: {
    domain: "reports",
    command: "create_report_brief",
    label: "Tạo báo cáo hành động",
    route: "/dashboard/analytics",
    reads: ["paid orders", "top items", "revenue", "payment split"],
    writes: ["none"],
    requiredFeature: "advanced_reports",
    safety: "safe",
    confirmationRequired: false,
    output: "report"
  },
  create_settings_checklist: {
    domain: "settings",
    command: "create_settings_checklist",
    label: "Tạo checklist cấu hình",
    route: "/dashboard/settings",
    reads: ["restaurant profile", "payment settings", "receipt", "notifications", "brand"],
    writes: ["none"],
    requiredFeature: "ai_owner_assistant",
    safety: "safe",
    confirmationRequired: false,
    output: "checklist"
  },
  create_security_checklist: {
    domain: "security",
    command: "create_security_checklist",
    label: "Tạo checklist bảo mật vận hành",
    route: "/dashboard/settings",
    reads: ["session role", "tenant scope", "entitlements", "public settings"],
    writes: ["none"],
    requiredFeature: "ai_owner_assistant",
    safety: "manual_only",
    confirmationRequired: true,
    output: "checklist"
  },
  create_growth_campaign: {
    domain: "growth",
    command: "create_growth_campaign",
    label: "Tạo growth campaign draft",
    route: "/dashboard/promotions",
    reads: ["brand profile", "menu", "promotions", "topItems", "summary24h"],
    writes: ["promotions(is_active=false,show_on_customer_menu=false)"],
    requiredFeature: "promotions",
    safety: "confirm",
    confirmationRequired: true,
    output: "db_draft"
  },
  create_support_playbook: {
    domain: "support",
    command: "create_support_playbook",
    label: "Tạo kịch bản hỗ trợ khách",
    route: "/dashboard/ai-support",
    reads: ["FAQ policy", "menu", "opening hours", "reservation/payment guardrails"],
    writes: ["none"],
    requiredFeature: "ai_owner_assistant",
    safety: "safe",
    confirmationRequired: false,
    output: "checklist"
  },
  create_branch_watchlist: {
    domain: "branch",
    command: "create_branch_watchlist",
    label: "Tạo watchlist chi nhánh",
    route: "/dashboard/ai-ops",
    reads: ["branch performance", "branch attribution", "inventory/staff/payment by branch"],
    writes: ["none"],
    requiredFeature: "ai_owner_assistant",
    safety: "safe",
    confirmationRequired: false,
    output: "workflow"
  }
};

export const ownerAgentDefaultCommandByDomain: Record<OwnerAgentDomain, OwnerAgentCommand> = {
  setup: "create_setup_checklist",
  overview: "run_operational_sweep",
  orders: "create_order_workflow",
  kitchen: "create_kitchen_workflow",
  menu: "create_menu_draft",
  inventory: "create_purchase_order_draft",
  tables: "create_floor_checklist",
  payments: "create_payment_reconciliation",
  promotions: "create_promotion_draft",
  staff: "create_staffing_workflow",
  online: "create_online_delivery_draft",
  reservations: "create_reservation_policy_draft",
  reports: "create_report_brief",
  settings: "create_settings_checklist",
  security: "create_security_checklist",
  growth: "create_growth_campaign",
  support: "create_support_playbook",
  branch: "create_branch_watchlist"
};

const domainAliases: Record<string, OwnerAgentDomain> = {
  setup: "setup",
  overview: "overview",
  dashboard: "overview",
  orders: "orders",
  order: "orders",
  kitchen: "kitchen",
  menu: "menu",
  inventory: "inventory",
  stock: "inventory",
  warehouse: "inventory",
  tables: "tables",
  table: "tables",
  payments: "payments",
  payment: "payments",
  promotions: "promotions",
  promotion: "promotions",
  marketing: "growth",
  growth: "growth",
  staff: "staff",
  hr: "staff",
  online: "online",
  delivery: "online",
  reservations: "reservations",
  reservation: "reservations",
  reports: "reports",
  analytics: "reports",
  settings: "settings",
  security: "security",
  support: "support",
  branch: "branch",
  branches: "branch"
};

export function foldOwnerAgentText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isOwnerAgentDomain(value: string): value is OwnerAgentDomain {
  return Object.values(domainAliases).includes(value as OwnerAgentDomain);
}

export function normalizeOwnerAgentDomain(value: string | null | undefined, message = ""): OwnerAgentDomain {
  const foldedValue = foldOwnerAgentText(value ?? "").trim();
  const direct = domainAliases[foldedValue];
  if (direct) return direct;
  if (isOwnerAgentDomain(foldedValue)) return foldedValue;

  const foldedMessage = foldOwnerAgentText(message);
  const rules: Array<[OwnerAgentDomain, string[]]> = [
    ["menu", ["menu", "thuc don", "mon moi", "tao mon", "combo", "topping"]],
    ["inventory", ["kho", "ton kho", "nguyen lieu", "po", "phieu nhap", "nhap hang"]],
    ["promotions", ["khuyen mai", "ma giam", "voucher", "uu dai"]],
    ["growth", ["marketing", "facebook", "zalo", "caption", "campaign", "tang truong"]],
    ["support", ["ho tro", "faq", "tra loi khach", "khach hoi", "cham soc khach"]],
    ["staff", ["nhan vien", "ca lam", "cham cong", "xep ca", "hr"]],
    ["payments", ["thanh toan", "vietqr", "doi soat", "chuyen khoan", "tien mat"]],
    ["orders", ["don", "order", "xu ly don", "nhan don"]],
    ["kitchen", ["bep", "ra mon", "sla mon", "mon tre"]],
    ["tables", ["ban", "qr ban", "so do ban", "floor"]],
    ["online", ["online", "ship", "giao hang", "pickup"]],
    ["reservations", ["dat ban", "giu ban", "booking", "coc"]],
    ["reports", ["bao cao", "doanh thu", "analytics", "thong ke"]],
    ["branch", ["chi nhanh", "branch", "chuoi", "multi branch"]],
    ["security", ["bao mat", "phan quyen", "audit", "rls", "tenant"]],
    ["settings", ["cai dat", "cau hinh", "thiet lap"]],
    ["setup", ["setup", "san sang", "onboarding"]]
  ];

  return rules.find(([, hints]) => hints.some((hint) => foldedMessage.includes(hint)))?.[0] ?? "overview";
}

export function normalizeOwnerAgentCommand(value: string | null | undefined, domain: OwnerAgentDomain, message = ""): OwnerAgentCommand {
  if (value && value in ownerAgentToolRegistry) return value as OwnerAgentCommand;

  const folded = foldOwnerAgentText(message);
  if (domain === "menu" && /(combo|upsell|mon|menu|thuc don|tao)/.test(folded)) return "create_menu_draft";
  if ((domain === "promotions" || domain === "growth") && /(khuyen mai|voucher|ma giam|campaign|caption|facebook|zalo|uu dai)/.test(folded)) {
    return domain === "growth" ? "create_growth_campaign" : "create_promotion_draft";
  }
  if (domain === "inventory" && /(po|phieu nhap|nhap hang|mua hang|ton thap|nguyen lieu)/.test(folded)) return "create_purchase_order_draft";
  if (domain === "payments" && /(doi soat|vietqr|xac nhan|thanh toan)/.test(folded)) return "create_payment_reconciliation";
  if (domain === "support" && /(faq|kich ban|tra loi|ho tro)/.test(folded)) return "create_support_playbook";
  if (domain === "branch" && /(chi nhanh|so sanh|yeu|manh)/.test(folded)) return "create_branch_watchlist";

  return ownerAgentDefaultCommandByDomain[domain];
}

export function getOwnerAgentToolContract(command: OwnerAgentCommand) {
  return ownerAgentToolRegistry[command];
}
