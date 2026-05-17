import assert from "node:assert/strict";
import test from "node:test";
import {
  hasRemoteCustomerProfileValue,
  normalizeRemoteCustomerProfile,
  restoreRemoteCustomerProfileSnapshot,
  serializeRemoteCustomerProfile
} from "./remote-customer-profile";

test("remote customer profile normalizes text and coordinates", () => {
  assert.deepEqual(
    normalizeRemoteCustomerProfile({
      customerName: "  Lan  ",
      customerPhone: " 0901234567 ",
      deliveryAddress: "  12 Nguyễn Trãi  ",
      deliveryLat: 10.77,
      deliveryLng: 106.7
    }),
    {
      customerName: "Lan",
      customerPhone: "0901234567",
      deliveryAddress: "12 Nguyễn Trãi",
      deliveryLat: 10.77,
      deliveryLng: 106.7
    }
  );
});

test("remote customer profile drops invalid persisted coordinates", () => {
  const snapshot = JSON.stringify({
    version: 1,
    customerName: "Minh",
    customerPhone: "090",
    deliveryAddress: "Quận 1",
    deliveryLat: 200,
    deliveryLng: "not-a-number"
  });

  assert.deepEqual(restoreRemoteCustomerProfileSnapshot(snapshot), {
    customerName: "Minh",
    customerPhone: "090",
    deliveryAddress: "Quận 1",
    deliveryLat: undefined,
    deliveryLng: undefined
  });
});

test("remote customer profile serializes only useful profile values", () => {
  const empty = normalizeRemoteCustomerProfile({});
  const filled = serializeRemoteCustomerProfile({
    customerName: "Lan",
    customerPhone: "",
    deliveryAddress: ""
  });

  assert.equal(hasRemoteCustomerProfileValue(empty), false);
  assert.equal(hasRemoteCustomerProfileValue(filled), true);
  assert.equal(filled.version, 1);
});
