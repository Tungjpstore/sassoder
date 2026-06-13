"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAppUrl } from "@/lib/app-url";
import {
  changePlatformAdminPassword,
  clearPlatformAdminSession,
  createPlatformAdminSession,
  getPlatformAdminSession,
  requirePlatformAdminPermission,
  type PlatformAdminPermission,
  verifyPlatformAdminPassword
} from "@/lib/platform-admin-auth";
import { platformAdminInternalPath } from "@/lib/platform-admin-url";
import {
  adminConfigurableAiProviders,
  updatePlatformAiProviderConfig
} from "@/services/platform-ai-provider-config-service";
import {
  invalidatePlatformAdminSnapshotCache,
  writePlatformAuditLog,
  resolveBillingAnomaly,
  updatePlatformSetting,
  updatePlatformUserStatus,
  updateSaasPlan,
  updateTenantPlatformStatus,
  uploadPlatformAsset
} from "@/services/platform-admin-service";
import {
  createPlatformTelegramConnectionToken,
  revokePlatformTelegramConnection,
  revokePlatformTelegramToken
} from "@/services/platform-telegram-connection-service";
import { confirmSubscriptionPayment, rejectSubscriptionPayment } from "@/services/subscription-service";

const DEFAULT_LANDING_BANNER_URL = "/brand/logivn/01-banner-overview-hero-v2.png";

const loginSchema = z.object({
  email: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim().toLowerCase() : undefined),
    z.string().email().optional()
  ),
  password: z.string().min(1)
});

const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().trim().min(12).max(128),
    confirmPassword: z.string().trim().min(12).max(128)
  })
  .superRefine((value, context) => {
    if (value.newPassword !== value.confirmPassword) {
      context.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Mật khẩu xác nhận chưa khớp."
      });
    }

    if (!/[a-z]/i.test(value.newPassword) || !/[0-9]/.test(value.newPassword) || !/[^a-z0-9]/i.test(value.newPassword)) {
      context.addIssue({
        code: "custom",
        path: ["newPassword"],
        message: "Mật khẩu mới cần có chữ, số và ký tự đặc biệt."
      });
    }
  });

const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

const brandSchema = z.object({
  companyName: z.string().trim().min(2).max(80),
  legalName: z.string().trim().min(2).max(120),
  hotline: z.string().trim().min(6).max(32),
  email: z.string().trim().email(),
  address: z.string().trim().min(5).max(240),
  logoUrl: z.string().trim().optional(),
  primaryColor: colorSchema,
  accentColor: colorSchema
});

const landingSchema = z.object({
  heroTitle: z.string().trim().min(8).max(140),
  heroSubtitle: z.string().trim().min(12).max(320),
  primaryCta: z.string().trim().min(2).max(40),
  secondaryCta: z.string().trim().min(2).max(40),
  trustTitle: z.string().trim().min(6).max(120),
  dashboardTitle: z.string().trim().min(6).max(120),
  dashboardSubtitle: z.string().trim().min(8).max(220),
  finalTitle: z.string().trim().min(8).max(140),
  finalSubtitle: z.string().trim().min(8).max(220),
  footerTagline: z.string().trim().min(6).max(160),
  bannerUrl: z.string().trim().optional()
});

const billingSchema = z.object({
  bankCode: z.string().trim().regex(/^[A-Z0-9]{2,20}$/),
  bankAccount: z.string().trim().regex(/^[0-9]{4,32}$/),
  bankAccountName: z.string().trim().min(2).max(80),
  transferPrefix: z.string().trim().regex(/^[A-Z0-9-]{3,20}$/),
  defaultPlanCode: z.string().trim().min(2).max(32)
});

const planSchema = z.object({
  planId: z.string().trim().min(1),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240),
  monthlyPrice: z.coerce.number().int().min(0).max(50_000_000),
  trialDays: z.coerce.number().int().min(0).max(365),
  features: z.string().trim().max(1000),
  isActive: z.enum(["true", "false"])
});

const actionReasonSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() || undefined : undefined),
  z.string().max(300).optional()
);

const tenantStatusSchema = z
  .object({
    restaurantId: z.string().uuid(),
    status: z.enum(["active", "suspended", "deleted"]),
    reason: actionReasonSchema
  })
  .superRefine((value, context) => {
    if (value.status !== "active" && !value.reason) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Vui lòng nhập lý do khi tạm dừng hoặc xóa tenant."
      });
    }
  });

const userStatusSchema = z
  .object({
    userId: z.string().uuid(),
    status: z.enum(["active", "blocked"]),
    reason: actionReasonSchema
  })
  .superRefine((value, context) => {
    if (value.status === "blocked" && !value.reason) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Vui lòng nhập lý do khi khóa người dùng."
      });
    }
  });

const paymentActionSchema = z.object({
  paymentId: z.string().uuid(),
  reason: z.string().trim().max(300).optional()
});

const billingAnomalySchema = z.object({
  key: z.enum(["premium_trial_subscription", "pending_without_payment", "pending_payment_missing_policy"]),
  subscriptionId: z.string().uuid().optional(),
  paymentId: z.string().uuid().optional()
});

const aiProviderConfigSchema = z.object({
  provider: z.enum(adminConfigurableAiProviders),
  enabled: z.enum(["true", "false"]),
  apiKey: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() || undefined : undefined),
    z.string().min(8).max(3000).optional()
  ),
  clearApiKey: z.enum(["true", "false"]).default("false"),
  baseUrl: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() || undefined : undefined),
    z.string().url().max(500).optional()
  ),
  chatModel: z.preprocess((value) => (typeof value === "string" ? value.trim() || undefined : undefined), z.string().max(180).optional()),
  fastModel: z.preprocess((value) => (typeof value === "string" ? value.trim() || undefined : undefined), z.string().max(180).optional()),
  imageModel: z.preprocess((value) => (typeof value === "string" ? value.trim() || undefined : undefined), z.string().max(180).optional()),
  ocrModel: z.preprocess((value) => (typeof value === "string" ? value.trim() || undefined : undefined), z.string().max(180).optional())
});

const platformTelegramConnectionRevokeSchema = z.object({
  connectionId: z.string().uuid(),
  reason: actionReasonSchema
});

const platformTelegramTokenRevokeSchema = z.object({
  tokenId: z.string().uuid().optional(),
  revokeAll: z.enum(["true", "false"]).default("false")
});

const platformCronJobSchema = z.object({
  jobKey: z.enum(["reports", "ai-ops", "reservations-expire", "subscriptions"])
});

const manualBackupSchema = z.object({
  retentionClass: z.enum(["daily", "weekly", "monthly", "manual"]).default("manual"),
  reason: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() || undefined : undefined),
    z.string().max(300).optional()
  )
});

const platformOperationSchema = z.object({
  operation: z.enum([
    "ack_alert",
    "clear_cache",
    "create_ai_summary",
    "create_feature_flag_draft",
    "pause_queue",
    "replay_queue",
    "request_rollback",
    "resolve_incident",
    "restart_workers",
    "run_smoke_check"
  ]),
  targetType: z.string().trim().min(2).max(80),
  targetId: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() || undefined : undefined),
    z.string().max(180).optional()
  ),
  reason: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() || undefined : undefined),
    z.string().max(300).optional()
  )
});

const cronJobPaths: Record<z.infer<typeof platformCronJobSchema>["jobKey"], string> = {
  reports: "/api/cron/reports",
  "ai-ops": "/api/cron/ai-ops?limit=25&branches=true&inventory=true",
  "reservations-expire": "/api/cron/reservations/expire",
  subscriptions: "/api/cron/subscriptions"
};

