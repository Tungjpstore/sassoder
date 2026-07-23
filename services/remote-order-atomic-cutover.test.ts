import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const orderServiceSource = readFileSync("services/order-service.ts", "utf8");

function functionBlock(name: string, nextName: string) {
  const start = orderServiceSource.indexOf(`export async function ${name}`);
  const end = orderServiceSource.indexOf(`export async function ${nextName}`, start);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must follow ${name}`);
  return orderServiceSource.slice(start, end);
}

test("remote order creation uses the tenant-scoped atomic financial RPC", () => {
  const body = functionBlock("createRemoteOrder", "getPublicOrder");

  assert.match(
    orderServiceSource,
    /import \{[^}]*createOnlineOrderAtomic[^}]*\} from "@\/services\/phase1-financial-rpc-service"/
  );
  assert.match(body, /await createOnlineOrderAtomic\(supabase, \{/);
  assert.match(body, /restaurantId: settings\.id/);
  assert.match(body, /idempotencyKey/);
  assert.match(body, /order: \{/);
  assert.match(body, /items: pricedItems\.map/);
});

test("remote atomic cutover has no direct order, item, prepaid-log, or compensating-delete writes", () => {
  const body = functionBlock("createRemoteOrder", "getPublicOrder");

  assert.doesNotMatch(body, /insertOrderWithBranchFallback/);
  assert.doesNotMatch(body, /insertOrderItemsWithModifierFallback/);
  assert.doesNotMatch(body, /assertPromotionUsageAfterInsert/);
  assert.doesNotMatch(body, /ensurePaymentLogEvent/);
  assert.doesNotMatch(body, /\.from\("orders"\)\.delete\(\)/);
});

test("remote atomic cutover validates the explicit request idempotency key and RPC response", () => {
  const body = functionBlock("createRemoteOrder", "getPublicOrder");

  assert.match(body, /const idempotencyKey = input\.idempotencyKey\?\.trim\(\)/);
  assert.match(body, /if \(!idempotencyKey\)/);
  assert.match(body, /atomicResult\.order/);
  assert.match(body, /INVALID_FINANCIAL_RPC_RESPONSE/);
  assert.match(body, /atomicResult\.idempotentReplay === true/);
});

test("remote atomic payload stores only the server-resolved delivery destination", () => {
  const body = functionBlock("createRemoteOrder", "getPublicOrder");

  assert.match(body, /const canonicalDeliveryAddress = deliveryQuote\?\.addressQualitySnapshot\?\.normalizedAddress \?\? null/);
  assert.match(body, /delivery_address: .*canonicalDeliveryAddress/);
  assert.match(body, /delivery_lat: .*destination\?\.lat \?\? null/);
  assert.match(body, /delivery_lng: .*destination\?\.lng \?\? null/);
  assert.doesNotMatch(body, /deliveryLat \?\? destination\?\.lat/);
  assert.doesNotMatch(body, /deliveryLng \?\? destination\?\.lng/);
});

test("remote atomic replay does not duplicate customer notifications or realtime events", () => {
  const body = functionBlock("createRemoteOrder", "getPublicOrder");

  assert.match(body, /const isIdempotentReplay = atomicResult\.idempotentReplay === true/);
  assert.match(body, /if \(!isIdempotentReplay\) \{/);
  assert.match(body, /await enqueueTelegramNotification/);
  assert.match(body, /await broadcastVpsRealtime/);
});
