export type OnboardingIntentPlan = "pro" | "premium";

export type OnboardingIntent = {
  plan?: unknown;
  source?: unknown;
  variant?: unknown;
  pilotGoal?: unknown;
};

const protectedDashboardPathnames = new Set([
  "/dashboard/login",
  "/dashboard/register",
  "/dashboard/setup",
  "/dashboard/verify-email",
  "/dashboard/forgot-password",
  "/dashboard/reset-password"
]);

function firstString(value: unknown) {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return typeof value === "string" ? value : "";
}

function trimmed(value: unknown, maxLength: number) {
  return firstString(value).trim().slice(0, maxLength);
}

export function normalizeOnboardingPlan(value: unknown): OnboardingIntentPlan {
  const plan = trimmed(value, 24).toLowerCase();
  return plan === "premium" ? "premium" : "pro";
}

export function buildOnboardingIntentParams(intent: OnboardingIntent) {
  const params = new URLSearchParams({ plan: normalizeOnboardingPlan(intent.plan) });
  const source = trimmed(intent.source, 80);
  const variant = trimmed(intent.variant, 40);
  const pilotGoal = trimmed(intent.pilotGoal, 80);

  if (source) params.set("source", source);
  if (variant) params.set("variant", variant);
  if (pilotGoal) params.set("pilotGoal", pilotGoal);

  return params;
}

export function buildOnboardingIntentPath(intent: OnboardingIntent) {
  return `/dashboard/onboarding?${buildOnboardingIntentParams(intent).toString()}`;
}

export function buildDashboardLoginPath(input: { email?: unknown; next?: unknown }) {
  const params = new URLSearchParams();
  const email = trimmed(input.email, 254).toLowerCase();
  const next = safeProtectedDashboardIntentNext(input.next);
  if (email) params.set("email", email);
  if (next) params.set("next", next);
  const query = params.toString();
  return query ? `/dashboard/login?${query}` : "/dashboard/login";
}

export function buildForgotPasswordPath(input: { email?: unknown; next?: unknown }) {
  const params = new URLSearchParams();
  const email = trimmed(input.email, 254).toLowerCase();
  const next = safeProtectedDashboardIntentNext(input.next);
  if (email) params.set("email", email);
  if (next) params.set("next", next);
  const query = params.toString();
  return query ? `/dashboard/forgot-password?${query}` : "/dashboard/forgot-password";
}

function safeProtectedDashboardIntentNext(value: unknown) {
  const next = trimmed(value, 512);
  if (!next || !next.startsWith("/") || next.startsWith("//") || !next.startsWith("/dashboard")) return "";
  const pathname = next.split(/[?#]/)[0] ?? "";
  return protectedDashboardPathnames.has(pathname) ? "" : next;
}
