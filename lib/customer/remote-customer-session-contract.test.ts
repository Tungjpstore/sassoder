import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeFiles = [
  "app/api/remote-orders/route.ts",
  "app/api/remote-orders/history/route.ts",
  "app/api/remote-orders/[orderId]/route.ts",
  "app/api/remote-orders/[orderId]/paid/route.ts"
];

test("remote order, history, read and payment routes require the signed customer session", () => {
  for (const file of routeFiles) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /requireRemoteCustomerSession\(\{/i, file);
    assert.match(source, /customerSessionId:\s*customerSession\.customerSessionId/i, file);
  }
});

test("remote customer session issuance is server-generated", () => {
  const route = readFileSync("app/api/customer-sessions/remote/route.ts", "utf8");
  const server = readFileSync("lib/customer/customer-session-server.ts", "utf8");

  assert.match(route, /issueRemoteCustomerSession\(body\.restaurantSlug\)/);
  assert.doesNotMatch(route, /customerSessionId:\s*z\./);
  assert.match(server, /const sessionId = randomUUID\(\)/);
  assert.match(server, /scope:\s*"REMOTE"/);
  assert.match(server, /tokenVersion/);
});

test("customer realtime uses the verified session and a single authorized order room", () => {
  const route = readFileSync("app/api/customer-realtime/token/route.ts", "utf8");
  const socket = readFileSync("infra/vps/services/socket/server.js", "utf8");
  const client = readFileSync("components/customer-v2/remote/remote-client-v2.tsx", "utf8");

  assert.match(route, /requireRemoteCustomerSession\(\{/);
  assert.match(route, /if \(!session\.verifiedSession\)/);
  assert.match(route, /getRemotePublicOrder\(body\.orderId/);
  assert.match(socket, /claims\?\.scope === "customer_order"/);
  assert.match(socket, /claims\.orderId !== payload\.orderId/);
  assert.match(socket, /socket\.join\(orderRoom\(payload\.orderId\)\)/);
  assert.match(client, /useCustomerOrderRealtime\(\{/);
  assert.doesNotMatch(client, /createBrowserSupabaseClient/);
});
