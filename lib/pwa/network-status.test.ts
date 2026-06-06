import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePwaConnectivity } from "./network-status";

test("resolvePwaConnectivity does not show offline when same-origin health is reachable", () => {
  assert.equal(resolvePwaConnectivity({ browserOnline: false, sameOriginReachable: true }), "online");
});

test("resolvePwaConnectivity only confirms offline after the browser flag and same-origin probe fail", () => {
  assert.equal(resolvePwaConnectivity({ browserOnline: false, sameOriginReachable: false }), "offline");
  assert.equal(resolvePwaConnectivity({ browserOnline: false, sameOriginReachable: null }), "unknown");
});

test("resolvePwaConnectivity treats a positive browser signal as online", () => {
  assert.equal(resolvePwaConnectivity({ browserOnline: true, sameOriginReachable: false }), "online");
});
