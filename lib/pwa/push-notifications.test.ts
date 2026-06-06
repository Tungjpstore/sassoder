import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePwaPushPayload, operationalEventToPwaPushTarget, sanitizePwaNotificationUrl } from "./push-notifications";

test("sanitizePwaNotificationUrl keeps dashboard and download paths only", () => {
  assert.equal(sanitizePwaNotificationUrl("/dashboard/orders?status=pending"), "/dashboard/orders?status=pending");
  assert.equal(sanitizePwaNotificationUrl("/download/ios"), "/download/ios");
  assert.equal(sanitizePwaNotificationUrl("https://evil.example/dashboard"), "/dashboard");
  assert.equal(sanitizePwaNotificationUrl("/api/admin/orders"), "/dashboard");
  assert.equal(sanitizePwaNotificationUrl("/r/demo/table/abc?t=qr-token"), "/dashboard");
});

test("normalizePwaPushPayload clamps copy and badge count", () => {
  const normalized = normalizePwaPushPayload({
    title: "  ",
    body: "x".repeat(180),
    badgeCount: 999,
    data: {
      url: "/dashboard/payments",
      eventId: "event id with spaces",
      eventType: "payment.waiting_confirm"
    }
  });

  assert.equal(normalized.title, "LogiVN");
  assert.equal(normalized.body?.length, 140);
  assert.equal(normalized.badgeCount, 99);
  assert.equal(normalized.tag, "event-id-with-spaces");
  assert.equal(normalized.data?.url, "/dashboard/payments");
});

test("operationalEventToPwaPushTarget maps high-risk order events to confirm-first dashboard targets", () => {
  const orderTarget = operationalEventToPwaPushTarget({
    type: "order.created",
    eventId: "order:demo",
    restaurantId: "restaurant-1",
    order: {
      id: "11111111-2222-3333-4444-555555555555",
      tableName: "Bàn 3",
      itemCount: 2
    }
  });

  assert.equal(orderTarget?.urgency, "high");
  assert.equal(orderTarget?.ttlSeconds, 300);
  assert.equal(orderTarget?.payload.data?.url, "/dashboard/orders");
  assert.equal(orderTarget?.payload.requireInteraction, true);
  assert.deepEqual(orderTarget?.requiredPermissions, ["orders.view", "orders.update"]);

  const ignored = operationalEventToPwaPushTarget({ type: "unknown.event", restaurantId: "restaurant-1" });
  assert.equal(ignored, null);
});
