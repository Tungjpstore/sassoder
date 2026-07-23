import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Vercel preflight links the explicit project before pulling environment", () => {
  const workflow = read(".github/workflows/vercel-preflight.yml");

  assert.match(workflow, /vercel link --yes --team \"\$VERCEL_ORG_ID\" --project \"\$VERCEL_PROJECT_ID\"/);
  assert.match(workflow, /vercel pull --yes --environment=/);
  assert.match(workflow, /path: \.vercel\/output/);
});

test("VPS deployment uses strict restore verification before declaring post-deploy success", () => {
  const workflow = read(".github/workflows/vps-deploy.yml");

  assert.match(workflow, /write_env BACKUP_RESTORE_TEST_STRICT true/);
  assert.match(workflow, /backup\.sh --restore-test/);
  assert.match(workflow, /production-readiness\.sh --local-only/);
});

test("release blockers include the high-severity dependency gate", () => {
  const script = read("scripts/infra/release-external-blockers.mjs");

  assert.match(script, /npm.*audit.*--audit-level=high.*--json/);
  assert.match(script, /dependencyReadiness\(\)/);
  assert.match(script, /evaluateNpmAuditReport/);
  assert.doesNotMatch(script, /^\s*"\.env\.local",?\s*$/m);
});
