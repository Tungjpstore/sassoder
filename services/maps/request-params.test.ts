import assert from "node:assert/strict";
import test from "node:test";
import { MapApiError } from "@/services/maps/errors";
import {
  parseCoordinateParam,
  parseMapLimit,
  parseOptionalGeocodingProvider,
  parseOptionalRoutingProvider
} from "@/services/maps/request-params";

test("parseMapLimit clamps noisy client limits", () => {
  assert.equal(parseMapLimit("999", 5, 8), 8);
  assert.equal(parseMapLimit("0", 5, 8), 1);
  assert.equal(parseMapLimit("bad", 5, 8), 5);
});

test("parseCoordinateParam rejects out-of-range coordinates", () => {
  assert.equal(parseCoordinateParam("10.77", "Vĩ độ", -90, 90), 10.77);
  assert.throws(() => parseCoordinateParam("181", "Kinh độ", -180, 180), MapApiError);
});

test("parseCoordinateParam rejects missing or blank coordinates instead of coercing to zero", () => {
  assert.throws(() => parseCoordinateParam(null, "Vĩ độ", -90, 90), MapApiError);
  assert.throws(() => parseCoordinateParam("", "Vĩ độ", -90, 90), MapApiError);
  assert.throws(() => parseCoordinateParam("   ", "Kinh độ", -180, 180), MapApiError);
});

test("provider parsers accept only supported provider ids", () => {
  assert.equal(parseOptionalGeocodingProvider("GOONG"), "goong");
  assert.equal(parseOptionalRoutingProvider("osrm"), "osrm");
  assert.equal(parseOptionalGeocodingProvider("unknown"), undefined);
  assert.equal(parseOptionalRoutingProvider("nominatim"), undefined);
});
