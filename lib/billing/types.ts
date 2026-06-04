export const billingPlanCodes = ["pro", "premium"] as const;
export type BillingPlanCode = (typeof billingPlanCodes)[number];

export const billingBadgeKinds = ["PREMIUM", "PRO", "AI", "NEW", "BETA"] as const;
export type BillingBadgeKind = (typeof billingBadgeKinds)[number];

export const billingFeatureKeys = [
  "tables",
  "staff",
  "qr_ordering",
  "payment_qr",
  "menu_management",
  "online_ordering",
  "order_realtime",
  "inventory_basic",
  "inventory_premium",
  "inventory_ai_ocr",
  "inventory_ai_intelligence",
  "basic_analytics",
  "ai_menu_generation",
  "ai_chatbot",
  "ai_image_generation",
  "branding_basic",
  "export_pdf",
  "advanced_automation",
  "ai_analytics",
  "ai_marketing",
  "ai_branding",
  "ai_automation",
  "advanced_reports",
  "loyalty_system",
  "advanced_qr_branding",
  "custom_domain",
  "realtime_insight",
  "advanced_ai_assistant",
  "advanced_permissions",
  "automation_workflow"
] as const;

export type BillingFeatureKey = (typeof billingFeatureKeys)[number];
export type FeatureAccessState = "active" | "locked_plan" | "quota_exceeded" | "trial_used";
export type QuotaWindow = "daily" | "monthly" | "lifetime";
export type QuotaDimension = "tables" | "staff" | "ai_requests" | "ai_tokens" | "ai_images" | "exports" | "analytics_runs" | "automation_runs";

export type QuotaSnapshot = {
  key: string;
  label: string;
  used: number;
  limit: number | null;
  unit: string;
  window: QuotaWindow;
  resetLabel?: string;
};

export type FeatureDescriptor = {
  key: BillingFeatureKey;
  label: string;
  description: string;
  group: "core" | "ai" | "analytics" | "growth" | "automation" | "brand" | "inventory";
  badge?: BillingBadgeKind;
  upgradeHeadline: string;
  upgradeBullets: string[];
};

export type PlanEntitlementSpec = {
  included: boolean;
  label?: string;
  limit?: number | null;
  unit?: string;
  accessMode?: "active" | "locked_plan" | "trial";
  quota?: {
    key: string;
    label: string;
    limit: number | null;
    used?: number;
    unit: string;
    window: QuotaWindow;
    resetLabel?: string;
  };
  preview?: string;
};

export type BillingPlanDefinition = {
  code: BillingPlanCode;
  name: string;
  price: number;
  accent: string;
  summary: string;
  heroLabel: string;
  highlights: string[];
  entitlements: Record<BillingFeatureKey, PlanEntitlementSpec>;
};

export type ResolvedFeatureAccess = {
  key: BillingFeatureKey;
  label: string;
  description: string;
  state: FeatureAccessState;
  planCode: BillingPlanCode;
  badge?: BillingBadgeKind;
  includedInPlan: boolean;
  limit: number | null;
  unit?: string;
  usage?: QuotaSnapshot;
  preview?: string;
  upgradeHeadline: string;
  upgradeBullets: string[];
};

export type ResolvedEntitlementSnapshot = {
  planCode: BillingPlanCode;
  planName: string;
  status: "active" | "grace" | "expired" | "pending_payment";
  daysLeft: number;
  features: Record<BillingFeatureKey, ResolvedFeatureAccess>;
  quotas: Record<string, QuotaSnapshot>;
};
