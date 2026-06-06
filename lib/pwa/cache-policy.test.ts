import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasSensitivePwaHeaders,
  hasSensitivePwaSearchParams,
  isPublicPwaDocumentPath,
  isStaticPwaAssetPath,
  shouldBypassPwaCache,
  shouldCachePwaDocument,
  shouldCachePwaStaticAsset
} from "@/lib/pwa/cache-policy";

const origin = "https://logivn.com";

test("PWA cache policy allows only known static assets", () => {
  assert.equal(isStaticPwaAssetPath("/_next/static/chunks/app.js"), true);
  assert.equal(isStaticPwaAssetPath("/icons/icon-192x192.png"), true);
  assert.equal(isStaticPwaAssetPath("/brand/logivn/logo-horizontal-transparent.png"), true);
  assert.equal(isStaticPwaAssetPath("/api/health"), false);
});

test("PWA cache policy recognizes public marketing documents only", () => {
  assert.equal(isPublicPwaDocumentPath("/"), true);
  assert.equal(isPublicPwaDocumentPath("/download"), true);
  assert.equal(isPublicPwaDocumentPath("/download/android"), true);
  assert.equal(isPublicPwaDocumentPath("/blog/menu-qr"), true);
  assert.equal(isPublicPwaDocumentPath("/dashboard"), false);
  assert.equal(isPublicPwaDocumentPath("/r/quan-cafe"), false);
});

test("PWA cache policy denies sensitive paths and non-GET methods", () => {
  assert.equal(shouldBypassPwaCache({ url: "/api/orders", method: "GET" }, origin), true);
  assert.equal(shouldBypassPwaCache({ url: "/auth/callback?code=secret", method: "GET" }, origin), true);
  assert.equal(shouldBypassPwaCache({ url: "/dashboard/orders", method: "GET" }, origin), true);
  assert.equal(shouldBypassPwaCache({ url: "/orders", method: "POST" }, origin), true);
});

test("PWA cache policy denies auth headers and session cookies", () => {
  assert.equal(hasSensitivePwaHeaders({ Authorization: "Bearer secret" }), true);
  assert.equal(hasSensitivePwaHeaders({ Cookie: "sb-project-auth-token=secret" }), true);
  assert.equal(hasSensitivePwaHeaders({ Cookie: "logivn-dashboard-smoke=tenant:secret" }), true);
  assert.equal(hasSensitivePwaHeaders({ Cookie: "marketing_session=abc" }), false);
});

test("PWA cache policy denies sensitive search params", () => {
  assert.equal(hasSensitivePwaSearchParams(new URL("/r/demo/table/abc?t=qr-token", origin)), true);
  assert.equal(hasSensitivePwaSearchParams(new URL("/dashboard/login?next=/dashboard", origin)), true);
  assert.equal(hasSensitivePwaSearchParams(new URL("/blog/menu-qr?page=2", origin)), false);
});

test("PWA cache decisions keep app shell assets cacheable and private data network-only", () => {
  assert.equal(shouldCachePwaStaticAsset({ url: "/icons/icon-512x512.png" }, origin), true);
  assert.equal(shouldCachePwaDocument({ url: "/pricing" }, origin), true);
  assert.equal(shouldCachePwaDocument({ url: "/download/ios" }, origin), true);
  assert.equal(shouldCachePwaDocument({ url: "/pricing", headers: { Cookie: "sb-project-auth-token=secret" } }, origin), false);
  assert.equal(shouldCachePwaStaticAsset({ url: "https://example.com/icon.png" }, origin), false);
});
