import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationSql = readFileSync("supabase/migrations/20260519100000_inventory_order_atomicity.sql", "utf8");
const orderServiceSource = readFileSync("services/order-service.ts", "utf8");

function literalPattern(text: string, flags = "i") {
  const escapedParts = text
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(escapedParts.join("\\s+"), flags);
}

test("order accept keeps inventory deduction and status update in one RPC", () => {
  assert.match(migrationSql, /create or replace function public\.accept_order_with_inventory_deduction/i);
  assert.match(migrationSql, literalPattern("from public.orders where id = target_order_id and restaurant_id = target_restaurant_id for update"));
  assert.match(migrationSql, /perform public\.apply_order_inventory_movement_atomic/i);
  assert.match(migrationSql, /partial order inventory sync detected/i);
  assert.match(orderServiceSource, /acceptOrderWithInventoryDeduction\(restaurantId/);
  assert.doesNotMatch(orderServiceSource, /await deductInventoryForOrder\(restaurantId, orderId/);
});

test("order cancellation rolls inventory back before the order is marked cancelled", () => {
  assert.match(migrationSql, /create or replace function public\.cancel_order_with_inventory_rollback/i);
  assert.match(migrationSql, /movement_type = 'deduct_sale'/i);
  assert.match(migrationSql, /movement_type = 'rollback'/i);
  assert.match(migrationSql, /partial order inventory rollback detected/i);
  assert.match(orderServiceSource, /cancelOrderWithInventoryRollback\(restaurantId/);
  assert.doesNotMatch(orderServiceSource, /inventory_order_rollback_failed/);
});
