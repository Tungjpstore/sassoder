import assert from "node:assert/strict";
import test from "node:test";
import { getOnboardingTableLimit, validateOnboardingTableCount } from "@/lib/billing/plan-limits";

test("onboarding table limits are enforced by normalized plan", () => {
  assert.equal(getOnboardingTableLimit("pro"), 20);
  assert.equal(getOnboardingTableLimit("premium"), 300);
  assert.equal(getOnboardingTableLimit("unknown"), 20);

  assert.equal(validateOnboardingTableCount({ planCode: "pro", tableCount: 20 }).ok, true);
  assert.equal(validateOnboardingTableCount({ planCode: "pro", tableCount: 21 }).ok, false);
  assert.equal(validateOnboardingTableCount({ planCode: "pro", tableCount: 24 }).ok, false);
  assert.equal(validateOnboardingTableCount({ planCode: "premium", tableCount: 24 }).ok, true);
  assert.equal(validateOnboardingTableCount({ planCode: "premium", tableCount: 301 }).ok, false);
});

test("unknown or tampered plan codes fail into Pro limits", () => {
  const validation = validateOnboardingTableCount({ planCode: "enterprise", tableCount: 24 });

  assert.equal(validation.ok, false);
  assert.equal(validation.planCode, "pro");
  assert.match(validation.message, /LogiVN Pro/);
});
