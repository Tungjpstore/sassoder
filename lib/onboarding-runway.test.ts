import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOnboardingRunway, formatDraftSavedLabel } from "./onboarding-runway";

test("buildOnboardingRunway marks launch only when critical setup is complete", () => {
  const incomplete = buildOnboardingRunway({
    hasRestaurantInfo: true,
    hasPlan: true,
    tableCount: 12,
    initialMenuItemName: "",
    confirmedMenuItemCount: 0
  });

  assert.equal(incomplete.canLaunch, false);
  assert.equal(incomplete.progress, 60);

  const complete = buildOnboardingRunway({
    hasRestaurantInfo: true,
    hasPlan: true,
    tableCount: 12,
    initialMenuItemName: "",
    confirmedMenuItemCount: 18
  });

  assert.equal(complete.canLaunch, true);
  assert.equal(complete.doneCount, 5);
  assert.equal(complete.progress, 100);
});
test("formatDraftSavedLabel keeps autosave status compact", () => {
  const now = 10_000;
  assert.equal(formatDraftSavedLabel(9_000, now), "Đã lưu vừa xong");
  assert.equal(formatDraftSavedLabel(42_000, 100_000), "Đã lưu 58s trước");
  assert.equal(formatDraftSavedLabel(0, now), "Chưa lưu nháp");
});
