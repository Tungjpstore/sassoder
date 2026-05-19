import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const orderServiceSource = readFileSync("services/order-service.ts", "utf8");
const tableServiceSource = readFileSync("services/table-service.ts", "utf8");
const ordersBoardSource = readFileSync("components/dashboard/orders-board.tsx", "utf8");
const kitchenBoardSource = readFileSync("components/dashboard/kitchen-board.tsx", "utf8");
const menuWorkspaceSource = readFileSync("components/dashboard/menu-workspace.tsx", "utf8");
const onlineWorkspaceSource = readFileSync("components/dashboard/online-workspace.tsx", "utf8");
const realtimeMigrationSource = readFileSync("supabase/migrations/20260519201000_dashboard_operations_realtime_publication.sql", "utf8");

test("dashboard order retries do not rewrite completed or delivered state", () => {
  assert.match(orderServiceSource, /if \(order\.status === "completed"\) return order;/);
  assert.match(orderServiceSource, /\.eq\("status", "ordering"\)/);
  assert.match(orderServiceSource, /if \(order\.delivery_status === deliveryStatus\) return order;/);
  assert.match(orderServiceSource, /\.eq\("status", order\.status\)/);
});

test("optimistic accept retries keep the existing service timer", () => {
  assert.match(ordersBoardSource, /serviceDueAt: isFreshAccept \? nextDue : order\.serviceDueAt/);
  assert.match(kitchenBoardSource, /serviceDueAt: isFreshAccept \? nextServiceDueAt : order\.serviceDueAt/);
});

test("menu and online operations listen to modifier changes", () => {
  for (const table of ["menu_modifier_groups", "menu_modifier_options"]) {
    assert.match(menuWorkspaceSource, new RegExp(table));
    assert.match(onlineWorkspaceSource, new RegExp(table));
    assert.match(realtimeMigrationSource, new RegExp(table));
  }
});

test("table deletion is blocked by active orders, bills and reservation locks", () => {
  assert.match(tableServiceSource, /activeTableStatuses/);
  assert.match(tableServiceSource, /activeTableBillStatuses/);
  assert.match(tableServiceSource, /reservation_table_locks/);
});

test("dashboard realtime publication covers operational source tables", () => {
  for (const table of ["orders", "order_items", "menu_categories", "menu_items", "menu_modifier_groups", "menu_modifier_options"]) {
    assert.match(realtimeMigrationSource, new RegExp(`'${table}'`));
  }
});
