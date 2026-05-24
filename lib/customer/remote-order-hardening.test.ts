import assert from "node:assert/strict";
import test from "node:test";
import { deliveryLocationSchema, deliveryQuoteSchema, remoteOrderSchema } from "@/lib/validators";

const validRemoteOrder = {
  restaurantSlug: "bun-bo-hue",
  customerSessionId: "11111111-1111-4111-8111-111111111111",
  idempotencyKey: "22222222-2222-4222-8222-222222222222",
  fulfillmentType: "DELIVERY",
  customerName: "Nguyen Van A",
  customerPhone: "0901234567",
  deliveryAddress: "12 Nguyen Trai, Quan 1",
  deliveryLat: 10.771,
  deliveryLng: 106.7,
  items: [
    {
      menuItemId: "item-1",
      quantity: 2,
      note: "it cay"
    }
  ]
};

test("remote order API requires customer session and idempotency UUIDs", () => {
  assert.equal(remoteOrderSchema.safeParse(validRemoteOrder).success, true);
  assert.equal(remoteOrderSchema.safeParse({ ...validRemoteOrder, customerSessionId: undefined }).success, false);
  assert.equal(remoteOrderSchema.safeParse({ ...validRemoteOrder, idempotencyKey: "manual-key" }).success, false);
});

test("remote order API keeps Vietnamese phone/address payload bounded", () => {
  assert.equal(remoteOrderSchema.safeParse({ ...validRemoteOrder, customerPhone: "abc" }).success, false);
  assert.equal(remoteOrderSchema.safeParse({ ...validRemoteOrder, deliveryAddress: "x".repeat(241) }).success, false);
  assert.equal(remoteOrderSchema.safeParse({ ...validRemoteOrder, items: [] }).success, false);
});

test("delivery coordinate validators do not coerce blank or null into zero", () => {
  const remoteOrderResult = remoteOrderSchema.safeParse({ ...validRemoteOrder, deliveryLat: "", deliveryLng: "" });
  assert.equal(remoteOrderResult.success, true);
  if (remoteOrderResult.success) {
    assert.equal(remoteOrderResult.data.deliveryLat, undefined);
    assert.equal(remoteOrderResult.data.deliveryLng, undefined);
  }

  const deliveryQuoteResult = deliveryQuoteSchema.safeParse({ restaurantSlug: "bun-bo-hue", subtotal: 100_000, deliveryLat: null, deliveryLng: null });
  assert.equal(deliveryQuoteResult.success, true);
  if (deliveryQuoteResult.success) {
    assert.equal(deliveryQuoteResult.data.deliveryLat, undefined);
    assert.equal(deliveryQuoteResult.data.deliveryLng, undefined);
  }

  assert.equal(deliveryLocationSchema.safeParse({ lat: "", lng: "" }).success, false);
  assert.equal(deliveryLocationSchema.safeParse({ lat: null, lng: null }).success, false);
  assert.equal(deliveryLocationSchema.safeParse({ lat: false, lng: true }).success, false);
});
