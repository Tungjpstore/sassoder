import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("application publishers never overwrite a worker-owned outbox lease", () => {
  const source = readFileSync("services/operational-event-bus.ts", "utf8");
  const published = source.slice(source.indexOf("async function markOperationalOutboxPublished"), source.indexOf("async function markOperationalOutboxFailed"));
  const failed = source.slice(source.indexOf("async function markOperationalOutboxFailed"), source.indexOf("function eventPriority"));

  assert.match(published, /\.in\("status",\s*\["pending",\s*"failed"\]\)/);
  assert.match(failed, /\.in\("status",\s*\["pending",\s*"failed"\]\)/);
  assert.doesNotMatch(published, /\.neq\("status",\s*"published"\)/);
  assert.doesNotMatch(failed, /\.neq\("status",\s*"published"\)/);
});

test("relay completion is fenced by worker name and claim attempt", () => {
  const source = readFileSync("infra/vps/services/workers/outbox-relay-worker.mts", "utf8");

  assert.match(source, /locked_by:\s*string/);
  assert.match(source, /locked_by:\s*String\(row\.locked_by\)/);
  assert.match(source, /\.eq\("status",\s*"processing"\)/);
  assert.match(source, /\.eq\("locked_by",\s*row\.locked_by\)/);
  assert.match(source, /\.eq\("attempts",\s*row\.attempts\)/);
  assert.match(source, /OUTBOX_LEASE_LOST/);
});
