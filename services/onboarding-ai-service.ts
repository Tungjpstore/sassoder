import "server-only";

import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type OnboardingAiPlanCode = "pro" | "premium";
export type OnboardingAiScope = "brand_logo" | "menu_ocr";

type UsageEntry = {
  count: number;
  updatedAt: string;
};

type OnboardingAiUsageMetadata = {
  version: 1;
  brand_logo?: UsageEntry;
  menu_ocr?: UsageEntry;
};

const metadataKey = "logivn_onboarding_ai";
const scopeLabels: Record<OnboardingAiScope, string> = {
  brand_logo: "tạo ảnh logo AI trong onboarding",
  menu_ocr: "quét OCR menu trong onboarding"
};

const onboardingAiLimits: Record<OnboardingAiScope, Record<OnboardingAiPlanCode, number>> = {
  brand_logo: {
    pro: 2,
    premium: 5
  },
  menu_ocr: {
    pro: 1,
    premium: 5
  }
};

export function normalizeOnboardingAiPlanCode(value?: string | null): OnboardingAiPlanCode {
  return value === "premium" ? "premium" : "pro";
}

function readUsageMetadata(value: unknown): OnboardingAiUsageMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { version: 1 };
  const metadata = value as Partial<Record<OnboardingAiScope | "version", unknown>>;

  function readEntry(scope: OnboardingAiScope): UsageEntry | undefined {
    const entry = metadata[scope];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return undefined;
    const record = entry as Partial<UsageEntry>;
    return {
      count: Math.max(0, Number(record.count ?? 0)),
      updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date(0).toISOString()
    };
  }

  return {
    version: 1,
    brand_logo: readEntry("brand_logo"),
    menu_ocr: readEntry("menu_ocr")
  };
}

async function readAuthUserMetadata(userId: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.auth.admin.getUserById(userId);

  if (error || !data.user) {
    throw new AppError(error?.message || "Không đọc được phiên đăng ký AI.", 401);
  }

  return {
    appMetadata: data.user.app_metadata ?? {},
    usage: readUsageMetadata((data.user.app_metadata as Record<string, unknown> | undefined)?.[metadataKey])
  };
}

export async function getOnboardingAiQuota({
  userId,
  planCode,
  scope
}: {
  userId: string;
  planCode?: string | null;
  scope: OnboardingAiScope;
}) {
  const normalizedPlan = normalizeOnboardingAiPlanCode(planCode);
  const limit = onboardingAiLimits[scope][normalizedPlan];
  const { usage } = await readAuthUserMetadata(userId);
  const used = usage[scope]?.count ?? 0;

  return {
    scope,
    label: scopeLabels[scope],
    planCode: normalizedPlan,
    limit,
    used,
    remaining: Math.max(0, limit - used)
  };
}

export async function assertOnboardingAiQuota(input: {
  userId: string;
  planCode?: string | null;
  scope: OnboardingAiScope;
}) {
  const quota = await getOnboardingAiQuota(input);
  if (quota.remaining <= 0) {
    throw new AppError(`Gói ${quota.planCode.toUpperCase()} đã dùng hết ${quota.limit} lượt ${quota.label}.`, 402);
  }

  return quota;
}

export async function recordOnboardingAiUsage({
  userId,
  planCode,
  scope
}: {
  userId: string;
  planCode?: string | null;
  scope: OnboardingAiScope;
}) {
  const quota = await assertOnboardingAiQuota({ userId, planCode, scope });
  const supabase = createAdminSupabaseClient();
  const { appMetadata, usage } = await readAuthUserMetadata(userId);
  const now = new Date().toISOString();
  const current = usage[scope]?.count ?? 0;
  const nextUsage = {
    ...usage,
    [scope]: {
      count: current + 1,
      updatedAt: now
    }
  } satisfies OnboardingAiUsageMetadata;

  const { error } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...appMetadata,
      [metadataKey]: nextUsage
    }
  });

  if (error) {
    throw new AppError(error.message || "Không cập nhật được quota AI onboarding.", 400);
  }

  return {
    ...quota,
    used: current + 1,
    remaining: Math.max(0, quota.limit - current - 1)
  };
}
