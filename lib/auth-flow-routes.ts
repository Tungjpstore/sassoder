export const publicDashboardAuthPaths = new Set([
  "/dashboard/login",
  "/dashboard/register",
  "/dashboard/setup",
  "/dashboard/verify-email",
  "/dashboard/forgot-password",
  "/dashboard/reset-password"
]);

export function firstStringParam(value: unknown) {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return typeof value === "string" ? value : "";
}

export function dashboardPathname(value: string) {
  return value.split(/[?#]/)[0] ?? "";
}

export function isPublicDashboardAuthPath(pathname: string) {
  return publicDashboardAuthPaths.has(pathname);
}

export function safeDashboardNextPath(value: unknown, fallback = "") {
  const next = firstStringParam(value).trim();
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  return next.startsWith("/dashboard") ? next : fallback;
}

export function safeProtectedDashboardNextPath(value: unknown, fallback = "") {
  const next = safeDashboardNextPath(value);
  if (!next) return fallback;
  return isPublicDashboardAuthPath(dashboardPathname(next)) ? fallback : next;
}

export function isSafeStaffLoginPath(value: string) {
  return value === "/staff/login" || /^\/staff\/[a-z0-9-]{2,80}\/login(?:[?#].*)?$/.test(value);
}

export function safePostClearSessionPath(value: unknown, fallback = "/dashboard/login?session=cleared") {
  const next = firstStringParam(value).trim();
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  if (next === "/" || isSafeStaffLoginPath(next)) return next;
  return safeDashboardNextPath(next, fallback);
}

export function dashboardLoginPathForNext(next: string, params: Record<string, string> = {}) {
  const searchParams = new URLSearchParams(params);
  const safeNext = safeProtectedDashboardNextPath(next);
  if (safeNext) searchParams.set("next", safeNext);
  const query = searchParams.toString();
  return query ? `/dashboard/login?${query}` : "/dashboard/login";
}

export function verifyEmailPath(email: string, next?: unknown) {
  const params = new URLSearchParams({ email: email.trim().toLowerCase() });
  const safeNext = safeDashboardNextPath(next);
  if (safeNext) params.set("next", safeNext);
  return `/dashboard/verify-email?${params.toString()}`;
}

export function authenticatedDashboardLandingPath(next?: unknown) {
  return safeProtectedDashboardNextPath(next) || "/dashboard";
}

export function onboardingDashboardLandingPath(next?: unknown) {
  const safeNext = safeDashboardNextPath(next);
  return dashboardPathname(safeNext) === "/dashboard/onboarding" ? safeNext : "/dashboard/onboarding";
}

export function dashboardLoginPathForOnboarding(next?: unknown) {
  const onboardingNext = safeDashboardNextPath(next, "/dashboard/onboarding");
  const params = new URLSearchParams({ next: onboardingNext });
  return `/dashboard/login?${params.toString()}`;
}
