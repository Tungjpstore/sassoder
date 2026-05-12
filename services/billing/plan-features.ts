import type { BillingFeatureKey } from "@/lib/billing/types";

export const planFeatureKeys = [
  "core_dashboard",
  "menu_management",
  "table_qr",
  "order_realtime",
  "kitchen_screen",
  "vietqr_payments",
  "cash_payments",
  "promotions",
  "staff_call",
  "online_ordering",
  "delivery_basic",
  "delivery_realtime_tracking",
  "reservations",
  "reservation_deposits",
  "advanced_reports",
  "scheduled_reports",
  "staff_management",
  "bulk_qr_export",
  "priority_support",
  "ai_owner_assistant",
  "ai_customer_assistant",
  "ai_branding_studio",
  "ai_menu_ocr",
  "ai_image_generation",
  "ai_voice_input",
  "ai_voice_notifications"
] as const;

export type PlanFeatureKey = (typeof planFeatureKeys)[number];

export type PlanFeatureState = {
  enabled: boolean;
  limitValue: number | null;
  source: "plan" | "override" | "fallback";
};

export const featureLabels: Record<PlanFeatureKey, string> = {
  core_dashboard: "Dashboard vận hành",
  menu_management: "Quản lý menu",
  table_qr: "Bàn & QR",
  order_realtime: "Đơn hàng realtime",
  kitchen_screen: "Màn hình bếp",
  vietqr_payments: "Thanh toán VietQR",
  cash_payments: "Thanh toán tiền mặt",
  promotions: "Khuyến mãi",
  staff_call: "Gọi nhân viên",
  online_ordering: "Đặt món online",
  delivery_basic: "Giao hàng cơ bản",
  delivery_realtime_tracking: "Theo dõi giao hàng realtime",
  reservations: "Đặt bàn trước",
  reservation_deposits: "Nhận cọc đặt bàn",
  advanced_reports: "Báo cáo nâng cao",
  scheduled_reports: "Gửi báo cáo tự động",
  staff_management: "Quản lý nhân viên",
  bulk_qr_export: "In/tải QR hàng loạt",
  priority_support: "Hỗ trợ ưu tiên",
  ai_owner_assistant: "AI trợ lý chủ quán",
  ai_customer_assistant: "AI hỗ trợ khách gọi món",
  ai_branding_studio: "AI tạo slogan, mô tả và nhận diện quán",
  ai_menu_ocr: "AI quét OCR menu",
  ai_image_generation: "AI tạo ảnh menu/logo",
  ai_voice_input: "Nhập liệu bằng giọng nói",
  ai_voice_notifications: "Thông báo vận hành bằng giọng nói"
};

export const planFeatureLabels = featureLabels;

const fallbackCapabilities: Record<"pro" | "premium", Partial<Record<PlanFeatureKey, Omit<PlanFeatureState, "source">>>> = {
  pro: {
    core_dashboard: { enabled: true, limitValue: null },
    menu_management: { enabled: true, limitValue: 500 },
    table_qr: { enabled: true, limitValue: 300 },
    order_realtime: { enabled: true, limitValue: null },
    kitchen_screen: { enabled: true, limitValue: null },
    vietqr_payments: { enabled: true, limitValue: null },
    cash_payments: { enabled: true, limitValue: null },
    promotions: { enabled: true, limitValue: 20 },
    staff_call: { enabled: true, limitValue: null },
    online_ordering: { enabled: true, limitValue: null },
    delivery_basic: { enabled: true, limitValue: null },
    delivery_realtime_tracking: { enabled: false, limitValue: null },
    reservations: { enabled: false, limitValue: null },
    reservation_deposits: { enabled: false, limitValue: null },
    advanced_reports: { enabled: false, limitValue: null },
    scheduled_reports: { enabled: true, limitValue: 3 },
    staff_management: { enabled: true, limitValue: 8 },
    bulk_qr_export: { enabled: true, limitValue: null },
    priority_support: { enabled: false, limitValue: null },
    ai_owner_assistant: { enabled: true, limitValue: 300 },
    ai_customer_assistant: { enabled: true, limitValue: 1000 },
    ai_branding_studio: { enabled: true, limitValue: 40 },
    ai_menu_ocr: { enabled: false, limitValue: null },
    ai_image_generation: { enabled: false, limitValue: null },
    ai_voice_input: { enabled: true, limitValue: 300 },
    ai_voice_notifications: { enabled: false, limitValue: null }
  },
  premium: {
    core_dashboard: { enabled: true, limitValue: null },
    menu_management: { enabled: true, limitValue: 2000 },
    table_qr: { enabled: true, limitValue: 1000 },
    order_realtime: { enabled: true, limitValue: null },
    kitchen_screen: { enabled: true, limitValue: null },
    vietqr_payments: { enabled: true, limitValue: null },
    cash_payments: { enabled: true, limitValue: null },
    promotions: { enabled: true, limitValue: 200 },
    staff_call: { enabled: true, limitValue: null },
    online_ordering: { enabled: true, limitValue: null },
    delivery_basic: { enabled: true, limitValue: null },
    delivery_realtime_tracking: { enabled: true, limitValue: null },
    reservations: { enabled: true, limitValue: null },
    reservation_deposits: { enabled: true, limitValue: null },
    advanced_reports: { enabled: true, limitValue: null },
    scheduled_reports: { enabled: true, limitValue: 20 },
    staff_management: { enabled: true, limitValue: 50 },
    bulk_qr_export: { enabled: true, limitValue: null },
    priority_support: { enabled: true, limitValue: null },
    ai_owner_assistant: { enabled: true, limitValue: 3000 },
    ai_customer_assistant: { enabled: true, limitValue: 10000 },
    ai_branding_studio: { enabled: true, limitValue: 300 },
    ai_menu_ocr: { enabled: true, limitValue: 500 },
    ai_image_generation: { enabled: true, limitValue: 300 },
    ai_voice_input: { enabled: true, limitValue: 3000 },
    ai_voice_notifications: { enabled: true, limitValue: null }
  }
};

export const legacyBillingFeatureMap: Partial<Record<PlanFeatureKey, BillingFeatureKey>> = {
  ai_owner_assistant: "advanced_ai_assistant",
  ai_customer_assistant: "ai_chatbot",
  ai_branding_studio: "ai_branding",
  ai_menu_ocr: "ai_menu_generation",
  ai_image_generation: "ai_image_generation",
  scheduled_reports: "export_pdf",
  advanced_reports: "ai_analytics"
};

export function getFallbackCapabilityMap(planCode?: string | null) {
  const tier = planCode === "premium" ? "premium" : "pro";
  return planFeatureKeys.reduce(
    (map, featureKey) => {
      const fallback = fallbackCapabilities[tier][featureKey] ?? { enabled: false, limitValue: null };
      map[featureKey] = { ...fallback, source: "fallback" };
      return map;
    },
    {} as Record<PlanFeatureKey, PlanFeatureState>
  );
}

export function normalizeFeatureKey(value: string): PlanFeatureKey | null {
  return planFeatureKeys.includes(value as PlanFeatureKey) ? (value as PlanFeatureKey) : null;
}
