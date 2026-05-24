import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sources = {
  order: readFileSync("services/order-service.ts", "utf8"),
  payment: readFileSync("services/payment-service.ts", "utf8"),
  serviceRequest: readFileSync("services/service-request-service.ts", "utf8"),
  restaurant: readFileSync("services/restaurant-service.ts", "utf8"),
  aiRuntime: readFileSync("services/ai/runtime.ts", "utf8")
};

test("public order slug access checks tenant platform status", () => {
  assert.match(sources.order, /assertPublicTenantActive/);
  assert.match(sources.order, /select\("id,allow_legacy_qr,platform_status,deleted_at"\)/);
  assert.match(sources.order, /select\("id,slug,allow_legacy_qr,platform_status,deleted_at"\)/);
  assert.match(sources.order, /select\("id,platform_status,deleted_at"\)/);
});

test("public payment and service request slug access checks tenant platform status", () => {
  assert.match(sources.payment, /assertPublicTenantActive/);
  assert.match(sources.payment, /select\("id,allow_legacy_qr,platform_status,deleted_at"\)/);
  assert.match(sources.serviceRequest, /assertPublicTenantActive/);
  assert.match(sources.serviceRequest, /select\("id,allow_legacy_qr,platform_status,deleted_at"\)/);
});

test("public staff login and customer AI slug lookup hide inactive tenants", () => {
  assert.match(sources.restaurant, /return isPublicTenantActive\(data\) \? data : null/);
  assert.match(sources.aiRuntime, /select\("id,platform_status,deleted_at"\)/);
  assert.match(sources.aiRuntime, /assertPublicTenantActive\(data\)/);
});
