import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/20260722103000_financial_dml_hardening.sql";
const migrationSql = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const orderServiceSource = readFileSync("services/order-service.ts", "utf8");
const paymentServiceSource = readFileSync("services/payment-service.ts", "utf8");
const reservationServiceSource = readFileSync("services/reservation-service.ts", "utf8");

test("authenticated clients cannot mutate financial and reservation tables directly", () => {
  assert.match(migrationSql, /revoke insert, update, delete on table[\s\S]*public\.orders[\s\S]*public\.table_bills[\s\S]*public\.payment_logs[\s\S]*public\.reservations[\s\S]*from public, anon, authenticated/i);
  assert.match(migrationSql, /drop policy if exists "staff can update own restaurant orders" on public\.orders/i);
  assert.match(migrationSql, /drop policy if exists "staff can update own table bills" on public\.table_bills/i);
  assert.match(migrationSql, /drop policy if exists "staff can insert own payment logs" on public\.payment_logs/i);
  assert.match(migrationSql, /drop policy if exists "staff can update own reservations" on public\.reservations/i);
});

test("orders can only reference bills from the same restaurant", () => {
  assert.match(migrationSql, /orphan order-to-bill links/i);
  assert.match(migrationSql, /cross-tenant order-to-bill links/i);
  assert.match(migrationSql, /unique \(restaurant_id, id\)/i);
  assert.match(migrationSql, /foreign key \(restaurant_id, bill_id\)[\s\S]*references public\.table_bills \(restaurant_id, id\)/i);
  assert.match(migrationSql, /orders_restaurant_bill_id_idx/i);
});

test("bill recalculation locks and validates the tenant boundary", () => {
  assert.match(migrationSql, /create or replace function public\.recalculate_table_bill_total/i);
  assert.match(migrationSql, /set search_path = pg_catalog, public/i);
  assert.match(migrationSql, /for update/i);
  assert.match(migrationSql, /o\.restaurant_id is distinct from v_restaurant_id/i);
  assert.match(migrationSql, /o\.restaurant_id = v_restaurant_id/i);
  assert.match(migrationSql, /revoke all on function public\.recalculate_table_bill_total\(uuid\) from public, anon, authenticated/i);
  assert.match(migrationSql, /drop trigger if exists orders_sync_table_bill_total on public\.orders/i);
  assert.match(migrationSql, /create trigger orders_sync_table_bill_total/i);
});

test("intended mutation paths remain server-side", () => {
  assert.match(orderServiceSource, /createAdminSupabaseClient\(\)/);
  assert.match(paymentServiceSource, /createAdminSupabaseClient\(\)/);
  assert.match(reservationServiceSource, /createAdminSupabaseClient\(\)/);
  assert.match(migrationSql, /notify pgrst, 'reload schema'/i);
});
