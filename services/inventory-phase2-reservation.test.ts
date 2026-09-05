import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260903100000_phase2_inventory_reservation_ledger.sql", "utf8");
const scopeFixMigration = readFileSync("supabase/migrations/20260903103000_phase2_inventory_reservation_scope_fix.sql", "utf8");
const consistencyFixMigration = readFileSync("supabase/migrations/20260903110000_phase2_prepaid_consistency_fix.sql", "utf8");
const inventoryService = readFileSync("services/inventory-service.ts", "utf8");
const orderService = readFileSync("services/order-service.ts", "utf8");

test("Phase 2 inventory reservation ledger is idempotent and service-role-only", () => {
  assert.match(migration, /create table if not exists public\.inventory_reservations/i);
  assert.match(migration, /constraint inventory_reservations_unique_allocation unique/i);
  assert.match(migration, /create or replace function public\.reserve_order_inventory/i);
  assert.match(migration, /create or replace function public\.consume_order_inventory/i);
  assert.match(migration, /create or replace function public\.release_order_inventory/i);
  assert.match(migration, /create or replace function public\.cancel_order_with_inventory_reservation_rollback/i);
  assert.match(migration, /on conflict do nothing/i);
  assert.match(migration, /grant execute on function public\.reserve_order_inventory[\s\S]*to service_role/i);
  assert.match(migration, /grant execute on function public\.consume_order_inventory[\s\S]*to service_role/i);
  assert.match(migration, /grant execute on function public\.release_order_inventory[\s\S]*to service_role/i);
  assert.match(migration, /grant execute on function public\.cancel_order_with_inventory_reservation_rollback[\s\S]*to service_role/i);
});

test("Phase 2 allocation is branch-aware and prepaid orders reserve before payment flow", () => {
  assert.match(inventoryService, /select\("branch_id"\)[\s\S]*eq\("id", orderId\)[\s\S]*eq\("restaurant_id", restaurantId\)/i);
  assert.match(inventoryService, /stockQuery\.eq\("branch_id", orderResult\.data\.branch_id\)/i);
  assert.match(inventoryService, /stockQuery\.is\("branch_id", null\)/i);
  assert.match(inventoryService, /reserve_order_inventory/i);
  assert.match(inventoryService, /accept_order_with_reserved_inventory/i);
  assert.match(inventoryService, /release_order_inventory/i);
  assert.match(orderService, /if \(requiresPrepaidQr\) \{[\s\S]*reserveInventoryForPrepaidOrder/i);
  assert.match(inventoryService, /cancel_order_with_inventory_reservation_rollback/i);
});

test("Phase 2 reservation rows enforce order tenant and branch scope", () => {
  assert.match(scopeFixMigration, /order_record\.restaurant_id is distinct from new\.restaurant_id/i);
  assert.match(scopeFixMigration, /order_record\.branch_id is distinct from new\.branch_id/i);
  assert.match(scopeFixMigration, /inventory_reservations_scope_guard/i);
  assert.match(scopeFixMigration, /revoke all privileges on table public\.inventory_reservations from service_role/i);
  assert.match(scopeFixMigration, /grant select on table public\.inventory_reservations to service_role/i);
});

test("Phase 2 retries do not double-reserve and consume keeps aggregate stock in sync", () => {
  assert.match(consistencyFixMigration, /Replays return the original allocation set/i);
  assert.match(consistencyFixMigration, /status in \('reserved', 'consumed'\)/i);
  assert.match(consistencyFixMigration, /update public\.ingredients[\s\S]*on_hand_quantity = on_hand_quantity - reservation_record\.quantity/i);
  assert.match(inventoryService, /const reservedResult = await db[\s\S]*buildOrderInventoryAllocationPlan/i);
});
