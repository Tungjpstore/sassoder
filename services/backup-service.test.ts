import { strict as assert } from "node:assert";
import test from "node:test";
import { backupRpoRisk } from "@/lib/backup-health";

test("backupRpoRisk marks missing success as high risk", () => {
  assert.equal(backupRpoRisk({ ageHours: null, latestStatus: "missing" }), "high");
});

test("backupRpoRisk uses daily backup age thresholds", () => {
  assert.equal(backupRpoRisk({ ageHours: 4, latestStatus: "success" }), "low");
  assert.equal(backupRpoRisk({ ageHours: 30, latestStatus: "success" }), "medium");
  assert.equal(backupRpoRisk({ ageHours: 42, latestStatus: "success" }), "high");
});

test("backupRpoRisk escalates failed jobs and critical alerts", () => {
  assert.equal(backupRpoRisk({ ageHours: 2, latestStatus: "failed" }), "high");
  assert.equal(backupRpoRisk({ ageHours: 2, latestStatus: "success", openCriticalAlerts: 1 }), "high");
});
