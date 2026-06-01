import assert from "node:assert/strict";
import test from "node:test";
import { trustedClientIp } from "./trusted-client-ip";

function requestWithHeaders(headers: Record<string, string>) {
  return new Request("https://logivn.test/api", { headers });
}

function setTestNodeEnv(value: string | undefined) {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = value;
}

test("trustedClientIp accepts Cloudflare IP only with Cloudflare marker", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  setTestNodeEnv("production");
  try {
    assert.equal(trustedClientIp(requestWithHeaders({ "cf-connecting-ip": "203.0.113.10" })), null);
    assert.equal(trustedClientIp(requestWithHeaders({ "cf-connecting-ip": "203.0.113.10", "cf-ray": "abc" })), "203.0.113.10");
  } finally {
    setTestNodeEnv(previousNodeEnv);
  }
});

test("trustedClientIp rejects spoofable forwarded headers in production without trusted proxy markers", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  setTestNodeEnv("production");
  try {
    assert.equal(trustedClientIp(requestWithHeaders({ "x-forwarded-for": "203.0.113.10", "x-real-ip": "203.0.113.11" })), null);
    assert.equal(trustedClientIp(requestWithHeaders({ "x-forwarded-for": "203.0.113.10, 198.51.100.4", "x-vercel-id": "sin1::abc" })), "203.0.113.10");
  } finally {
    setTestNodeEnv(previousNodeEnv);
  }
});

test("trustedClientIp can explicitly trust proxy headers for self-hosted deployments", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousTrust = process.env.STAFF_ATTENDANCE_TRUST_PROXY_HEADERS;
  setTestNodeEnv("production");
  process.env.STAFF_ATTENDANCE_TRUST_PROXY_HEADERS = "true";
  try {
    assert.equal(trustedClientIp(requestWithHeaders({ "x-real-ip": "203.0.113.20" })), "203.0.113.20");
  } finally {
    setTestNodeEnv(previousNodeEnv);
    process.env.STAFF_ATTENDANCE_TRUST_PROXY_HEADERS = previousTrust;
  }
});
