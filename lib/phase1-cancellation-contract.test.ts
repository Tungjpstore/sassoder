import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/20260723110000_phase1_canonical_cancellation.sql";
const migrationSql = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const orderServiceSource = readFileSync("services/order-service.ts", "utf8");
const financialServiceSource = readFileSync("services/phase1-financial-rpc-service.ts", "utf8");

function functionBody(name: string) {
  const match = migrationSql.match(
    new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\b([\\s\\S]*?)\\$\\$;`, "i"),
  );
  assert.ok(match, `missing ${name} RPC`);
  return match[0];
}

test("canonical cancellation locks bill before order and verifies attachment after the lock", () => {
  const body = functionBody("cancel_order_atomic");
  const billLock = body.search(/from\s+public\.table_bills\s+bills\s+where[^;]+for update/i);
  const orderLock = body.search(/from\s+public\.orders\s+orders\s+where[^;]+for update/i);
  assert.ok(billLock >= 0, "bill must be locked when the order is attached");
  assert.ok(orderLock > billLock, "bill lock must precede order lock");
  assert.match(body, /order_record\.bill_id\s+is\s+distinct\s+from\s+locked_bill_id/i);
  assert.match(body, /CANCELLATION_ATTACHMENT_CONFLICT/i);
});

test("canonical cancellation performs rollback, payment log, bill close, audit and outbox in one RPC", () => {
  const body = functionBody("cancel_order_atomic");
  assert.match(body, /perform\s+public\.cancel_order_with_inventory_rollback\s*\(/i);
  assert.match(body, /insert\s+into\s+public\.payment_logs[\s\S]*on\s+conflict\s*\(transition_key\)/i);
  assert.match(body, /on\s+conflict\s*\(transition_key\)[\s\S]*?do\s+nothing/i);
  assert.match(body, /update\s+public\.table_bills[\s\S]*status\s*=\s*'cancelled'/i);
  assert.match(body, /insert\s+into\s+public\.audit_logs/i);
  assert.match(body, /insert\s+into\s+public\.operational_event_outbox/i);
  assert.match(body, /order\.cancelled/i);
  assert.match(body, /on\s+conflict\s*\(restaurant_id,\s*event_id\)\s+do\s+update/i);
});

test("cancellation refuses prepared or completed orders instead of rolling stock back after fulfillment", () => {
  const body = functionBody("cancel_order_atomic");
  assert.match(body, /CANCELLATION_AFTER_PREPARATION_NOT_ALLOWED/i);
  assert.match(body, /prepared_at\s+is\s+not\s+null/i);
  assert.match(body, /order_record\.status::text\s*=\s*'completed'/i);
});

test("authenticated callers use the canonical cancellation RPC and not the legacy inventory RPC", () => {
  assert.match(financialServiceSource, /cancelOrderAtomic/);
  assert.match(orderServiceSource, /cancelOrderAtomic\(supabase,\s*\{\s*restaurantId/);
  assert.doesNotMatch(orderServiceSource, /cancelOrderWithInventoryRollback\(restaurantId/);
  assert.match(migrationSql, /revoke\s+all\s+on\s+function\s+public\.cancel_order_with_inventory_rollback/i);
  assert.match(migrationSql, /grant\s+execute\s+on\s+function\s+public\.cancel_order_atomic/i);
});

test("forward migration tolerates bootstrap environments where the legacy inventory RPC is absent", () => {
  assert.match(migrationSql, /to_regprocedure\('public\.cancel_order_with_inventory_rollback\(uuid,uuid,uuid\)'\)/i);
  assert.match(migrationSql, /execute\s+'revoke all on function public\.cancel_order_with_inventory_rollback/i);
});
