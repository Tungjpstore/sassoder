import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  evaluateReleaseQaSignoff,
  releasePreflightExitCode,
} from "../scripts/infra/release-readiness-policy.mjs";

const branch = "release/2026-07-22";
const commit = "0123456789abcdef0123456789abcdef01234567";
const now = new Date("2026-07-22T12:00:00Z");

function signoff(overrides: Partial<{
  date: string;
  status: string;
  branch: string;
  commit: string;
  migrationCount: string;
  flowStatus: string;
  evidence: string;
}> = {}) {
  const values = {
    date: "2026-07-20",
    status: "Approved",
    branch,
    commit,
    migrationCount: "42",
    flowStatus: "Pass",
    evidence: "Fresh authenticated QA evidence",
    ...overrides,
  };

  return `# Release QA Sign-Off\n\nDate: ${values.date}\nStatus: ${values.status}\nBranch: ${values.branch}\nCommit: ${values.commit}\nMigration count: ${values.migrationCount}\n\n| Flow | Status | Evidence |\n| --- | --- | --- |\n| Login | ${values.flowStatus} | ${values.evidence} |\n`;
}

function evaluate(text: string, options: Partial<Parameters<typeof evaluateReleaseQaSignoff>[0]> = {}) {
  return evaluateReleaseQaSignoff({
    text,
    currentBranch: branch,
    currentCommit: commit,
    currentMigrationCount: 42,
    now,
    maxAgeDays: 14,
    ...options,
  });
}

test("valid fresh approved signoff passes", () => {
  const result = evaluate(signoff());

  assert.equal(result.ok, true);
  assert.deepEqual(result.blockers, []);
});

test("waived status or evidence blocks release", () => {
  const result = evaluate(signoff({ status: "Waived", evidence: "Waived by release commander" }));

  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((blocker) => blocker.code === "forbidden-marker"));
  assert.ok(result.blockers.every((blocker) => !blocker.message.includes("undefined")));
});

test("stale signoff date blocks release", () => {
  const result = evaluate(signoff({ date: "2026-06-01" }));

  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((blocker) => blocker.code === "stale-evidence"));
});

test("branch mismatch blocks release", () => {
  const result = evaluate(signoff({ branch: "release/old" }));

  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((blocker) => blocker.code === "branch-mismatch"));
});

test("commit mismatch blocks release", () => {
  const result = evaluate(signoff({ commit: "fedcba9876543210fedcba9876543210fedcba98" }));

  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((blocker) => blocker.code === "commit-mismatch"));
});

test("missing or mismatched migration count blocks release", () => {
  const missing = evaluate(signoff({ migrationCount: "" }));
  const mismatched = evaluate(signoff({ migrationCount: "41" }));

  assert.ok(missing.blockers.some((blocker) => blocker.code === "migration-count-missing"));
  assert.ok(mismatched.blockers.some((blocker) => blocker.code === "migration-count-mismatch"));
});

test("current repository signoff is blocked", () => {
  const text = readFileSync(join(process.cwd(), "RELEASE_QA_SIGNOFF.md"), "utf8");
  const result = evaluate(text);

  assert.equal(result.ok, false);
  assert.ok(result.blockers.length >= 3);
  assert.ok(result.blockers.some((blocker) => blocker.code === "forbidden-marker"));
});

test("default preflight exits non-zero for blockers while report-only exits zero", () => {
  assert.equal(releasePreflightExitCode({ hasBlockers: true }), 1);
  assert.equal(releasePreflightExitCode({ hasBlockers: true, reportOnly: true }), 0);
  assert.equal(releasePreflightExitCode({ hasBlockers: false }), 0);
});
