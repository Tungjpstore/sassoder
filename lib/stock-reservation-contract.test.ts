import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildStockReservationPlan } from "./stock-reservation-contract";

const migrationSql = readFileSync("supabase/migrations/20260723200000_phase2_stock_reservation.sql", "utf8");

test("FEFO reservation plan never crosses the requested branch", () => {
  const plan = buildStockReservationPlan({
    branchId: "branch-a",
    demands: [{ ingredientId: "ingredient-1", quantity: 5 }],
    stock: [
      {
        ingredientId: "ingredient-1",
        branchId: "branch-b",
        locationId: "location-b",
        batchId: "batch-b",
        availableQuantity: 100,
        expirationDate: "2026-07-24",
        receivedAt: "2026-07-20"
      },
      {
        ingredientId: "ingredient-1",
        branchId: "branch-a",
        locationId: "location-a",
        batchId: "batch-a",
        availableQuantity: 5,
        expirationDate: "2026-07-30",
        receivedAt: "2026-07-20"
      }
    ],
    now: new Date("2026-07-23T00:00:00.000Z")
  });

  assert.deepEqual(plan.shortages, []);
  assert.deepEqual(plan.allocations.map((row) => row.branchId), ["branch-a"]);
  assert.equal(plan.allocatedQuantity, 5);
});

test("FEFO reservation plan consumes earliest valid batch and reports shortage", () => {
  const plan = buildStockReservationPlan({
    branchId: "branch-a",
    demands: [{ ingredientId: "ingredient-1", quantity: 8 }],
    stock: [
      {
        ingredientId: "ingredient-1",
        branchId: "branch-a",
        locationId: "location-a",
        batchId: "expired",
        availableQuantity: 20,
        expirationDate: "2026-07-22",
        receivedAt: "2026-07-01"
      },
      {
        ingredientId: "ingredient-1",
        branchId: "branch-a",
        locationId: "location-a",
        batchId: "batch-a",
        availableQuantity: 3,
        expirationDate: "2026-07-24",
        receivedAt: "2026-07-20"
      },
      {
        ingredientId: "ingredient-1",
        branchId: "branch-a",
        locationId: "location-a",
        batchId: "batch-b",
        availableQuantity: 2,
        expirationDate: "2026-07-25",
        receivedAt: "2026-07-20"
      }
    ],
    now: new Date("2026-07-23T00:00:00.000Z")
  });

  assert.deepEqual(plan.allocations.map((row) => [row.batchId, row.quantity]), [
    ["batch-a", 3],
    ["batch-b", 2]
  ]);
  assert.equal(plan.allocatedQuantity, 5);
  assert.deepEqual(plan.shortages, [{ ingredientId: "ingredient-1", requestedQuantity: 8, availableQuantity: 5, shortageQuantity: 3 }]);
});

test("stock reservation migration defines tenant-safe, idempotent reserve/consume/release RPCs", () => {
  assert.match(migrationSql, /create table if not exists public\.order_stock_reservations/i);
  assert.match(migrationSql, /restaurant_id uuid not null/i);
  assert.match(migrationSql, /idempotency_key text not null/i);
  assert.match(migrationSql, /foreign key \(restaurant_id, branch_id\)[\s\S]*references public\.store_branches \(restaurant_id, id\)/i);
  assert.match(migrationSql, /foreign key \(restaurant_id, location_id\)[\s\S]*references public\.inventory_locations \(restaurant_id, id\)/i);
  assert.match(migrationSql, /foreign key \(restaurant_id, ingredient_id\)[\s\S]*references public\.ingredients \(restaurant_id, id\)/i);
  assert.match(migrationSql, /foreign key \(restaurant_id, batch_id, ingredient_id\)[\s\S]*references public\.inventory_batches \(restaurant_id, id, ingredient_id\)/i);
  assert.match(migrationSql, /foreign key \(restaurant_id, actor_user_id\)[\s\S]*references public\.users \(restaurant_id, id\)/i);
  assert.match(migrationSql, /create or replace function public\.reserve_order_stock/i);
  assert.match(migrationSql, /create or replace function public\.consume_order_stock/i);
  assert.match(migrationSql, /create or replace function public\.release_order_stock/i);
  assert.match(migrationSql, /for update/i);
  assert.match(migrationSql, /order by[\s\S]*expiration_date[\s\S]*received_at/i);
  assert.match(migrationSql, /on conflict[\s\S]*idempotency_key/i);
  assert.match(migrationSql, /alter table public\.order_stock_reservations enable row level security/i);
  assert.match(migrationSql, /create constraint trigger orders_sync_stock_reservation_on_insert/i);
  assert.match(migrationSql, /deferrable initially deferred/i);
  assert.match(migrationSql, /new\.payment_status\s*=\s*'paid'[\s\S]*consume_order_stock/i);
  assert.match(migrationSql, /new\.status\s*=\s*'cancelled'[\s\S]*release_order_stock/i);
  assert.match(migrationSql, /payment_status is distinct from 'paid'/i);
});

test("stock reservation release also covers QR orders that failed payment before cancellation", () => {
  const cancellationBranch = migrationSql.match(
    /elsif tg_op = 'UPDATE'\s+and new\.payment_method = 'QR'\s+and old\.status\s+is distinct from\s+'cancelled'[\s\S]*?perform public\.release_order_stock\([\s\S]*?end if;/i
  )?.[0];

  assert.ok(cancellationBranch, "expected an order cancellation release branch");
  assert.doesNotMatch(cancellationBranch, /new\.payment_status\s*=\s*'waiting_payment'/i);
});

test("payment trigger consumes only orders that have a reserved stock row", () => {
  const paymentBranch = migrationSql.match(
    /elsif tg_op = 'UPDATE'[\s\S]*?new\.payment_status\s*=\s*'paid'[\s\S]*?perform public\.consume_order_stock\([\s\S]*?end if;/i
  )?.[0];

  assert.ok(paymentBranch, "expected a payment consumption branch");
  assert.match(paymentBranch, /exists\s*\([\s\S]*?order_stock_reservations[\s\S]*?status\s*=\s*'reserved'/i);
});

test("dine-in QR checkout reserves stock when an existing order enters waiting_payment", () => {
  const waitingPaymentBranch = migrationSql.match(
    /elsif tg_op = 'UPDATE'[\s\S]*?new\.payment_status\s*=\s*'waiting_payment'[\s\S]*?perform public\.reserve_order_stock\([\s\S]*?end if;/i
  )?.[0];

  assert.ok(waitingPaymentBranch, "expected a deferred reservation branch for dine-in QR checkout");
  assert.match(waitingPaymentBranch, /old\.payment_status\s+is distinct from\s+'waiting_payment'/i);
  assert.match(waitingPaymentBranch, /reserve_order_stock/i);
});

test("FEFO allocation does not apply FOR UPDATE to the nullable side of the batch outer join", () => {
  assert.doesNotMatch(
    migrationSql,
    /left\s+join\s+public\.inventory_batches\s+ib[\s\S]*?for\s+update\s+of\s+sb/i
  );
});

test("service wrapper calls only the atomic reservation RPCs and preserves idempotency input", () => {
  const source = readFileSync("services/stock-reservation-service.ts", "utf8");
  assert.match(source, /reserve_order_stock/);
  assert.match(source, /consume_order_stock/);
  assert.match(source, /release_order_stock/);
  assert.match(source, /target_idempotency_key/);
  assert.doesNotMatch(source, /from\(["']order_stock_reservations["']\)\.insert/);
});
