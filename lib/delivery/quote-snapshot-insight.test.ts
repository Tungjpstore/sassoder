import assert from "node:assert/strict";
import test from "node:test";
import { resolveDeliveryQuoteSnapshotInsight } from "@/lib/delivery/quote-snapshot-insight";

test("resolveDeliveryQuoteSnapshotInsight flags excluded delivery zones", () => {
  const insight = resolveDeliveryQuoteSnapshotInsight({
    accepted: false,
    reason: "Chợ đêm đang nằm trong vùng loại trừ giao hàng.",
    confidence: "medium",
    deliveryArea: {
      status: "excluded",
      matchedExclusionName: "Chợ đêm"
    },
    addressQuality: {
      level: "medium",
      score: 68
    }
  });

  assert.equal(insight?.tone, "red");
  assert.equal(insight?.label, "Vùng loại trừ");
  assert.equal(insight?.badges.includes("Vùng loại trừ"), true);
});

test("resolveDeliveryQuoteSnapshotInsight flags low confidence estimated routes", () => {
  const insight = resolveDeliveryQuoteSnapshotInsight({
    accepted: true,
    provider: "haversine",
    routeProvider: "haversine",
    confidence: "low",
    isEstimated: true,
    distanceKm: 4.2,
    etaMinutes: 22,
    addressQuality: {
      level: "low",
      score: 44,
      warnings: ["Thiếu số nhà hoặc số hẻm."]
    },
    pricing: {
      deliveryFee: 25000,
      snapshot: {
        freeShippingApplied: false
      }
    }
  });

  assert.equal(insight?.tone, "yellow");
  assert.equal(insight?.label, "Cần kiểm tra địa chỉ");
  assert.equal(insight?.detail, "Thiếu số nhà hoặc số hẻm.");
  assert.equal(insight?.badges.includes("4.2 km"), true);
});

test("resolveDeliveryQuoteSnapshotInsight summarizes healthy quotes", () => {
  const insight = resolveDeliveryQuoteSnapshotInsight({
    accepted: true,
    routeProvider: "goong",
    confidence: "high",
    distanceKm: 1.8,
    etaMinutes: 14,
    addressQuality: {
      level: "high",
      score: 93
    },
    deliveryArea: {
      status: "inside_custom_area"
    },
    pricing: {
      deliveryFee: 0,
      snapshot: {
        freeShippingApplied: true
      }
    }
  });

  assert.equal(insight?.tone, "green");
  assert.equal(insight?.label, "Quote giao hàng tốt");
  assert.equal(insight?.badges.includes("Freeship"), true);
});
