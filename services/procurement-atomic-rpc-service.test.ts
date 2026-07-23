import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const servicePath = "services/procurement-atomic-rpc-service.ts";

test("procurement wrappers fingerprint requests and fail closed without the RPC", async () => {
  assert.ok(existsSync(servicePath), "missing procurement atomic RPC wrapper");

  const {
    applyInventoryCountAtomic,
    createBranchTransferAtomic,
    fingerprintInventoryRequest,
    processBranchTransferAtomic,
    receivePurchaseOrderAtomic
  } = await import("./procurement-atomic-rpc-service");

  const left = fingerprintInventoryRequest({ operation: "receive", lines: [{ quantity: 2, id: "line-1" }] });
  const right = fingerprintInventoryRequest({ lines: [{ id: "line-1", quantity: 2 }], operation: "receive" });
  assert.equal(left, right);
  assert.match(left, /^[0-9a-f]{64}$/);

  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return { data: { idempotentReplay: false }, error: null };
    }
  };

  await receivePurchaseOrderAtomic(client, {
    restaurantId: "restaurant-1",
    purchaseOrderId: "po-1",
    actorUserId: "user-1",
    idempotencyKey: "inventory:po-receive:12345678",
    receivedAt: "2026-07-23T08:00:00.000Z",
    lines: [{ purchaseOrderLineId: "line-1", receivedQuantity: 2 }]
  });
  await applyInventoryCountAtomic(client, {
    restaurantId: "restaurant-1",
    actorUserId: "user-1",
    idempotencyKey: "inventory:count:12345678",
    title: "Close",
    locationId: "location-1",
    note: null,
    lines: [{ ingredientId: "ingredient-1", countedQuantity: 4 }]
  });
  await createBranchTransferAtomic(client, {
    restaurantId: "restaurant-1",
    actorUserId: "user-1",
    idempotencyKey: "inventory:transfer:12345678",
    fromLocationId: "location-1",
    toLocationId: "location-2",
    note: null,
    lines: [{ ingredientId: "ingredient-1", quantity: 1 }]
  });
  await processBranchTransferAtomic(client, {
    restaurantId: "restaurant-1",
    transferId: "transfer-1",
    action: "dispatch",
    actorUserId: "user-1",
    idempotencyKey: "inventory:transfer-dispatch:12345678",
    note: null,
    lines: null
  });

  assert.deepEqual(calls.map((call) => call.name), [
    "receive_purchase_order_atomic",
    "apply_inventory_count_atomic",
    "create_branch_transfer_atomic",
    "process_branch_transfer_atomic"
  ]);
  for (const call of calls) {
    assert.match(String(call.args.p_request_fingerprint), /^[0-9a-f]{64}$/);
    assert.match(String(call.args.p_idempotency_key), /^inventory:/);
  }

  const unavailableClient = {
    async rpc() {
      return { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
    }
  };
  await assert.rejects(
    () =>
      receivePurchaseOrderAtomic(unavailableClient, {
        restaurantId: "restaurant-1",
        purchaseOrderId: "po-1",
        actorUserId: "user-1",
        idempotencyKey: "inventory:po-receive:87654321",
        receivedAt: "2026-07-23T08:00:00.000Z",
        lines: []
      }),
    (error: unknown) => Number((error as { status?: number }).status) === 503
  );
});

test("inventory service and actions require explicit idempotency keys for atomic mutations", () => {
  const inventoryService = readFileSync("services/inventory-service.ts", "utf8");
  const inventoryActions = readFileSync("app/dashboard/actions/inventory.ts", "utf8");
  const inventoryWorkspace = readFileSync("components/dashboard/inventory-workspace-v2.tsx", "utf8");

  assert.match(inventoryService, /receivePurchaseOrderAtomic\(/);
  assert.match(inventoryService, /applyInventoryCountAtomic\(/);
  assert.match(inventoryService, /createBranchTransferAtomic\(/);
  assert.match(inventoryService, /processBranchTransferAtomic\(/);
  assert.doesNotMatch(inventoryService, /db\.rpc\("receive_purchase_order"/);
  assert.doesNotMatch(inventoryService, /db\.rpc\("apply_inventory_count"/);
  assert.doesNotMatch(inventoryService, /db\.rpc\("create_branch_transfer"/);
  assert.doesNotMatch(inventoryService, /db\.rpc\("process_branch_transfer"/);
  assert.match(inventoryActions, /formData\.get\("idempotencyKey"\)/);
  assert.match(inventoryWorkspace, /name="idempotencyKey"/);
});
