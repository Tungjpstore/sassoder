import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import {
  buildFinancialStageIdempotencyKey,
  checkoutBillAtomic,
  createOnlineOrderAtomic,
  fingerprintFinancialRequest,
  mapFinancialRpcError,
  transitionPaymentAtomic
} from "./phase1-financial-rpc-service";

test("financial request fingerprints are canonical 64-character SHA-256 hex", () => {
  const left = fingerprintFinancialRequest({ order: { total: 120000, id: "order-1" }, items: [1, 2] });
  const right = fingerprintFinancialRequest({ items: [1, 2], order: { id: "order-1", total: 120000 } });

  assert.equal(left, right);
  assert.match(left, /^[0-9a-f]{64}$/);
  assert.notEqual(left, fingerprintFinancialRequest({ items: [1, 3], order: { id: "order-1", total: 120000 } }));
});

test("createOnlineOrderAtomic sends a tenant-scoped canonical RPC request", async () => {
  const calls: Array<{ name: string; args: unknown }> = [];
  const client = {
    async rpc(name: string, args: unknown) {
      calls.push({ name, args });
      return { data: { order: { id: "order-1" }, idempotentReplay: false }, error: null };
    }
  } as unknown as SupabaseClient<Database>;

  const result = await createOnlineOrderAtomic(client, {
    restaurantId: "restaurant-1",
    idempotencyKey: "12345678-1234-4123-8123-123456789012",
    order: { total: 120000 },
    items: [{ menu_item_id: "item-1", quantity: 2, price: 60000 }],
    actorUserId: null
  });

  assert.deepEqual(result, { order: { id: "order-1" }, idempotentReplay: false });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.name, "create_online_order_atomic");
  const args = calls[0]?.args as Record<string, unknown>;
  assert.equal(args.p_restaurant_id, "restaurant-1");
  assert.equal(args.p_idempotency_key, "12345678-1234-4123-8123-123456789012");
  assert.match(String(args.p_request_fingerprint), /^[0-9a-f]{64}$/);
});

test("financial RPC errors map conflicts and validation failures without fallback", () => {
  const conflict = mapFinancialRpcError({ code: "40001", message: "STATE_VERSION_CONFLICT" }, "Không thể cập nhật");
  const mismatch = mapFinancialRpcError({ code: "P0001", message: "IDEMPOTENCY_FINGERPRINT_MISMATCH" }, "Không thể cập nhật");
  const validation = mapFinancialRpcError({ code: "22023", message: "ORDER_TOTAL_MISMATCH" }, "Không thể cập nhật");
  const missingRpc = mapFinancialRpcError({ code: "PGRST202", message: "Could not find the function" }, "Không thể cập nhật");

  assert.equal(conflict.status, 409);
  assert.equal(mismatch.status, 409);
  assert.equal(validation.status, 400);
  assert.equal(missingRpc.status, 503);
  assert.equal(mapFinancialRpcError({ code: "40P01", message: "deadlock detected" }, "Không thể cập nhật").status, 409);
});

test("prepaid stock reservation failures map to a retryable inventory conflict", () => {
  const shortage = mapFinancialRpcError(
    { code: "P0001", message: "STOCK_RESERVATION_SHORTAGE:ingredient-1:2.000" },
    "Không tạo được đơn hàng."
  );

  assert.equal(shortage.status, 409);
  assert.equal((shortage as Error & { code?: string }).code, "STOCK_RESERVATION_CONFLICT");
});


test("financial stage idempotency keys are deterministic and include state versions", () => {
  const first = buildFinancialStageIdempotencyKey({
    stage: "customer-checkout",
    entityId: "order-1",
    orderStateVersion: 4,
    billStateVersion: 2
  });
  const replay = buildFinancialStageIdempotencyKey({
    stage: "customer-checkout",
    entityId: "order-1",
    orderStateVersion: 4,
    billStateVersion: 2
  });

  assert.equal(first, replay);
  assert.equal(first, "phase1:customer-checkout:order-1:o4:b2");
  assert.notEqual(
    first,
    buildFinancialStageIdempotencyKey({
      stage: "customer-checkout",
      entityId: "order-1",
      orderStateVersion: 5,
      billStateVersion: 2
    })
  );
});

test("checkout and payment transition wrappers forward state-version and idempotency inputs", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return { data: { idempotentReplay: false }, error: null };
    }
  } as unknown as SupabaseClient<Database>;

  await checkoutBillAtomic(client, {
    restaurantId: "restaurant-1",
    billId: "bill-1",
    expectedStateVersion: 3,
    idempotencyKey: "phase1:bill-checkout:bill-1:o4:b3",
    paymentMethod: "QR",
    actorUserId: null
  });
  await transitionPaymentAtomic(client, {
    restaurantId: "restaurant-1",
    orderId: "order-1",
    billId: "bill-1",
    expectedOrderStateVersion: 4,
    expectedBillStateVersion: 3,
    toStatus: "waiting_confirm",
    nextOrderStatus: "ordering",
    paymentMethod: "QR",
    amount: 120000,
    idempotencyKey: "phase1:customer-paid:order-1:o4:b3",
    actorUserId: null
  });

  assert.deepEqual(calls.map((call) => call.name), ["checkout_bill_atomic", "transition_payment_atomic"]);
  assert.equal(calls[0]?.args.p_expected_state_version, 3);
  assert.equal(calls[0]?.args.p_idempotency_key, "phase1:bill-checkout:bill-1:o4:b3");
  assert.equal(calls[1]?.args.p_expected_order_state_version, 4);
  assert.equal(calls[1]?.args.p_expected_bill_state_version, 3);
  assert.equal(calls[1]?.args.p_to_status, "waiting_confirm");
  assert.equal(calls[1]?.args.p_next_order_status, "ordering");
});
