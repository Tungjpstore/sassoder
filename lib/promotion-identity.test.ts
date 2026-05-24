import assert from "node:assert/strict";
import test from "node:test";
import { buildPromotionCustomerKeyHash, normalizePromotionPhone } from "./promotion-identity";

test("promotion customer keys are stable hashes of server-trusted identity", () => {
  const tableKey = buildPromotionCustomerKeyHash({
    restaurantId: "restaurant-1",
    channel: "QR_MENU",
    tableId: "table-1",
    customerSessionId: "client-can-rotate"
  });
  const rotatedSessionKey = buildPromotionCustomerKeyHash({
    restaurantId: "restaurant-1",
    channel: "QR_MENU",
    tableId: "table-1",
    customerSessionId: "another-client-session"
  });

  assert.equal(tableKey, rotatedSessionKey);
  assert.match(tableKey ?? "", /^[a-f0-9]{64}$/);
});

test("promotion customer phone keys normalize formatting noise", () => {
  assert.equal(normalizePromotionPhone("+84 090-123-4567"), "840901234567");
  assert.equal(
    buildPromotionCustomerKeyHash({ restaurantId: "restaurant-1", channel: "WEBSITE", customerPhone: "+84 090-123-4567" }),
    buildPromotionCustomerKeyHash({ restaurantId: "restaurant-1", channel: "WEBSITE", customerPhone: "84 090 123 4567" })
  );
});