export type PlatformTelegramConnectActionState = {
  error?: string;
  token?: {
    expiresAt: string;
    startUrl: string | null;
    startCommand: string;
    scopes: string[];
    role: "DEV" | "SUPPORT" | "SRE" | "ADMIN";
    ttlSeconds: number;
    persistent: boolean;
  };
};

async function requirePlatformAdmin(permission: PlatformAdminPermission = "platform.read") {
  return requirePlatformAdminPermission(permission);
}

function tenantStatusPermission(status: z.infer<typeof tenantStatusSchema>["status"]): PlatformAdminPermission {
  if (status === "active") return "tenants.restore";
  if (status === "suspended") return "tenants.suspend";
  return "tenants.delete";
}

function userStatusPermission(status: z.infer<typeof userStatusSchema>["status"]): PlatformAdminPermission {
  return status === "active" ? "users.restore" : "users.block";
}

function revalidateAdmin() {
  invalidatePlatformAdminSnapshotCache();
  revalidateTag("platform-site-config", "max");
  revalidateTag("public-active-plans", "max");
  revalidatePath("/");
  revalidatePath("/pricing");
  ["/", "/site", "/plans", "/billing", "/tenants", "/users", "/ai", "/security", "/services", "/backup", "/ops", "/alerts", "/logs"].forEach((path) => {
    revalidatePath(platformAdminInternalPath(path));
  });
}

async function currentRequestOrigin() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) return getAppUrl();
  const proto = requestHeaders.get("x-forwarded-proto") ?? (process.env.VERCEL_ENV ? "https" : "http");
  return `${proto}://${host}`;
}

function compactOperationResponse(value: unknown) {
  const text = typeof value === "string" ? value : (JSON.stringify(value) ?? String(value));
  return text.length > 1200 ? `${text.slice(0, 1200)}...` : text;
}

async function callInternalPlatformPath(pathOrUrl: string) {
  const origin = await currentRequestOrigin();
  const url = /^https?:\/\//i.test(pathOrUrl) ? new URL(pathOrUrl) : new URL(pathOrUrl, origin);
  const headers: HeadersInit = { accept: "application/json,text/html;q=0.9,*/*;q=0.8" };
  if (process.env.CRON_SECRET) headers.authorization = `Bearer ${process.env.CRON_SECRET}`;

  const response = await fetch(url, { method: "GET", headers, cache: "no-store" });
  const bodyText = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    path: `${url.pathname}${url.search}`,
    response: compactOperationResponse(bodyText)
  };
}

async function callInternalPlatformJson(pathOrUrl: string, body: Record<string, unknown>) {
  const origin = await currentRequestOrigin();
  const url = /^https?:\/\//i.test(pathOrUrl) ? new URL(pathOrUrl) : new URL(pathOrUrl, origin);
  const headers: HeadersInit = {
    accept: "application/json",
    "content-type": "application/json"
  };
  const internalSecret = process.env.LOGIVN_INTERNAL_API_KEY || process.env.CRON_SECRET;
  if (internalSecret) headers.authorization = `Bearer ${internalSecret}`;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store"
  });
  const bodyText = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    path: `${url.pathname}${url.search}`,
    response: compactOperationResponse(bodyText)
  };
}

function replayPathForTarget(targetType: string, targetId?: string | null) {
  const target = `${targetType} ${targetId ?? ""}`.toLowerCase();
  if (target.includes("billing") || target.includes("payment") || target.includes("vietqr") || target.includes("subscription")) {
    return cronJobPaths.subscriptions;
  }
  if (target.includes("report")) return cronJobPaths.reports;
  if (target.includes("reservation")) return cronJobPaths["reservations-expire"];
  return cronJobPaths["ai-ops"];
}

