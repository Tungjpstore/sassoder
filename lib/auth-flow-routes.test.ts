import assert from "node:assert/strict";
import { test } from "node:test";
import {
  authenticatedDashboardLandingPath,
  dashboardLoginPathForOnboarding,
  dashboardLoginPathForNext,
  onboardingDashboardLandingPath,
  safePostClearSessionPath,
  safeDashboardNextPath,
  safeProtectedDashboardNextPath,
  verifyEmailPath
} from "./auth-flow-routes";

test("safeDashboardNextPath accepts only internal dashboard paths", () => {
  assert.equal(safeDashboardNextPath("/dashboard/settings?section=billing"), "/dashboard/settings?section=billing");
  assert.equal(safeDashboardNextPath(["/dashboard/menu"]), "/dashboard/menu");
  assert.equal(safeDashboardNextPath("https://evil.test/dashboard"), "");
  assert.equal(safeDashboardNextPath("//evil.test/dashboard"), "");
  assert.equal(safeDashboardNextPath("/pricing"), "");
});

test("safeProtectedDashboardNextPath rejects auth pages to avoid loops", () => {
  assert.equal(safeProtectedDashboardNextPath("/dashboard/orders"), "/dashboard/orders");
  assert.equal(safeProtectedDashboardNextPath("/dashboard/login?next=/dashboard/orders"), "");
  assert.equal(safeProtectedDashboardNextPath("/dashboard/verify-email?email=a@b.test"), "");
});

test("dashboardLoginPathForNext preserves session params and safe next", () => {
  assert.equal(
    dashboardLoginPathForNext("/dashboard/settings?section=billing", { session: "cleared", reason: "refresh" }),
    "/dashboard/login?session=cleared&reason=refresh&next=%2Fdashboard%2Fsettings%3Fsection%3Dbilling"
  );
  assert.equal(dashboardLoginPathForNext("/dashboard/login"), "/dashboard/login");
});

test("safePostClearSessionPath allows only dashboard and staff login destinations", () => {
  assert.equal(safePostClearSessionPath("/dashboard/login?session=cleared"), "/dashboard/login?session=cleared");
  assert.equal(safePostClearSessionPath("/dashboard/orders"), "/dashboard/orders");
  assert.equal(safePostClearSessionPath("/staff/login"), "/staff/login");
  assert.equal(safePostClearSessionPath("/staff/quan-cafe/login?session=cleared"), "/staff/quan-cafe/login?session=cleared");
  assert.equal(safePostClearSessionPath("/staff/../login"), "/dashboard/login?session=cleared");
  assert.equal(safePostClearSessionPath("/pricing"), "/dashboard/login?session=cleared");
  assert.equal(safePostClearSessionPath("https://evil.test"), "/dashboard/login?session=cleared");
});

test("verifyEmailPath normalizes email and rejects unsafe next", () => {
  assert.equal(
    verifyEmailPath(" Owner@Example.COM ", "/dashboard/onboarding?plan=premium"),
    "/dashboard/verify-email?email=owner%40example.com&next=%2Fdashboard%2Fonboarding%3Fplan%3Dpremium"
  );
  assert.equal(verifyEmailPath("owner@example.com", "https://evil.test"), "/dashboard/verify-email?email=owner%40example.com");
});

test("authenticated dashboard landing preserves protected next only", () => {
  assert.equal(authenticatedDashboardLandingPath("/dashboard/orders?status=open"), "/dashboard/orders?status=open");
  assert.equal(authenticatedDashboardLandingPath("/dashboard/login?next=/dashboard/orders"), "/dashboard");
  assert.equal(authenticatedDashboardLandingPath("https://evil.test"), "/dashboard");
});

test("onboarding dashboard landing preserves only onboarding intent", () => {
  assert.equal(onboardingDashboardLandingPath("/dashboard/onboarding?plan=premium"), "/dashboard/onboarding?plan=premium");
  assert.equal(onboardingDashboardLandingPath("/dashboard/orders"), "/dashboard/onboarding");
  assert.equal(onboardingDashboardLandingPath("/pricing"), "/dashboard/onboarding");
});

test("dashboardLoginPathForOnboarding keeps unauthenticated onboarding intent", () => {
  assert.equal(
    dashboardLoginPathForOnboarding("/dashboard/onboarding?plan=premium"),
    "/dashboard/login?next=%2Fdashboard%2Fonboarding%3Fplan%3Dpremium"
  );
  assert.equal(dashboardLoginPathForOnboarding("/dashboard/orders"), "/dashboard/login?next=%2Fdashboard%2Forders");
  assert.equal(dashboardLoginPathForOnboarding("https://evil.test"), "/dashboard/login?next=%2Fdashboard%2Fonboarding");
});
