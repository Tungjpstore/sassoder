import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260903090000_phase1_security_transaction_hardening.sql", "utf8");
const restaurantService = readFileSync("services/restaurant-service.ts", "utf8");

test("Phase 1 migration binds staff actors to auth.uid and preserves service-role workflows", () => {
  assert.match(migration, /assert_staff_actor_session\(p_actor_user_id uuid\)/i);
  assert.match(migration, /p_actor_user_id is distinct from auth\.uid\(\)/i);
  assert.match(migration, /to authenticated, service_role/i);
  assert.match(migration, /create or replace function public\.create_staff_user_profile/i);
  assert.match(migration, /create or replace function public\.update_staff_user_profile/i);
  assert.match(migration, /create or replace function public\.set_staff_account_state/i);
});

test("Phase 1 migration closes direct inventory DML and enforces composite branch ownership", () => {
  assert.match(migration, /revoke insert, update, delete on table[\s\S]*inventory_locations[\s\S]*from authenticated/i);
  assert.match(migration, /tables_restaurant_branch_id_fkey/i);
  assert.match(migration, /orders_restaurant_branch_id_fkey/i);
  assert.match(migration, /cross-tenant table branch links/i);
  assert.match(migration, /cross-tenant order branch links/i);
});

test("reservation mutation uses atomic RPC first with compatibility fallback", () => {
  assert.match(migration, /create or replace function public\.create_reservation_with_lock/i);
  assert.match(migration, /reservation_table_locks/i);
  assert.match(restaurantService, /rpc\("create_staff_user_profile"/i);
  const reservationService = readFileSync("services/reservation-service.ts", "utf8");
  const orderService = readFileSync("services/order-service.ts", "utf8");
  assert.match(reservationService, /rpc\("create_reservation_with_lock"/i);
  assert.match(reservationService, /atomicRpcMissing/i);
  assert.match(orderService, /create_order_with_items_atomic/i);
  assert.match(orderService, /insertOrderAggregate/i);
  assert.match(migration, /create or replace function public\.create_order_with_items_atomic/i);
  assert.match(migration, /jsonb_array_elements\(p_items\)/i);
});

test("delivery and deposit admin routes require explicit permissions", () => {
  const routes = [
    "app/api/admin/reservations/[reservationId]/confirm-deposit/route.ts",
    "app/api/admin/reservations/[reservationId]/refund-deposit/route.ts",
    "app/api/admin/orders/[orderId]/delivery-status/route.ts",
    "app/api/admin/orders/[orderId]/delivery-location/route.ts",
    "app/api/admin/orders/[orderId]/delivery-courier/route.ts",
    "app/api/admin/delivery/couriers/route.ts"
  ];
  for (const file of routes) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /permission:/, `${file} must declare an explicit permission`);
  }
});