function smokePathForTarget(targetId?: string | null) {
  const target = targetId?.trim();
  if (!target) return "/";
  if (target.startsWith("/")) return target;
  if (/^https?:\/\//i.test(target)) return target;
  return "/";
}

async function executePlatformOperation(parsed: z.infer<typeof platformOperationSchema>) {
  if (parsed.operation === "clear_cache") {
    revalidateAdmin();
    return { mode: "cache_invalidated", executed: true };
  }

  if (parsed.operation === "create_ai_summary") {
    return { mode: "internal_endpoint", executed: true, ...(await callInternalPlatformPath(cronJobPaths["ai-ops"])) };
  }

  if (parsed.operation === "replay_queue") {
    return { mode: "internal_endpoint", executed: true, ...(await callInternalPlatformPath(replayPathForTarget(parsed.targetType, parsed.targetId))) };
  }

  if (parsed.operation === "run_smoke_check") {
    return { mode: "smoke_check", executed: true, ...(await callInternalPlatformPath(smokePathForTarget(parsed.targetId))) };
  }

  return { mode: "audit_request", executed: false };
}

export async function platformAdminLoginAction(_prevState: { error?: string } | undefined, formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password")
  });

  if (!parsed.success) {
    return { error: "Vui lòng nhập email hợp lệ hoặc mật khẩu nội bộ." };
  }

  const verification = await verifyPlatformAdminPassword(
    parsed.data.email
      ? { email: parsed.data.email, password: parsed.data.password }
      : parsed.data.password
  );

  if (!verification.ok) {
    return { error: "Email hoặc mật khẩu admin.logivn.com không đúng." };
  }

  await createPlatformAdminSession({
    mustChangePassword: verification.mustChangePassword,
    user: verification.user,
    permissions: verification.permissions
  });
  redirect(verification.mustChangePassword ? "/change-password" : "/");
}

export async function platformAdminChangePasswordAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const session = await getPlatformAdminSession();
  if (!session.authenticated) {
    redirect("/");
  }

  const parsed = passwordChangeSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword")
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Mật khẩu mới chưa hợp lệ." };
  }

  const changed = await changePlatformAdminPassword({
    currentPassword: parsed.data.currentPassword,
    newPassword: parsed.data.newPassword
  });

  if (!changed) {
    return { error: "Mật khẩu hiện tại không đúng." };
  }

  await createPlatformAdminSession({
    mustChangePassword: false,
    user: session.userId
      ? {
          id: session.userId,
          email: session.email ?? "platform-admin",
          display_name: session.displayName,
          role: session.role
        }
      : undefined,
    permissions: session.permissions
  });
  redirect("/");
}

export async function platformAdminLogoutAction() {
  await clearPlatformAdminSession();
  redirect("/");
}

export async function refreshPlatformAdminAction() {
  await requirePlatformAdmin("platform.refresh");
  revalidateAdmin();
}

export async function runPlatformCronJobAction(formData: FormData) {
  const parsed = platformCronJobSchema.parse({ jobKey: formData.get("jobKey") });
  const session = await requirePlatformAdmin("platform.refresh");
  const path = cronJobPaths[parsed.jobKey];
  const origin = await currentRequestOrigin();
  const url = new URL(path, origin);
  const headers: HeadersInit = { accept: "application/json" };
  if (process.env.CRON_SECRET) headers.authorization = `Bearer ${process.env.CRON_SECRET}`;

  await writePlatformAuditLog({
    actor: session.actor,
    action: "platform_cron_run_requested",
    targetType: "cron_job",
    targetId: parsed.jobKey,
    metadata: { path: `${url.pathname}${url.search}` },
    required: true
  });

  const response = await fetch(url, { method: "GET", headers, cache: "no-store" });
  const bodyText = await response.text();
  await writePlatformAuditLog({
    actor: session.actor,
    action: response.ok ? "platform_cron_run_completed" : "platform_cron_run_failed",
    targetType: "cron_job",
    targetId: parsed.jobKey,
    metadata: {
      status: response.status,
      response: compactOperationResponse(bodyText)
    },
    required: true
  });

  revalidateAdmin();
  if (!response.ok) {
    throw new Error(`Không chạy được ${parsed.jobKey}: HTTP ${response.status}`);
  }
}

