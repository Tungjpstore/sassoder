import assert from "node:assert/strict";
import test from "node:test";
import { analyzeVietnameseDeliveryAddress, parseVietnameseAddressParts } from "@/services/maps/address-quality-service";

test("parseVietnameseAddressParts extracts Vietnamese delivery address hints", () => {
  const parts = parseVietnameseAddressParts("12/4 Đường Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP Hồ Chí Minh");

  assert.equal(parts.houseNumber, "12/4");
  assert.equal(parts.street, "Nguyễn Huệ");
  assert.equal(parts.ward, "Bến Nghé");
  assert.equal(parts.district, "1");
  assert.equal(parts.province, "Hồ Chí Minh");
});

test("analyzeVietnameseDeliveryAddress scores precise addresses higher", () => {
  const quality = analyzeVietnameseDeliveryAddress({
    address: "12/4 Đường Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP Hồ Chí Minh",
    coordinate: { lat: 10.7769, lng: 106.7009 },
    provider: "goong",
    routeConfidence: "high"
  });

  assert.equal(quality.level, "high");
  assert.equal(quality.hasCoordinate, true);
  assert.equal(quality.warnings.length, 0);
});

test("analyzeVietnameseDeliveryAddress flags vague alley-prone addresses", () => {
  const quality = analyzeVietnameseDeliveryAddress({
    address: "Q1",
    coordinate: null,
    provider: "manual"
  });

  assert.equal(quality.level, "low");
  assert.equal(quality.hasCoordinate, false);
  assert.equal(quality.warnings.some((warning) => warning.includes("mơ hồ")), true);
});
