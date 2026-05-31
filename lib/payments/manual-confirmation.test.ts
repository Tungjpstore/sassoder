import assert from "node:assert/strict";
import test from "node:test";
import { resolveManualConfirmationMethod } from "./manual-confirmation";

test("manual confirmation keeps the stored payment method first", () => {
  assert.equal(resolveManualConfirmationMethod({ currentMethod: "CASH", requestedMethod: "QR" }), "CASH");
});

test("manual confirmation can recover a lost-session payment method", () => {
  assert.equal(resolveManualConfirmationMethod({ currentMethod: null, requestedMethod: "QR" }), "QR");
});

test("manual confirmation still requires a method when none can be inferred", () => {
  assert.equal(resolveManualConfirmationMethod({ currentMethod: null, requestedMethod: null }), null);
});
