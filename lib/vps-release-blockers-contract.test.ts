import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("domain workers fail closed until durable domain adapters are wired", () => {
  for (const file of [
    "infra/vps/services/workers/order-worker.mts",
    "infra/vps/services/workers/payment-worker.mts",
    "infra/vps/services/workers/reservation-worker.mts",
    "infra/vps/services/workers/inventory-worker.mts",
    "infra/vps/services/workers/staff-worker.mts"
  ]) {
    const source = read(file);
    assert.match(source, /adapter_not_configured/, file);
    assert.doesNotMatch(source, /processed:\s*true/, file);
  }
});

test("worker timeout aborts cooperative downstream IO", () => {
  const source = read("infra/vps/services/workers/shared.mts");
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /controller\.abort\(/);
  assert.match(source, /processor\(job, \{ signal \}\)/);
});

test("poison SQS messages are retained or durably quarantined before deletion", () => {
  const source = read("infra/vps/services/workers/sqs-operational-event-worker.mts");
  const client = read("infra/vps/services/shared/aws-sqs.mts");
  assert.match(source, /OPERATIONAL_EVENT_SQS_DLQ_URL/);
  assert.match(source, /sendSqsMessage\(/);
  assert.match(source, /leaving it for retry/);
  assert.match(client, /MessageGroupId = "operational-events"/);
  assert.match(client, /MessageDeduplicationId = sha256Hex\(body\)/);
});

test("restore tests cannot report a skipped/list-only verification as success", () => {
  const source = read("infra/vps/scripts/backup.sh");
  assert.match(source, /RESTORE_TEST_STATUS/);
  assert.match(source, /restore_test.*skipped/);
  assert.match(source, /VERIFY_STATUS="ok"/);
  assert.match(source, /VERIFY_STATUS="failed"/);
  assert.match(source, /CHECKSUM_STATUS="failed"/);
  assert.match(source, /R2 metadata signature mismatch/);
});

test("realtime clients refresh expiring VPS tokens and reconnect with the new claim", () => {
  for (const file of ["lib/realtime/vps-socket-client.ts", "lib/realtime/customer-order-socket-client.ts"]) {
    const source = read(file);
    assert.match(source, /expiresAt/);
    assert.match(source, /scheduleTokenRefresh/);
    assert.match(source, /socket\.auth = \{ token: refreshed\.token \}/);
    assert.match(source, /socket\.disconnect\(\);\s*socket\.connect\(\)/);
  }
});

test("Cloudflare backup gateway authenticates every route", () => {
  const source = read("infra/cloudflare/backup-r2-gateway/src/index.ts");
  const config = read("infra/cloudflare/backup-r2-gateway/wrangler.jsonc");
  assert.match(source, /if \(\!\(await isAuthorized\(request, env\)\)\) return unauthorized\(\);/);
  assert.match(source, /timingSafeEqual\(configuredToken, suppliedToken\)/);
  assert.doesNotMatch(source, /url\.pathname === "\/objects" && request\.method === "GET"[\s\S]{0,200}if \(\!\(await isAuthorized/);
  assert.match(source, /BACKUP_R2_ALLOWED_PREFIX/);
  assert.match(source, /object_scope_forbidden/);
  assert.match(source, /requestedPrefix\.startsWith\(scope\)/);
  assert.match(config, /BACKUP_R2_ALLOWED_PREFIX/);
});
