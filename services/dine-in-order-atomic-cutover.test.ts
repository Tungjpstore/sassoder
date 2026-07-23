import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const orderServiceSource = readFileSync("services/order-service.ts", "utf8");
const migrationSource = readFileSync("supabase/migrations/20260722110000_phase1_transactional_order_payment.sql", "utf8");

function functionBlock(name: string, nextName: string) {
  const start = orderServiceSource.indexOf(`export async function ${name}`);
  const end = orderServiceSource.indexOf(`export async function ${nextName}`, start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return orderServiceSource.slice(start, end);
}

test("DINE_IN order creation uses the same atomic RPC as remote ordering", () => {
  const body = functionBlock("createOrder", "createRemoteOrder");
  assert.match(body, /await createOnlineOrderAtomic\(supabase, \{/);
  assert.match(body, /fulfillment_type: "DINE_IN"/);
  assert.match(body, /table_id: table\.id/);
  assert.match(body, /bill_id: null/);
  assert.doesNotMatch(body, /getOrCreateOpenTableBill|insertOrderWithBranchFallback|insertOrderItemsWithModifierFallback/);
});

test("the transactional DINE_IN path locks the table and creates or reuses an open bill", () => {
  const start = migrationSource.indexOf("create or replace function public.create_online_order_atomic");
  const end = migrationSource.indexOf("create or replace function public.checkout_bill_atomic", start);
  const body = migrationSource.slice(start, end);

  assert.match(body, /from public\.tables tables[\s\S]*for update/i);
  assert.match(body, /TABLE_BILL_AWAITING_PAYMENT/);
  assert.match(body, /from public\.table_bills bills[\s\S]*status = 'open'[\s\S]*for update/i);
  assert.match(body, /insert into public\.table_bills/);
  assert.match(body, /v_bill_id := v_bill\.id/);
});
