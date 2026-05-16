import assert from "node:assert/strict";
import test from "node:test";
import { buildCommandDeck, sanitizeCommandDeck } from "./command-deck";

test("buildCommandDeck converts agent actions into premium operating state", () => {
  const deck = buildCommandDeck({
    surface: "dashboard",
    title: "Order Commander",
    headline: "Có đơn đang chờ xử lý trong ca.",
    confidence: "high",
    actions: [
      {
        id: "accept-order-1",
        type: "api",
        label: "Nhận đơn #001",
        priority: "primary",
        safety: "confirm"
      }
    ]
  });

  assert.equal(deck.automationLevel, "copilot");
  assert.equal(deck.signals.length, 4);
  assert.match(deck.nextMove, /Nhận đơn/);
  assert.ok(deck.impactScore >= 60);
});

test("sanitizeCommandDeck removes malformed payload shape", () => {
  assert.equal(sanitizeCommandDeck({ surface: "unknown" }), null);

  const deck = sanitizeCommandDeck({
    surface: "customer",
    title: "Customer Guide",
    headline: "Mở giỏ hàng để tiếp tục.",
    impactScore: 120,
    signals: [{ label: "Impact", value: "99/100", tone: "success" }]
  });

  assert.equal(deck?.surface, "customer");
  assert.equal(deck?.impactScore, 99);
  assert.equal(deck?.signals[0]?.tone, "success");
});
