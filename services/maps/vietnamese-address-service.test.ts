import assert from "node:assert/strict";
import test from "node:test";
import { normalizeVietnameseAddressQuery } from "@/services/maps/vietnamese-address-service";

test("normalizeVietnameseAddressQuery expands common HCMC abbreviations", () => {
  assert.equal(
    normalizeVietnameseAddressQuery("12 nguyen hue, q.1, tphcm"),
    "12 nguyen hue, Quận 1, TP Hồ Chí Minh"
  );
});

test("normalizeVietnameseAddressQuery keeps already readable text compact", () => {
  assert.equal(
    normalizeVietnameseAddressQuery("  5   Đường   Lê Lợi,   Quận 1 "),
    "5 Đường Lê Lợi, Quận 1"
  );
});