export async function requestManualBackupAction(formData: FormData) {
  const parsed = manualBackupSchema.parse({
    retentionClass: formData.get("retentionClass") || "manual",
    reason: formData.get("reason")
  });
  const session = await requirePlatformAdmin("platform.refresh");

  await writePlatformAuditLog({
    actor: session.actor,
    action: "manual_backup_requested",
    targetType: "backup_job",
    metadata: {
      retentionClass: parsed.retentionClass,
      reason: parsed.reason ?? null,
      source: "admin.logivn.com"
    },
    required: true
  });

  const execution = await callInternalPlatformJson("/api/internal/backup/trigger", {
    actor: session.actor,
    retentionClass: parsed.retentionClass,
    reason: parsed.reason ?? "Manual backup requested from Control Center"
  });

  await writePlatformAuditLog({
    actor: session.actor,
    action: execution.ok ? "manual_backup_queued" : "manual_backup_queue_failed",
    targetType: "backup_job",
    metadata: {
      retentionClass: parsed.retentionClass,
      reason: parsed.reason ?? null,
      execution
    },
    required: true
  });

  revalidateAdmin();
  if (!execution.ok) {
    throw new Error(`Không queue được backup thủ công: HTTP ${execution.status}`);
  }
}

export async function requestPlatformOperationAction(formData: FormData) {
  const parsed = platformOperationSchema.parse({
    operation: formData.get("operation"),
    targetType: formData.get("targetType"),
    targetId: formData.get("targetId"),
    reason: formData.get("reason")
  });
  const session = await requirePlatformAdmin("platform.refresh");

  await writePlatformAuditLog({
    actor: session.actor,
    action: `platform_operation_${parsed.operation}_requested`,
    targetType: parsed.targetType,
    targetId: parsed.targetId,
    metadata: { reason: parsed.reason ?? null, source: "admin.logivn.com" },
    required: true
  });

  let execution: Awaited<ReturnType<typeof executePlatformOperation>>;
  try {
    execution = await executePlatformOperation(parsed);
  } catch (error) {
    await writePlatformAuditLog({
      actor: session.actor,
      action: `platform_operation_${parsed.operation}_failed`,
      targetType: parsed.targetType,
      targetId: parsed.targetId,
      metadata: {
        reason: parsed.reason ?? null,
        source: "admin.logivn.com",
        error: error instanceof Error ? error.message : String(error)
      },
      required: true
    });
    revalidateAdmin();
    throw error;
  }

  await writePlatformAuditLog({
    actor: session.actor,
    action: `platform_operation_${parsed.operation}_${execution.executed ? "completed" : "queued"}`,
    targetType: parsed.targetType,
    targetId: parsed.targetId,
    metadata: { reason: parsed.reason ?? null, source: "admin.logivn.com", execution },
    required: true
  });
  revalidateAdmin();

  if ("ok" in execution && !execution.ok) {
    throw new Error(`Thao tác ${parsed.operation} không hoàn tất: HTTP ${execution.status}`);
  }
}

