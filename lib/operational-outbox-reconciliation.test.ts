import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("services/operational-event-bus.ts", "utf8");

test("duplicate pending outbox events reconcile to the richer application payload", () => {
  const duplicateBranch = source.slice(source.indexOf('if (inserted.error?.code === "23505")'));

  assert.match(duplicateBranch, /\.update\(\{[\s\S]*payload:\s*event/);
  assert.match(duplicateBranch, /status:\s*"pending"/);
  assert.match(duplicateBranch, /\.in\("status",\s*\["pending",\s*"failed"\]\)/);
  assert.match(duplicateBranch, /\.eq\("tenant_id",\s*tenantId\)/);
  assert.match(duplicateBranch, /\.eq\("event_id",\s*event\.eventId\)/);
});
