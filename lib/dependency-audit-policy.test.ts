import { strict as assert } from "node:assert";
import test from "node:test";

import { evaluateNpmAuditReport } from "../scripts/infra/dependency-audit-policy.mjs";

test("dependency audit passes when no critical or high advisories remain", () => {
  const result = evaluateNpmAuditReport({
    metadata: { vulnerabilities: { critical: 0, high: 0, moderate: 2, low: 1, info: 0, total: 3 } },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "pass");
  assert.match(result.summary, /no critical\/high/i);
});

test("dependency audit blocks critical/high advisories", () => {
  const result = evaluateNpmAuditReport({
    metadata: { vulnerabilities: { critical: 1, high: 4, moderate: 0, low: 0, info: 0, total: 5 } },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "block");
  assert.deepEqual(result.counts, { critical: 1, high: 4, moderate: 0, low: 0, info: 0, total: 5 });
});

test("dependency audit blocks malformed output instead of failing open", () => {
  const result = evaluateNpmAuditReport({ metadata: {} });

  assert.equal(result.ok, false);
  assert.equal(result.status, "block");
  assert.equal(result.counts, null);
});

test("dependency audit blocks negative or non-numeric counts", () => {
  const result = evaluateNpmAuditReport({
    metadata: { vulnerabilities: { critical: "not-a-number", high: -1, total: 0 } },
  });

  assert.equal(result.ok, false);
  assert.match(result.summary, /invalid/i);
});
