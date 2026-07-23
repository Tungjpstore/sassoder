import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/20260723173000_procurement_atomicity.sql";
const migrationSql = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const inventoryWorkspaceSource = readFileSync("components/dashboard/inventory-workspace-v2.tsx", "utf8");

function functionBody(name: string) {
  const match = migrationSql.match(
    new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\b([\\s\\S]*?)\\$\\$;`, "i")
  );

  assert.ok(match, `missing ${name} RPC`);
  return match[0];
}

test("procurement requests are tenant-scoped, fingerprinted, and row locked", () => {
  assert.match(migrationSql, /create table if not exists public\.inventory_transaction_requests/i);
  assert.match(migrationSql, /unique\s*\(restaurant_id,\s*operation,\s*idempotency_key\)/i);
  assert.match(migrationSql, /request_fingerprint\s+text\s+not\s+null/i);
  assert.match(migrationSql, /request_fingerprint\s+is\s+distinct\s+from\s+p_request_fingerprint/i);
  assert.match(migrationSql, /INVENTORY_IDEMPOTENCY_FINGERPRINT_MISMATCH/i);
  assert.match(migrationSql, /from public\.inventory_transaction_requests[\s\S]*for update/i);
  assert.match(
    migrationSql,
    /foreign key\s*\(restaurant_id,\s*actor_user_id\)[\s\S]*references\s+public\.users\s*\(restaurant_id,\s*id\)/i,
  );
});

test("PO receiving rejects cross-scope and over-receipt before writing the ledger", () => {
  const body = functionBody("receive_purchase_order_atomic");

  assert.match(body, /app_private\.current_restaurant_id\(\)\s+is\s+distinct\s+from\s+p_restaurant_id/i);
  assert.match(body, /from public\.purchase_orders[\s\S]*for update/i);
  assert.match(body, /from public\.purchase_order_lines[\s\S]*order by[\s\S]*for update/i);
  assert.match(body, /PURCHASE_ORDER_BRANCH_SCOPE_MISMATCH/i);
  assert.match(body, /PURCHASE_ORDER_OVER_RECEIPT/i);
  assert.match(body, /(?:\w+\.)?received_quantity\s*\+\s*(?:\w+\.)?requested_quantity\s*>\s*(?:\w+\.)?order_quantity/i);
  assert.match(body, /perform public\.receive_purchase_order|select public\.receive_purchase_order/i);
  assert.match(body, /insert into public\.audit_logs/i);
  assert.match(body, /insert into public\.operational_event_outbox/i);
  assert.match(body, /inventory_movements[\s\S]*purchaseOrderLineId/i);
  assert.match(body, /unit_cost[\s\S]*conversionFactor/i);
});

test("count and transfer commits share the same idempotent atomic boundary", () => {
  const countBody = functionBody("apply_inventory_count_atomic");
  const transferBody = functionBody("create_branch_transfer_atomic");
  const processTransferBody = functionBody("process_branch_transfer_atomic");

  assert.match(countBody, /from public\.ingredients[\s\S]*order by[\s\S]*for update/i);
  assert.match(countBody, /public\.apply_inventory_count\(/i);
  assert.match(countBody, /insert into public\.audit_logs/i);
  assert.match(transferBody, /from public\.inventory_locations[\s\S]*order by[\s\S]*for update/i);
  assert.match(transferBody, /TRANSFER_BRANCH_SCOPE_MISMATCH/i);
  assert.match(transferBody, /public\.create_branch_transfer\(/i);
  assert.match(transferBody, /insert into public\.audit_logs/i);
  assert.match(processTransferBody, /from public\.branch_transfers[\s\S]*for update/i);
  assert.match(processTransferBody, /from public\.branch_transfer_lines[\s\S]*order by[\s\S]*for update/i);
  assert.match(processTransferBody, /public\.process_branch_transfer\(/i);
  assert.match(processTransferBody, /inventory_movements[\s\S]*transferAction/i);
});

test("transfer receive fingerprint includes cumulative received state", () => {
  const formStart = inventoryWorkspaceSource.indexOf("function TransferReceiveForm(");
  const formEnd = inventoryWorkspaceSource.indexOf("\nfunction PurchasingCommandCenterDraft", formStart);
  assert.ok(formStart >= 0 && formEnd > formStart, "missing TransferReceiveForm source");
  const formSource = inventoryWorkspaceSource.slice(formStart, formEnd);

  assert.match(formSource, /const receiveStateFingerprint = useMemo\(/);
  assert.match(formSource, /receivableLines\.map\(\(line\) => \(\{[\s\S]*lineId:\s*line\.id[\s\S]*dispatchedQuantity:\s*line\.dispatchedQuantity[\s\S]*receivedQuantity:\s*line\.receivedQuantity/);
  assert.match(formSource, /action:\s*"receive"[\s\S]*lines:\s*linesJson[\s\S]*receiveState:\s*receiveStateFingerprint/);
  assert.match(formSource, /name="linesJson" value=\{linesJson\}/);
});

test("new inventory mutation RPCs are service-role-only security definers", () => {
  for (const name of [
    "receive_purchase_order_atomic",
    "apply_inventory_count_atomic",
    "create_branch_transfer_atomic",
    "process_branch_transfer_atomic"
  ]) {
    assert.match(functionBody(name), /security definer/i);
    assert.match(functionBody(name), /set search_path = pg_catalog, public/i);
    assert.match(
      migrationSql,
      new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${name}\\([\\s\\S]*?from\\s+public,\\s*anon,\\s*authenticated`, "i")
    );
    assert.match(
      migrationSql,
      new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${name}\\([\\s\\S]*?to\\s+service_role`, "i")
    );
  }
});
