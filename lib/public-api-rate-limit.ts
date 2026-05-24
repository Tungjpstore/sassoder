import "server-only";

import { checkPersistentRateLimit } from "@/lib/persistent-rate-limit";
import { AppError } from "@/lib/response";

type PublicRateLimitRule = {
  tenantId?: string;
  scope: string;
  identifier: string;
  ip: string;
  limit: number;
  windowMs: number;
  message?: string;
};

export function rateLimitIdentifier(...parts: Array<string | null | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(":")
    .toLowerCase();
}

export async function assertPublicRateLimits(rules: PublicRateLimitRule[]) {
  for (const rule of rules) {
    const allowed = await checkPersistentRateLimit(rule);
    if (!allowed) {
      throw new AppError(rule.message ?? "Bạn thao tác quá nhanh. Vui lòng thử lại sau.", 429);
    }
  }
}
