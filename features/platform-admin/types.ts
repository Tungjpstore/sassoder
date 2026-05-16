import type { getPlatformAdminSnapshot } from "@/services/platform-admin-service";

export type ActiveSection =
  | "overview"
  | "site"
  | "content"
  | "plans"
  | "billing"
  | "tenants"
  | "users"
  | "ai"
  | "maps"
  | "atlas"
  | "ops"
  | "governance"
  | "security"
  | "release";

export type Snapshot = Awaited<ReturnType<typeof getPlatformAdminSnapshot>>;
export type Tenant = Snapshot["tenants"][number];
export type Plan = Snapshot["plans"][number];
export type BillingAnomaly = Snapshot["billingCutover"]["anomalies"][number];
export type Integration = Snapshot["integrations"][number];
export type ProjectSurface = Snapshot["projectAtlas"]["surfaces"][number];
