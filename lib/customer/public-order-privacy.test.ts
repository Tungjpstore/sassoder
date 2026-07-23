import assert from "node:assert/strict";
import test from "node:test";
import {
  createVerifiedOrderOwnershipContext,
  sanitizeSharedTableHistoryOrder,
  type VerifiedOrderOwnershipContext
} from "./public-order-privacy";
import { signCustomerSessionToken, verifyCustomerSessionToken } from "./customer-session-token";
import type { OrderDto } from "@/types/domain";

const SECRET = "public-order-privacy-secret-material-32-bytes";
const NOW = 1_750_000_000;

function order(partial: Partial<OrderDto> = {}): OrderDto {
  return {
    id: "o1",
    status: "ordering",
    subtotal: 10000,
    discountAmount: 0,
    total: 10000,
    paymentMethod: null,
    paymentStatus: "unpaid",
    fulfillmentType: "DINE_IN",
    customerName: "An",
    customerPhone: "0901",
    customerNote: "ít đá",
    bill: null,
    createdAt: new Date().toISOString(),
    table: { name: "Bàn 1" },
    items: [],
    ...partial
  };
}

test("sanitizeSharedTableHistoryOrder keeps fields for the owner session", () => {
  const result = sanitizeSharedTableHistoryOrder(order(), ownership("sess-a"), NOW);
  assert.equal(result.customerName, "An");
  assert.equal(result.customerNote, "ít đá");
});

test("sanitizeSharedTableHistoryOrder redacts private fields for other diners", () => {
  const result = sanitizeSharedTableHistoryOrder(order(), ownership("sess-a", "sess-b"), NOW);
  assert.equal(result.customerName, null);
  assert.equal(result.customerPhone, null);
  assert.equal(result.customerNote, null);
  assert.equal(result.total, 10000);
});

test("sanitizeSharedTableHistoryOrder redacts private fields when either session is missing", () => {
  for (const context of [null, undefined]) {
    const result = sanitizeSharedTableHistoryOrder(order(), context, NOW);
    assert.equal(result.customerName, null);
    assert.equal(result.customerPhone, null);
    assert.equal(result.customerNote, null);
  }
});

test("sanitizeSharedTableHistoryOrder rejects forged and expired matching ownership contexts", () => {
  const forged = {
    orderOwnerSessionId: "sess-a",
    viewerSessionId: "sess-a",
    expiresAt: NOW + 300
  } as unknown as VerifiedOrderOwnershipContext;
  assert.equal(sanitizeSharedTableHistoryOrder(order(), forged, NOW).customerName, null);

  const expiring = ownership("sess-a", "sess-a", NOW + 10);
  assert.ok(expiring);
  assert.equal(sanitizeSharedTableHistoryOrder(order(), expiring, NOW + 10).customerName, null);
  assert.equal(sanitizeSharedTableHistoryOrder(order(), "sess-a", "sess-a").customerName, null);
});

test("verified ownership rejects cross-tenant, wrong-scope and wrong-table session proofs", () => {
  const remoteOtherTenant = verifiedSession({
    sid: "sess-a",
    rid: "restaurant-2",
    scope: "REMOTE"
  });
  assert.equal(
    createVerifiedOrderOwnershipContext("sess-a", remoteOtherTenant, {
      restaurantId: "restaurant-1",
      scope: "DINE_IN",
      tableId: "table-1",
      tokenVersion: 1
    }),
    null
  );

  const wrongTable = verifiedSession({
    sid: "sess-a",
    rid: "restaurant-1",
    scope: "DINE_IN",
    tableId: "table-2"
  });
  assert.equal(
    createVerifiedOrderOwnershipContext("sess-a", wrongTable, {
      restaurantId: "restaurant-1",
      scope: "DINE_IN",
      tableId: "table-1",
      tokenVersion: 1
    }),
    null
  );
});

test("sanitizeSharedTableHistoryOrder redacts all owner-only delivery and tracking fields", () => {
  const populated = order({
    fulfillmentType: "DELIVERY",
    deliveryAddress: "12 Nguyen Hue",
    deliveryLat: 10.77,
    deliveryLng: 106.7,
    deliveryDistanceKm: 2.4,
    deliveryFee: 25000,
    serviceFee: 5000,
    deliveryStatus: "out_for_delivery",
    deliveryRouteGeometry: { type: "LineString", coordinates: [[106.7, 10.77], [106.71, 10.78]] },
    deliveryRouteDurationMinutes: 18,
    deliveryQuoteSnapshot: { quoteId: "quote-1" },
    deliveryTrackingUpdatedAt: "2026-07-22T10:00:00.000Z",
    deliveryCourierId: "courier-1",
    deliveryAssignedAt: "2026-07-22T09:50:00.000Z",
    deliveryCourier: { id: "courier-1", name: "Lan", phone: "0902", status: "assigned" },
    deliveryCourierLocation: {
      lat: 10.775,
      lng: 106.705,
      accuracyMeters: 5,
      capturedAt: "2026-07-22T10:00:00.000Z"
    },
    deliveryTrackingSnapshot: { courierName: "Lan" } as unknown as OrderDto["deliveryTrackingSnapshot"]
  });
  const result = sanitizeSharedTableHistoryOrder(populated, null, NOW);

  assert.equal(result.deliveryAddress, null);
  assert.equal(result.deliveryLat, null);
  assert.equal(result.deliveryLng, null);
  assert.equal(result.deliveryDistanceKm, null);
  assert.equal(result.deliveryFee, undefined);
  assert.equal(result.serviceFee, undefined);
  assert.equal(result.deliveryStatus, undefined);
  assert.equal(result.deliveryRouteGeometry, null);
  assert.equal(result.deliveryRouteDurationMinutes, null);
  assert.equal(result.deliveryQuoteSnapshot, null);
  assert.equal(result.deliveryTrackingUpdatedAt, null);
  assert.equal(result.deliveryCourierId, null);
  assert.equal(result.deliveryAssignedAt, null);
  assert.equal(result.deliveryCourier, null);
  assert.equal(result.deliveryCourierLocation, null);
  assert.equal(result.deliveryTrackingSnapshot, null);
  assert.equal(result.total, 10000);
});

function ownership(ownerSessionId: string, viewerSessionId = ownerSessionId, exp = NOW + 300) {
  const verified = verifiedSession({
    sid: viewerSessionId,
    rid: "restaurant-1",
    scope: "DINE_IN",
    tableId: "table-1",
    exp
  });
  return createVerifiedOrderOwnershipContext(ownerSessionId, verified, {
    restaurantId: "restaurant-1",
    scope: "DINE_IN",
    tableId: "table-1",
    tokenVersion: 1
  });
}

function verifiedSession(input: {
  sid: string;
  rid: string;
  scope: "REMOTE" | "DINE_IN";
  tableId?: string;
  exp?: number;
}) {
  const token = signCustomerSessionToken(
    {
      v: 1,
      sid: input.sid,
      rid: input.rid,
      scope: input.scope,
      ...(input.tableId === undefined ? {} : { tableId: input.tableId }),
      iat: NOW,
      exp: input.exp ?? NOW + 300,
      tokenVersion: 1
    },
    SECRET
  );
  const verified = verifyCustomerSessionToken(token, {
    secret: SECRET,
    restaurantId: input.rid,
    sessionId: input.sid,
    scope: input.scope,
    ...(input.tableId === undefined ? {} : { tableId: input.tableId }),
    tokenVersion: 1,
    now: NOW
  });
  assert.ok(verified);
  return verified;
}
