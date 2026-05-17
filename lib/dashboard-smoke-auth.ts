export const DASHBOARD_SMOKE_SESSION_COOKIE = "logivn-dashboard-smoke";

export function dashboardSmokeAuthEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.VERCEL_ENV !== "production" &&
    Boolean(process.env.DASHBOARD_SMOKE_AUTH_SECRET)
  );
}

export function parseDashboardSmokeCookie(value?: string) {
  if (!value) return null;
  const separatorIndex = value.indexOf(":");
  if (separatorIndex <= 0) return null;

  const restaurantSlug = value.slice(0, separatorIndex).trim();
  const secret = value.slice(separatorIndex + 1);
  if (!restaurantSlug || !secret) return null;

  return { restaurantSlug, secret };
}
