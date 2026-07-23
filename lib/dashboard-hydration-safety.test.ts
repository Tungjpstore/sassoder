import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const offlineQueueSource = readFileSync("features/attendance/hooks/use-offline-attendance-queue.ts", "utf8");
const staffWorkspaceSource = readFileSync("components/dashboard-v2/real/staff-workspace-v2.tsx", "utf8");
const settingsFormsSource = readFileSync("components/dashboard-v2/real/settings/section-forms.tsx", "utf8");
const billingPanelSource = readFileSync("components/dashboard-v2/real/settings/billing-panel.tsx", "utf8");
const timedWorkspaceSources = [
  "components/dashboard-v2/real/kitchen-workspace-v2.tsx",
  "components/dashboard-v2/real/online-workspace-v2.tsx",
  "components/dashboard-v2/real/orders-workspace-v2.tsx",
  "components/dashboard-v2/real/overview-workspace-v2.tsx",
  "components/dashboard-v2/real/reservations-workspace-v2.tsx"
].map((path) => readFileSync(path, "utf8"));
const staffMobileSource = readFileSync("features/staff/components/staff-mobile-redesign-workspace.tsx", "utf8");

test("staff hydration starts from server-stable time and browser state", () => {
  assert.match(offlineQueueSource, /queueState\.key === key \? queueState\.items : \[\]/);
  assert.match(offlineQueueSource, /onlineState\.key === key \? onlineState\.value : false/);
  assert.match(offlineQueueSource, /setQueueState\(\{ key, items: readQueue\(key\) \}\)/);
  assert.match(offlineQueueSource, /setOnlineState\(\{ key, value: navigator\.onLine \}\)/);
  assert.match(offlineQueueSource, /if \(!ready \|\| syncingRef\.current/);
  assert.match(offlineQueueSource, /const currentQueue = readQueue\(key\)/);
  assert.match(offlineQueueSource, /window\.addEventListener\("storage", handleStorage\)/);
  assert.match(offlineQueueSource, /useLayoutEffect\(\(\) => \{[\s\S]*activeKeyRef\.current = key/);
  assert.match(offlineQueueSource, /updateQueue\(\(currentQueue\) => currentQueue\.filter/);

  assert.match(staffWorkspaceSource, /new Date\(bundle\.generatedAt\)\.getTime\(\)/);
  assert.match(staffWorkspaceSource, /isStaffRecentlyActive\(m\.lastSeenAt, now\)/);
});

test("settings date output is stable across server and browser timezones", () => {
  assert.match(settingsFormsSource, /timeZone: "Asia\/Ho_Chi_Minh"/);
  assert.match(billingPanelSource, /timeZone: "Asia\/Ho_Chi_Minh"/);
  assert.doesNotMatch(billingPanelSource, /function periodProgress[\s\S]*?const now = Date\.now\(\)/);
});

test("operational timers hydrate from a server snapshot", () => {
  for (const source of timedWorkspaceSources) {
    assert.match(source, /useState\((?:props\.)?initialNowMs\)/);
    assert.doesNotMatch(source, /useState\(\(\) => Date\.now\(\)\)/);
  }
  assert.doesNotMatch(timedWorkspaceSources[0], /readCachedKitchenOrders\(\)/);
});

test("staff mobile dates use the serialized bundle time and Vietnam timezone", () => {
  assert.match(staffMobileSource, /todayInputValue\(nowMs\)/);
  assert.match(staffMobileSource, /timeZone: "Asia\/Ho_Chi_Minh"/);
  assert.doesNotMatch(staffMobileSource, /function todayInputValue\(\) \{/);
});
