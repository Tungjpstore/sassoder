import assert from "node:assert/strict";
import test from "node:test";
import {
  validateCanonicalDeliveryDestination,
  type CanonicalDeliveryDestinationInput
} from "./canonical-delivery-destination";

test("canonical delivery destination accepts a non-empty address with no coordinates", () => {
  const result = validateCanonicalDeliveryDestination({ canonicalAddress: "  12 Nguyen Hue  " });
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
  assert.equal(result.canonicalAddress, "12 Nguyen Hue");
});

test("canonical delivery destination requires coordinate pairs", () => {
  const result = validateCanonicalDeliveryDestination({
    canonicalAddress: "12 Nguyen Hue",
    suppliedCoordinates: { lat: 10.77 }
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.issues.map((issue) => issue.code), ["COORDINATES_INCOMPLETE"]);
});

test("canonical delivery destination validates supplied and resolved coordinate ranges", () => {
  const result = validateCanonicalDeliveryDestination({
    canonicalAddress: "12 Nguyen Hue",
    suppliedCoordinates: { lat: 91, lng: 181 },
    resolvedCoordinates: { lat: -91, lng: -181 }
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.issues.map((issue) => issue.code), [
    "LATITUDE_OUT_OF_RANGE",
    "LONGITUDE_OUT_OF_RANGE",
    "RESOLVED_LATITUDE_OUT_OF_RANGE",
    "RESOLVED_LONGITUDE_OUT_OF_RANGE"
  ]);
});

test("canonical delivery destination rejects an empty canonical address", () => {
  const values: CanonicalDeliveryDestinationInput[] = [
    { canonicalAddress: "" },
    { canonicalAddress: "   " },
    { canonicalAddress: null }
  ];
  for (const input of values) {
    assert.equal(validateCanonicalDeliveryDestination(input).issues[0]?.code, "ADDRESS_EMPTY");
  }
});

test("canonical delivery destination compares supplied and resolved points with a haversine threshold", () => {
  const supplied = { lat: 10.770000, lng: 106.700000 };
  const near = validateCanonicalDeliveryDestination({
    canonicalAddress: "12 Nguyen Hue",
    suppliedCoordinates: supplied,
    resolvedCoordinates: { lat: 10.7702, lng: 106.7002 },
    maxDistanceMeters: 100
  });
  assert.equal(near.ok, true);
  assert.equal(typeof near.distanceMeters, "number");

  const far = validateCanonicalDeliveryDestination({
    canonicalAddress: "12 Nguyen Hue",
    suppliedCoordinates: supplied,
    resolvedCoordinates: { lat: 10.7800, lng: 106.7100 },
    maxDistanceMeters: 100
  });
  assert.equal(far.ok, false);
  assert.equal(far.issues[0]?.code, "COORDINATES_MISMATCH");
});

test("canonical delivery destination never falls back to a raw client address when resolution fails", () => {
  const result = validateCanonicalDeliveryDestination({
    address: "Raw client-entered address",
    canonicalAddress: null,
    suppliedCoordinates: { lat: 10.77, lng: 106.7 },
    resolvedCoordinates: null
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.issues.map((issue) => issue.code), [
    "ADDRESS_EMPTY",
    "RESOLVED_DESTINATION_REQUIRED"
  ]);
  assert.equal(result.canonicalDestination, undefined);
});

test("canonical delivery destination requires a resolved coordinate pair when coordinates were supplied", () => {
  const missing = validateCanonicalDeliveryDestination({
    canonicalAddress: "12 Nguyen Hue, Ben Nghe, District 1",
    suppliedCoordinates: { lat: 10.77, lng: 106.7 }
  });
  assert.deepEqual(missing.issues.map((issue) => issue.code), ["RESOLVED_DESTINATION_REQUIRED"]);

  const incomplete = validateCanonicalDeliveryDestination({
    canonicalAddress: "12 Nguyen Hue, Ben Nghe, District 1",
    suppliedCoordinates: { lat: 10.77, lng: 106.7 },
    resolvedCoordinates: { lat: 10.7701 }
  });
  assert.deepEqual(incomplete.issues.map((issue) => issue.code), ["RESOLVED_COORDINATES_INCOMPLETE"]);
});

test("canonical delivery destination returns the server-resolved canonical destination", () => {
  const resolved = { lat: 10.7702, lng: 106.7002 };
  const result = validateCanonicalDeliveryDestination({
    address: "12 ng hue",
    canonicalAddress: "12 Nguyen Hue, Ben Nghe, District 1",
    suppliedCoordinates: { lat: 10.77, lng: 106.7 },
    resolvedCoordinates: resolved,
    maxDistanceMeters: 100
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.canonicalDestination, {
    canonicalAddress: "12 Nguyen Hue, Ben Nghe, District 1",
    coordinates: resolved
  });
});

test("canonical delivery destination rejects antipodal mismatches without NaN fail-open", () => {
  const result = validateCanonicalDeliveryDestination({
    canonicalAddress: "Resolved destination",
    suppliedCoordinates: { lat: -57.83160980556867, lng: -41.29681930291653 },
    resolvedCoordinates: { lat: 57.83160980177432, lng: 138.70318069368096 },
    maxDistanceMeters: 100
  });
  assert.equal(result.ok, false);
  assert.equal(result.issues[0]?.code, "COORDINATES_MISMATCH");
  assert.equal(Number.isFinite(result.distanceMeters), true);
});

test("canonical delivery destination rejects conflicting coordinate representations", () => {
  const result = validateCanonicalDeliveryDestination({
    canonicalAddress: "Resolved destination",
    suppliedCoordinates: {},
    lat: 10.77,
    lng: 106.7,
    resolvedCoordinates: { lat: 10.7701, lng: 106.7001 }
  });
  assert.equal(result.ok, false);
  assert.equal(result.issues[0]?.code, "COORDINATE_REPRESENTATION_CONFLICT");
  assert.equal(result.canonicalDestination, undefined);
});