export async function createPlatformTelegramConnectTokenAction(
  _prevState?: PlatformTelegramConnectActionState,
  _formData?: FormData
): Promise<PlatformTelegramConnectActionState> {
  const session = await requirePlatformAdmin("security.read");
  try {
    const token = await createPlatformTelegramConnectionToken(session);
    revalidatePath(platformAdminInternalPath("/ops"));
    revalidatePath(platformAdminInternalPath("/security"));
    return {
      token: {
        expiresAt: token.expiresAt,
        startUrl: token.startUrl,
        startCommand: token.startCommand,
        scopes: token.scopes,
        role: token.role,
        ttlSeconds: token.ttlSeconds,
        persistent: token.persistent
      }
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Không tạo được link kết nối Telegram DevOps." };
  }
}

export async function revokePlatformTelegramConnectionAction(formData: FormData) {
  const parsed = platformTelegramConnectionRevokeSchema.parse({
    connectionId: formData.get("connectionId"),
    reason: formData.get("reason")
  });
  const session = await requirePlatformAdmin("security.read");
  await revokePlatformTelegramConnection(session, parsed);
  revalidatePath(platformAdminInternalPath("/ops"));
  revalidatePath(platformAdminInternalPath("/security"));
}

export async function revokePlatformTelegramTokenAction(formData: FormData) {
  const parsed = platformTelegramTokenRevokeSchema.parse({
    tokenId: formData.get("tokenId") || undefined,
    revokeAll: formData.get("revokeAll") || "false"
  });
  if (parsed.revokeAll !== "true" && !parsed.tokenId) {
    throw new Error("Thiếu token cần thu hồi.");
  }
  const session = await requirePlatformAdmin("security.read");
  await revokePlatformTelegramToken(session, { tokenId: parsed.tokenId, revokeAll: parsed.revokeAll === "true" });
  revalidatePath(platformAdminInternalPath("/ops"));
  revalidatePath(platformAdminInternalPath("/security"));
}

export async function updateBrandSettingAction(formData: FormData) {
  const session = await requirePlatformAdmin("content.write");
  const parsed = brandSchema.parse({
    companyName: formData.get("companyName"),
    legalName: formData.get("legalName"),
    hotline: formData.get("hotline"),
    email: formData.get("email"),
    address: formData.get("address"),
    logoUrl: formData.get("logoUrl"),
    primaryColor: formData.get("primaryColor"),
    accentColor: formData.get("accentColor")
  });
  const uploadedLogo = await uploadPlatformAsset(formData.get("logoFile"), "brand");

  await updatePlatformSetting({
    key: "brand",
    value: {
      ...parsed,
      logoUrl: uploadedLogo || parsed.logoUrl || "/brand/logivn/logo-horizontal-nav.png"
    },
    updatedBy: session.actor
  });
  revalidateAdmin();
}

export async function updateLandingSettingAction(formData: FormData) {
  const session = await requirePlatformAdmin("content.write");
  const parsed = landingSchema.parse({
    heroTitle: formData.get("heroTitle"),
    heroSubtitle: formData.get("heroSubtitle"),
    primaryCta: formData.get("primaryCta"),
    secondaryCta: formData.get("secondaryCta"),
    trustTitle: formData.get("trustTitle"),
    dashboardTitle: formData.get("dashboardTitle"),
    dashboardSubtitle: formData.get("dashboardSubtitle"),
    finalTitle: formData.get("finalTitle"),
    finalSubtitle: formData.get("finalSubtitle"),
    footerTagline: formData.get("footerTagline"),
    bannerUrl: formData.get("bannerUrl")
  });
  const uploadedBanner = await uploadPlatformAsset(formData.get("bannerFile"), "landing");

  await updatePlatformSetting({
    key: "landing",
    value: {
      ...parsed,
      bannerUrl: uploadedBanner || parsed.bannerUrl || DEFAULT_LANDING_BANNER_URL
    },
    updatedBy: session.actor
  });
  revalidateAdmin();
}

export async function updateBillingSettingAction(formData: FormData) {
  const session = await requirePlatformAdmin("billing.write");
  const parsed = billingSchema.parse({
    bankCode: formData.get("bankCode"),
    bankAccount: formData.get("bankAccount"),
    bankAccountName: formData.get("bankAccountName"),
    transferPrefix: formData.get("transferPrefix"),
    defaultPlanCode: formData.get("defaultPlanCode")
  });

  await updatePlatformSetting({ key: "billing", value: parsed, updatedBy: session.actor });
  revalidateAdmin();
}

export async function updateSaasPlanAction(formData: FormData) {
  const session = await requirePlatformAdmin("billing.write");
  const parsed = planSchema.parse({
    planId: formData.get("planId"),
    name: formData.get("name"),
    description: formData.get("description"),
    monthlyPrice: formData.get("monthlyPrice"),
    trialDays: formData.get("trialDays"),
    features: formData.get("features"),
    isActive: formData.get("isActive")
  });

  await updateSaasPlan({
    planId: parsed.planId,
    name: parsed.name,
    description: parsed.description,
    monthlyPrice: parsed.monthlyPrice,
    trialDays: parsed.trialDays,
    features: parsed.features
      .split("\n")
      .map((feature) => feature.trim())
      .filter(Boolean),
    isActive: parsed.isActive === "true",
    updatedBy: session.actor
  });
  revalidateAdmin();
}

export async function updateAiProviderConfigAction(formData: FormData) {
  const session = await requirePlatformAdmin("admins.manage");
  const parsed = aiProviderConfigSchema.parse({
    provider: formData.get("provider"),
    enabled: formData.get("enabled"),
    apiKey: formData.get("apiKey"),
    clearApiKey: formData.get("clearApiKey") === "true" ? "true" : "false",
    baseUrl: formData.get("baseUrl"),
    chatModel: formData.get("chatModel"),
    fastModel: formData.get("fastModel"),
    imageModel: formData.get("imageModel"),
    ocrModel: formData.get("ocrModel")
  });

  await updatePlatformAiProviderConfig({
    provider: parsed.provider,
    enabled: parsed.enabled === "true",
    apiKey: parsed.apiKey,
    clearApiKey: parsed.clearApiKey === "true",
    baseUrl: parsed.baseUrl,
    chatModel: parsed.chatModel,
    fastModel: parsed.fastModel,
    imageModel: parsed.imageModel,
    ocrModel: parsed.ocrModel,
    updatedBy: session.actor
  });
  revalidateAdmin();
}

export async function updateTenantPlatformStatusAction(formData: FormData) {
  const parsed = tenantStatusSchema.parse({
    restaurantId: formData.get("restaurantId"),
    status: formData.get("status"),
    reason: formData.get("reason")
  });
  const session = await requirePlatformAdmin(tenantStatusPermission(parsed.status));

  await updateTenantPlatformStatus({ ...parsed, updatedBy: session.actor });
  revalidateAdmin();
}

export async function updatePlatformUserStatusAction(formData: FormData) {
  const parsed = userStatusSchema.parse({
    userId: formData.get("userId"),
    status: formData.get("status"),
    reason: formData.get("reason")
  });
  const session = await requirePlatformAdmin(userStatusPermission(parsed.status));

  await updatePlatformUserStatus({ ...parsed, updatedBy: session.actor });
  revalidateAdmin();
}

export async function confirmSubscriptionPaymentAction(formData: FormData) {
  const session = await requirePlatformAdmin("billing.write");
  const parsed = paymentActionSchema.parse({
    paymentId: formData.get("paymentId")
  });

  await confirmSubscriptionPayment({ paymentId: parsed.paymentId, confirmedBy: session.actor });
  revalidateAdmin();
}

export async function rejectSubscriptionPaymentAction(formData: FormData) {
  const session = await requirePlatformAdmin("billing.write");
  const parsed = paymentActionSchema.parse({
    paymentId: formData.get("paymentId"),
    reason: formData.get("reason")
  });

  await rejectSubscriptionPayment({ paymentId: parsed.paymentId, reason: parsed.reason, rejectedBy: session.actor });
  revalidateAdmin();
}

export async function resolveBillingAnomalyAction(formData: FormData) {
  const session = await requirePlatformAdmin("billing.write");
  const parsed = billingAnomalySchema.parse({
    key: formData.get("key"),
    subscriptionId: formData.get("subscriptionId") || undefined,
    paymentId: formData.get("paymentId") || undefined
  });

  await resolveBillingAnomaly({ ...parsed, resolvedBy: session.actor });
  revalidateAdmin();
}
