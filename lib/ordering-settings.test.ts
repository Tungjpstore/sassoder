import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { orderingSettingsSchema } from "@/lib/validators";

const validOrderingSettingsPayload = {
  address: "12 Nguyen Trai, Quan 1, TP.HCM",
  onlineOrderingEnabled: false,
  pickupEnabled: true,
  deliveryEnabled: false,
  onlinePaymentMode: "PAY_AFTER",
  deliveryTrackingEnabled: false,
  mapGeocodingProvider: "goong",
  mapRoutingProvider: "goong",
  mapDefaultZoom: "14",
  mapDisplayStyle: "LIGHT",
  showStoreMarkerOnOrdering: true,
  showCustomerDistance: true,
  storeLat: "10.776900",
  storeLng: "106.700900",
  deliveryRadiusKm: "5",
  freeDeliveryRadiusKm: "1",
  deliveryBaseFee: "15000",
  deliveryFeePerKm: "5000",
  deliveryAreaMode: "RADIUS",
  deliveryAreaName: "Khu vực giao hàng chính",
  deliveryAreaNote: "",
  deliveryAreaWardCount: "0",
  deliveryAreaPolygon: JSON.stringify([
    { lat: 10.77, lng: 106.69 },
    { lat: 10.78, lng: 106.7 },
    { lat: 10.77, lng: 106.71 }
  ]),
  deliveryExclusionZones: "[]",
  deliveryFeeEnabled: true,
  deliveryFeeTiers: JSON.stringify([
    { id: "under-2", label: "Duoi 2 km", upToKm: 2, fee: 15000, contact: false },
    { id: "over-5", label: "Tren 5 km", upToKm: null, fee: null, contact: true }
  ]),
  minOrderForDelivery: "0",
  pickupEtaMinutes: "15",
  deliveryEtaMinutes: "30",
  serviceFeeEnabled: false,
  serviceFeeType: "ORDER_PERCENT",
  serviceFeePercent: "0",
  serviceFeeMin: "0",
  serviceFeeMax: "",
  allowOutsideDeliveryArea: false,
  showDeliveryEta: true,
  requireOutsideAreaConfirmation: true,
  autoSuggestNearestBranch: true
} as const;

describe("orderingSettingsSchema", () => {
  it("accepts the dashboard online settings payload and coerces persisted values", () => {
    const parsed = orderingSettingsSchema.safeParse(validOrderingSettingsPayload);

    assert.equal(parsed.success, true);
    if (!parsed.success) return;

    assert.equal(parsed.data.deliveryBaseFee, 15000);
    assert.equal(parsed.data.deliveryFeePerKm, 5000);
    assert.equal(parsed.data.storeLat, 10.7769);
    assert.equal(parsed.data.deliveryFeeTiers[1]?.contact, true);
    assert.equal(parsed.data.serviceFeeMax, undefined);
  });

  it("rejects free delivery radius larger than the accepted delivery radius", () => {
    const parsed = orderingSettingsSchema.safeParse({
      ...validOrderingSettingsPayload,
      deliveryRadiusKm: "3",
      freeDeliveryRadiusKm: "5"
    });

    assert.equal(parsed.success, false);
    if (parsed.success) return;
    assert.equal(parsed.error.issues[0]?.path.join("."), "freeDeliveryRadiusKm");
  });

  it("requires at least three points for custom delivery areas", () => {
    const parsed = orderingSettingsSchema.safeParse({
      ...validOrderingSettingsPayload,
      deliveryAreaMode: "CUSTOM",
      deliveryAreaPolygon: JSON.stringify([{ lat: 10.77, lng: 106.69 }])
    });

    assert.equal(parsed.success, false);
    if (parsed.success) return;
    assert.equal(parsed.error.issues[0]?.path.join("."), "deliveryAreaPolygon");
  });

  it("rejects service fee max below service fee min", () => {
    const parsed = orderingSettingsSchema.safeParse({
      ...validOrderingSettingsPayload,
      serviceFeeMin: "20000",
      serviceFeeMax: "10000"
    });

    assert.equal(parsed.success, false);
    if (parsed.success) return;
    assert.equal(parsed.error.issues[0]?.path.join("."), "serviceFeeMax");
  });
});
