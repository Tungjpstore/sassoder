const defaultCooldownSeconds = 60;

export type OtpPurpose = "signup" | "recovery";

export function normalizeOtpDigits(value: unknown, length = 6) {
  return typeof value === "string" ? value.replace(/\D/g, "").slice(0, length) : "";
}

export function buildOtpCooldownStorageKey({ email, purpose }: { email: unknown; purpose: OtpPurpose }) {
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  return normalizedEmail ? `logivn:auth-otp:${purpose}:${normalizedEmail}` : "";
}

export function otpCooldownExpiresAt(now = Date.now(), cooldownSeconds = defaultCooldownSeconds) {
  return now + Math.max(0, cooldownSeconds) * 1000;
}

export function remainingOtpCooldownSeconds(expiresAt: unknown, now = Date.now()) {
  const timestamp = typeof expiresAt === "number" ? expiresAt : Number(expiresAt);
  if (!Number.isFinite(timestamp) || timestamp <= now) return 0;
  return Math.ceil((timestamp - now) / 1000);
}

