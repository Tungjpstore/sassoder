"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  changePlatformAdminPassword,
  clearPlatformAdminSession,
  createPlatformAdminSession,
  getPlatformAdminSession,
  requirePlatformAdminPermission,
  type PlatformAdminPermission,
  verifyPlatformAdminPassword
} from "@/lib/platform-admin-auth";
import {
  invalidatePlatformAdminSnapshotCache,
  resolveBillingAnomaly,
  updatePlatformSetting,
  updatePlatformUserStatus,
  updateSaasPlan,
  updateTenantPlatformStatus,
  uploadPlatformAsset
} from "@/services/platform-admin-service";
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
  revalidatePath("/admin");
  revalidatePath("/admin/site");
  revalidatePath("/admin/plans");
  revalidatePath("/admin/billing");
  revalidatePath("/admin/tenants");
  revalidatePath("/admin/users");
  revalidatePath("/admin/security");
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
    return { error: "Email hoặc mật khẩu /admin không đúng." };
  }

  await createPlatformAdminSession({
    mustChangePassword: verification.mustChangePassword,
    user: verification.user,
    permissions: verification.permissions
  });
  redirect(verification.mustChangePassword ? "/admin/change-password" : "/admin");
}

export async function platformAdminChangePasswordAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const session = await getPlatformAdminSession();
  if (!session.authenticated) {
    redirect("/admin");
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
  redirect("/admin");
}

export async function platformAdminLogoutAction() {
  await clearPlatformAdminSession();
  redirect("/admin");
}

export async function refreshPlatformAdminAction() {
  await requirePlatformAdmin("platform.refresh");
  revalidateAdmin();
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
