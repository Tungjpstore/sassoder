import assert from "node:assert/strict";
import { test } from "node:test";
import type { ActivationReadinessItem } from "./dashboard-activation-runway";
import { buildActivationRunway } from "./dashboard-activation-runway";

const baseItem = {
  group: "menu",
  status: "missing" as const,
  priority: "critical" as const,
  action: "Hoàn tất mục này.",
  route: "/dashboard/menu",
  weight: 10
};

function readiness(score: number, nextActions: ActivationReadinessItem[] = [], criticalMissing: ActivationReadinessItem[] = []) {
  return {
    score,
    completedCount: Math.round(score / 10),
    totalCount: 10,
    items: [],
    nextActions,
    criticalMissing
  };
}

test("buildActivationRunway prioritizes critical launch tasks", () => {
  const menuTask = { ...baseItem, key: "menu-items", label: "Menu có món thật" };
  const tablesTask = { ...baseItem, key: "tables", label: "Bàn và QR", route: "/dashboard/tables" };
  const runway = buildActivationRunway(readiness(34, [menuTask, tablesTask], [menuTask, tablesTask]));

  assert.equal(runway.stage, "launch");
  assert.equal(runway.primaryAction.key, "menu-items");
  assert.equal(runway.primaryAction.badge, "Bắt buộc");
  assert.match(runway.riskLabel, /2/);
});

test("buildActivationRunway moves healthy stores toward scale actions", () => {
  const runway = buildActivationRunway(readiness(96));

  assert.equal(runway.stage, "scale");
  assert.equal(runway.primaryAction.key, "open-orders");
  assert.equal(runway.futureActions.map((task) => task.key).join(","), "invite-staff,multi-branch");
  assert.ok(runway.visibleTasks.some((task) => task.status === "future"));
});

test("buildActivationRunway uses configure stage when critical setup remains", () => {
  const paymentTask = { ...baseItem, key: "payments-vietqr", label: "Ngân hàng VietQR", route: "/dashboard/settings?section=payments" };
  const runway = buildActivationRunway(readiness(72, [paymentTask], [paymentTask]));

  assert.equal(runway.stage, "configure");
  assert.equal(runway.primaryAction.route, "/dashboard/settings?section=payments");
  assert.equal(runway.secondaryActions.length, 0);
});

test("buildActivationRunway exposes first-shift launch steps from readiness items", () => {
  const done = { ...baseItem, status: "done" as const, priority: "critical" as const };
  const runway = buildActivationRunway({
    score: 92,
    completedCount: 3,
    totalCount: 3,
    criticalMissing: [],
    nextActions: [],
    items: [
      { ...done, key: "menu-items", label: "Menu có món thật" },
      { ...done, key: "tables", label: "Bàn và QR", route: "/dashboard/tables" },
      { ...done, key: "payments-vietqr", label: "Ngân hàng VietQR", route: "/dashboard/settings?section=payments" }
    ]
  });

  assert.equal(runway.launchReady, true);
  assert.deepEqual(runway.launchSteps.map((step) => step.key), ["qr-test", "order-receive", "payment-close"]);
  assert.ok(runway.launchSteps.every((step) => step.done));
});
