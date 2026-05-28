import assert from "node:assert/strict";
import test from "node:test";
import { exactIpCidr, firstForwardedIp, ipMatchesCidr } from "./attendance-network";

test("attendance network matches exact and subnet IPv4 CIDR rules", () => {
  assert.equal(ipMatchesCidr("203.0.113.10", "203.0.113.10/32"), true);
  assert.equal(ipMatchesCidr("203.0.113.11", "203.0.113.10/32"), false);
  assert.equal(ipMatchesCidr("203.0.113.42", "203.0.113.0/24"), true);
  assert.equal(ipMatchesCidr("203.0.114.42", "203.0.113.0/24"), false);
});

test("attendance network normalizes exact public IP CIDR values", () => {
  assert.equal(exactIpCidr("203.0.113.10"), "203.0.113.10/32");
  assert.equal(exactIpCidr("::ffff:203.0.113.10"), "203.0.113.10/32");
  assert.equal(exactIpCidr("local"), null);
});

test("attendance network reads the first forwarded IP", () => {
  assert.equal(firstForwardedIp("203.0.113.10, 198.51.100.4"), "203.0.113.10");
  assert.equal(firstForwardedIp(null), null);
});
