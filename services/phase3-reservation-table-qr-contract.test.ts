import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/20260723150000_reservation_table_qr_hardening.sql";

test("table QR rotation and disable revocation use atomic database functions", () => {
  const service = readFileSync("services/table-service.ts", "utf8");
  const migration = readFileSync(migrationPath, "utf8");
  const restaurantService = readFileSync("services/restaurant-service.ts", "utf8");

  assert.match(service, /rpc\("rotate_table_qr_token"/);
  assert.match(service, /rpc\("set_table_qr_enabled"/);
  assert.doesNotMatch(service, /Number\(current\.qr_token_version \?\? 1\) \+ 1/);
  assert.match(migration, /qr_token_version = t\.qr_token_version \+ 1/);
  assert.match(migration, /alter column allow_legacy_qr set default false/i);
  assert.match(migration, /alter column qr_token_enforced set default true/i);
  assert.match(migration, /update public\.restaurants[\s\S]*set allow_legacy_qr = false/i);
  assert.match(migration, /update public\.tables[\s\S]*set qr_token_enforced = true/i);
  assert.match(restaurantService, /allow_legacy_qr:\s*input\.allowLegacyQr \?\? false/);
});

test("reservation hardening rejects cross-branch lock groups and makes create/deposit confirmation atomic", () => {
  const migration = readFileSync(migrationPath, "utf8");
  const service = readFileSync("services/reservation-service.ts", "utf8");

  assert.match(migration, /reservation_active_locks_single_branch/i);
  assert.match(migration, /create or replace function public\.create_reservation_with_table_lock/i);
  assert.match(migration, /create or replace function public\.confirm_reservation_deposit_atomic/i);
  assert.match(migration, /create or replace function public\.replace_reservation_table_locks_atomic/i);
  assert.match(migration, /from public\.reservations r[\s\S]*for update/i);
  assert.match(service, /rpc\("create_reservation_with_table_lock"/);
  assert.match(service, /rpc\("confirm_reservation_deposit_atomic"/);
  assert.match(service, /rpc\("replace_reservation_table_locks_atomic"/);
});

test("dine-in history requires a table-bound signed customer session", () => {
  const route = readFileSync("app/api/orders/history/route.ts", "utf8");
  const service = readFileSync("services/order-service.ts", "utf8");
  const sessionServer = readFileSync("lib/customer/customer-session-server.ts", "utf8");
  const issueRoute = readFileSync("app/api/customer-sessions/dine-in/route.ts", "utf8");

  assert.match(route, /requireDineInCustomerSession\(\{/);
  assert.match(route, /verifiedSession:\s*customerSession\.verifiedSession/);
  assert.match(service, /createVerifiedOrderOwnershipContext/);
  assert.match(service, /scope:\s*"DINE_IN"/);
  assert.match(sessionServer, /scope:\s*"DINE_IN"/);
  assert.match(sessionServer, /tableId/);
  assert.match(issueRoute, /issueDineInCustomerSession/);
});

test("reservation idempotency can recover the original access token", () => {
  const service = readFileSync("services/reservation-service.ts", "utf8");

  assert.match(service, /deterministicReservationAccessToken/);
  assert.match(service, /input\.idempotencyKey\s*\?\s*deterministicReservationAccessToken/);
  assert.match(service, /data\.access_token_hash\s*===\s*hashToken\(deterministicToken\)/);
});
