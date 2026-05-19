import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDashboardLoginPath,
  buildForgotPasswordPath,
  buildOnboardingIntentPath,
  normalizeOnboardingPlan
} from "./auth-onboarding-intent";

test("normalizeOnboardingPlan accepts only public plan codes", () => {
  assert.equal(normalizeOnboardingPlan("premium"), "premium");
  assert.equal(normalizeOnboardingPlan("pro"), "pro");
  assert.equal(normalizeOnboardingPlan("enterprise"), "pro");
  assert.equal(normalizeOnboardingPlan(["premium"]), "premium");
});

test("buildOnboardingIntentPath preserves compact campaign context", () => {
  assert.equal(
    buildOnboardingIntentPath({
      plan: "premium",
      source: "pricing",
      variant: "hero-a",
      pilotGoal: "qr-first"
    }),
    "/dashboard/onboarding?plan=premium&source=pricing&variant=hero-a&pilotGoal=qr-first"
  );
});

test("auth helper paths normalize email and preserve next", () => {
  assert.equal(
    buildDashboardLoginPath({ email: " Owner@Example.COM ", next: "/dashboard/onboarding?plan=pro" }),
    "/dashboard/login?email=owner%40example.com&next=%2Fdashboard%2Fonboarding%3Fplan%3Dpro"
  );
  assert.equal(
    buildForgotPasswordPath({ email: " Owner@Example.COM ", next: "/dashboard/orders" }),
    "/dashboard/forgot-password?email=owner%40example.com&next=%2Fdashboard%2Forders"
  );
});

test("auth helper paths reject unsafe or public auth next destinations", () => {
  assert.equal(buildDashboardLoginPath({ email: "owner@example.com", next: "https://evil.test" }), "/dashboard/login?email=owner%40example.com");
  assert.equal(buildForgotPasswordPath({ email: "owner@example.com", next: "/dashboard/login?next=/dashboard/orders" }), "/dashboard/forgot-password?email=owner%40example.com");
});
