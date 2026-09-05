import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const branchService = readFileSync("features/staff/services/staff-branch-authorization-service.ts", "utf8");
const orderService = readFileSync("services/order-service.ts", "utf8");
const reservationService = readFileSync("services/reservation-service.ts", "utf8");
const tableService = readFileSync("services/table-service.ts", "utf8");

test("branch authorization covers reservations and legacy unassigned records safely", () => {
  assert.match(branchService, /assertStaffCanAccessReservation/);
  assert.match(branchService, /reservation_table_locks\([^)]*table:tables\(branch_id\)\)/);
  assert.match(branchService, /Dữ liệu đặt bàn chưa có chi nhánh/);
  assert.match(orderService, /authorizedBranchIds\?: ReadonlySet<string> \| null/);
  assert.match(reservationService, /authorizedBranchIds\?: ReadonlySet<string> \| null/);
  assert.match(tableService, /authorizedBranchIds\?: ReadonlySet<string> \| null/);
});

test("public table order responses sanitize QR-only private delivery data", () => {
  assert.match(orderService, /sanitizeSharedTableHistoryOrder\(order, viewerOwnsOrder/);
  assert.match(orderService, /billCustomerSessionId/);
});

test("admin reservation mutations declare permission and branch checks", () => {
  const routes = [
    "cancel",
    "check-in",
    "confirm-deposit",
    "move-table",
    "no-show",
    "refund-deposit",
    "reject",
    "reschedule",
    "seat",
    "tables"
  ];
  for (const route of routes) {
    const source = readFileSync(`app/api/admin/reservations/[reservationId]/${route}/route.ts`, "utf8");
    assert.match(source, /assertStaffCanAccessReservation/, route);
    assert.match(source, /permission:/, route);
  }
});
