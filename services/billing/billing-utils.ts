import { createHash } from "crypto";
import type { BillingPlanCode, QuotaDimension, QuotaWindow } from "@/lib/billing/types";

export type BillingSettings = {
  bankCode: string;
  bankAccount: string;
  bankAccountName: string;
  transferPrefix: string;
  defaultPlanCode: string;
};

const defaultBillingSettings: BillingSettings = {
  bankCode: "VCB",
  bankAccount: "1234567890",
  bankAccountName: "LOGIVN",
  transferPrefix: "LOGIVN",
  defaultPlanCode: "pro"
};

export function asFeatures(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function firstOrNull<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function isMissingSchemaError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST202" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    error.message?.includes("Could not find") ||
    error.message?.includes("does not exist")
  );
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function hashMaybe(value?: string | null) {
  if (!value) return null;
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeSettings(value: unknown): BillingSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaultBillingSettings;
  const settings = value as Record<string, unknown>;

  return {
    bankCode: typeof settings.bankCode === "string" && settings.bankCode ? settings.bankCode : defaultBillingSettings.bankCode,
    bankAccount:
      typeof settings.bankAccount === "string" && settings.bankAccount ? settings.bankAccount : defaultBillingSettings.bankAccount,
    bankAccountName:
      typeof settings.bankAccountName === "string" && settings.bankAccountName
        ? settings.bankAccountName
        : defaultBillingSettings.bankAccountName,
    transferPrefix:
      typeof settings.transferPrefix === "string" && settings.transferPrefix
        ? settings.transferPrefix
        : defaultBillingSettings.transferPrefix,
    defaultPlanCode:
      typeof settings.defaultPlanCode === "string" && settings.defaultPlanCode
        ? settings.defaultPlanCode
        : defaultBillingSettings.defaultPlanCode
  };
}

export function vietQrUrl({
  bank,
  account,
  amount,
  transferContent
}: {
  bank: string;
  account: string;
  amount: number;
  transferContent: string;
}) {
  const params = new URLSearchParams({
    amount: String(amount),
    addInfo: transferContent
  });

  return `https://img.vietqr.io/image/${bank}-${account}-compact2.png?${params.toString()}`;
}

export function daysUntil(value: string | null) {
  if (!value) return 0;
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000));
}

export function dateOnly(value: string | Date | null | undefined) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

export function formatDateVi(value: string | Date | null | undefined) {
  if (!value) return "chưa xác định";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

export function monthStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

export function monthEndIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0)).toISOString();
}

export function dayStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)).toISOString();
}

function dayEndIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0)).toISOString();
}

function lifetimeStartIso() {
  return new Date(Date.UTC(1970, 0, 1, 0, 0, 0, 0)).toISOString();
}

export function getQuotaPeriod(window: QuotaWindow) {
  if (window === "daily") {
    return {
      periodStart: dayStartIso(),
      periodEnd: dayEndIso(),
      resetAt: dayEndIso()
    };
  }

  if (window === "lifetime") {
    return {
      periodStart: lifetimeStartIso(),
      periodEnd: null,
      resetAt: null
    };
  }

  return {
    periodStart: monthStartIso(),
    periodEnd: monthEndIso(),
    resetAt: monthEndIso()
  };
}

export function normalizeBillingPlanCode(planCode?: string | null): BillingPlanCode {
  return planCode === "premium" ? "premium" : "pro";
}

export function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function normalizeQuotaWindow(window?: string | null): QuotaWindow {
  if (window === "daily" || window === "lifetime") return window;
  return "monthly";
}

export function normalizeQuotaDimension(dimension?: string | null): QuotaDimension {
  if (
    dimension === "tables" ||
    dimension === "staff" ||
    dimension === "ai_requests" ||
    dimension === "ai_tokens" ||
    dimension === "ai_images" ||
    dimension === "exports" ||
    dimension === "analytics_runs" ||
    dimension === "automation_runs"
  ) {
    return dimension;
  }

  return "ai_requests";
}
