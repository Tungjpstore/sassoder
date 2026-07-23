import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/20260723120000_inventory_database_containment.sql";
const migrationSql = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const inventoryServiceSource = readFileSync("services/inventory-service.ts", "utf8");
const inventoryActionsSource = readFileSync("app/dashboard/actions/inventory.ts", "utf8");

const containedTables = [
  "ingredient_categories",
  "ingredients",
  "menu_item_recipes",
  "inventory_movements",
  "inventory_counts",
  "inventory_count_lines",
  "inventory_locations",
  "suppliers",
  "ingredient_unit_conversions",
  "supplier_items",
  "supplier_price_history",
  "purchase_orders",
  "purchase_order_lines",
  "inventory_batches",
  "stock_balances",
  "branch_transfers",
  "branch_transfer_lines",
  "inventory_alerts",
] as const;

const privilegedMutationRpcs = [
  "apply_inventory_movement",
  "create_purchase_order",
  "receive_purchase_order",
  "apply_inventory_count",
  "create_branch_transfer",
  "process_branch_transfer",
  "accept_order_with_inventory_deduction",
] as const;

function statementContaining(prefix: RegExp, tableName: string, suffix: RegExp) {
  const statement = migrationSql.match(new RegExp(`${prefix.source}([\\s\\S]*?);`, "i"))?.[0] ?? "";
  assert.match(statement, new RegExp(`public\\.${tableName}\\b`, "i"), `${tableName} is missing from ${prefix}`);
  assert.match(statement, suffix);
}

test("inventory containment is forward-only and preflights invalid tenant links before taking locks", () => {
  assert.ok(migrationSql, `missing ${migrationPath}`);
  assert.doesNotMatch(migrationSql, /drop\s+(table|column)\b/i);
  assert.doesNotMatch(migrationSql, /^\s*set\s+local\b/im);
  assert.doesNotMatch(migrationSql, /^\s*(insert\s+into|update|delete\s+from)\s+public\./im);
  assert.match(migrationSql, /^\s*set\s+lock_timeout\s*=\s*'5s'/im);
  assert.match(migrationSql, /^\s*set\s+statement_timeout\s*=\s*'5min'/im);
  assert.match(migrationSql, /^\s*reset\s+lock_timeout/im);
  assert.match(migrationSql, /^\s*reset\s+statement_timeout/im);
  assert.match(migrationSql, /inventory containment preflight failed/i);
  assert.match(migrationSql, /repair invalid rows and rerun the migration/i);

  const preflight = migrationSql.search(/inventory containment preflight failed/i);
  const firstMutation = migrationSql.search(/(?:set\s+lock_timeout|alter|create|revoke|grant)\s+/i);
  assert.ok(preflight >= 0 && firstMutation > preflight, "preflight must finish before schema or privilege changes");
});

test("browser roles are read-only across inventory master data and financial ledgers", () => {
  for (const tableName of containedTables) {
    statementContaining(/revoke\s+all\s+on\s+table/i, tableName, /from\s+public,\s*anon,\s*authenticated/i);
    statementContaining(/grant\s+select\s+on\s+table/i, tableName, /to\s+authenticated/i);
    statementContaining(
      /grant\s+select,\s*insert,\s*update,\s*delete\s+on\s+table/i,
      tableName,
      /to\s+service_role/i,
    );
  }

  assert.match(migrationSql, /create or replace function app_private\.current_inventory_restaurant_id\(\)/i);
  assert.match(migrationSql, /users\.id\s*=\s*request_context\.jwt_user_id/i);
  assert.doesNotMatch(migrationSql, /current_inventory_restaurant_id\([\s\S]*?lower\(users\.email\)/i);
  assert.match(migrationSql, /restaurant_id = app_private\.current_inventory_restaurant_id\(\)/i);

  for (const policyName of [
    "admins can manage own ingredient categories",
    "admins can manage own ingredients",
    "admins can manage own menu recipes",
    "admins can create own inventory movements",
    "admins can manage own inventory counts",
    "admins can manage own inventory count lines",
    "admins can manage own inventory locations",
    "admins can manage own suppliers",
    "admins can manage own ingredient unit conversions",
    "admins can manage own supplier items",
    "admins can manage own supplier price history",
    "admins can manage own purchase orders",
    "admins can manage own purchase order lines",
    "admins can manage own inventory batches",
    "admins can manage own stock balances",
    "admins can manage own branch transfers",
    "admins can manage own branch transfer lines",
    "admins can manage own inventory alerts",
  ]) {
    assert.match(migrationSql, new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+"${policyName}"`, "i"));
  }
});

test("restaurant-scoped composite constraints contain warehouse references", () => {
  for (const constraintName of [
    "ingredients_restaurant_category_fkey",
    "ingredients_restaurant_default_supplier_fkey",
    "menu_item_recipes_restaurant_menu_item_fkey",
    "menu_item_recipes_restaurant_ingredient_fkey",
    "inventory_locations_restaurant_branch_fkey",
    "ingredient_unit_conversions_restaurant_ingredient_fkey",
    "supplier_items_restaurant_supplier_fkey",
    "supplier_items_restaurant_ingredient_fkey",
    "supplier_price_history_restaurant_supplier_fkey",
    "supplier_price_history_restaurant_ingredient_fkey",
    "supplier_price_history_restaurant_purchase_order_fkey",
    "purchase_orders_restaurant_branch_fkey",
    "purchase_orders_restaurant_location_fkey",
    "purchase_orders_restaurant_supplier_fkey",
    "purchase_orders_restaurant_actor_fkey",
    "purchase_order_lines_restaurant_order_fkey",
    "purchase_order_lines_restaurant_ingredient_fkey",
    "purchase_order_lines_restaurant_supplier_item_ingredient_fkey",
    "inventory_batches_restaurant_ingredient_fkey",
    "inventory_batches_restaurant_supplier_fkey",
    "inventory_batches_restaurant_po_line_ingredient_fkey",
    "stock_balances_restaurant_branch_fkey",
    "stock_balances_restaurant_location_fkey",
    "stock_balances_restaurant_ingredient_fkey",
    "stock_balances_restaurant_batch_ingredient_fkey",
    "branch_transfers_restaurant_from_branch_fkey",
    "branch_transfers_restaurant_to_branch_fkey",
    "branch_transfers_restaurant_from_location_fkey",
    "branch_transfers_restaurant_to_location_fkey",
    "branch_transfers_restaurant_requested_by_fkey",
    "branch_transfers_restaurant_approved_by_fkey",
    "branch_transfer_lines_restaurant_transfer_fkey",
    "branch_transfer_lines_restaurant_ingredient_fkey",
    "branch_transfer_lines_restaurant_batch_ingredient_fkey",
    "inventory_movements_restaurant_branch_fkey",
    "inventory_movements_restaurant_location_fkey",
    "inventory_movements_restaurant_ingredient_fkey",
    "inventory_movements_restaurant_batch_ingredient_fkey",
    "inventory_movements_restaurant_purchase_order_fkey",
    "inventory_movements_restaurant_transfer_fkey",
    "inventory_movements_restaurant_actor_fkey",
    "inventory_counts_restaurant_branch_fkey",
    "inventory_counts_restaurant_location_fkey",
    "inventory_counts_restaurant_actor_fkey",
    "inventory_count_lines_restaurant_count_fkey",
    "inventory_count_lines_restaurant_branch_fkey",
    "inventory_count_lines_restaurant_location_fkey",
    "inventory_count_lines_restaurant_ingredient_fkey",
    "inventory_count_lines_restaurant_batch_ingredient_fkey",
    "inventory_alerts_restaurant_branch_fkey",
    "inventory_alerts_restaurant_ingredient_fkey",
    "inventory_alerts_restaurant_actor_fkey",
  ]) {
    assert.match(migrationSql, new RegExp(`['"]${constraintName}['"]`, "i"), `missing ${constraintName}`);
  }

  assert.match(migrationSql, /foreign key \(restaurant_id, purchase_order_line_id, ingredient_id\)[\s\S]*references public\.purchase_order_lines \(restaurant_id, id, ingredient_id\)/i);
  assert.match(migrationSql, /foreign key \(restaurant_id, batch_id, ingredient_id\)[\s\S]*references public\.inventory_batches \(restaurant_id, id, ingredient_id\)/i);
  assert.match(migrationSql, /add constraint[\s\S]*not valid/i);
  assert.match(migrationSql, /validate constraint/i);
});

test("branch and location consistency is guarded on every location-bearing ledger", () => {
  assert.match(migrationSql, /create or replace function app_private\.assert_inventory_location_scope/i);
  assert.match(migrationSql, /create or replace function app_private\.assert_inventory_movement_source_scope/i);
  assert.match(migrationSql, /INVENTORY_BRANCH_SCOPE_MISMATCH/i);
  assert.match(migrationSql, /INVENTORY_LOCATION_SCOPE_MISMATCH/i);
  assert.match(migrationSql, /locations\.branch_id is not distinct from p_branch_id/i);
  assert.match(migrationSql, /INVENTORY_MOVEMENT_SOURCE_SCOPE_MISMATCH/i);

  for (const tableName of [
    "inventory_locations",
    "purchase_orders",
    "stock_balances",
    "branch_transfers",
    "inventory_movements",
    "inventory_counts",
    "inventory_count_lines",
    "inventory_alerts",
  ]) {
    assert.match(
      migrationSql,
      new RegExp(`create\\s+trigger\\s+[a-z0-9_]+[\\s\\S]*?before\\s+insert\\s+or\\s+update[\\s\\S]*?on\\s+public\\.${tableName}\\b`, "i"),
      `missing branch/location guard on ${tableName}`,
    );
  }
});

test("all externally callable inventory mutation RPCs are service-role only", () => {
  for (const functionName of privilegedMutationRpcs) {
    assert.match(
      migrationSql,
      new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${functionName}\\([\\s\\S]*?from\\s+public,\\s*anon,\\s*authenticated`, "i"),
      `${functionName} must be revoked from browser roles`,
    );
    assert.match(
      migrationSql,
      new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${functionName}\\([\\s\\S]*?to\\s+service_role`, "i"),
      `${functionName} must remain callable by service_role`,
    );
  }

  assert.match(migrationSql, /revoke\s+all\s+on\s+function\s+public\.apply_order_inventory_movement_atomic\([\s\S]*?from\s+public,\s*anon,\s*authenticated,\s*service_role/i);
  assert.match(migrationSql, /revoke\s+all\s+on\s+function\s+public\.cancel_order_with_inventory_rollback\([\s\S]*?from\s+public,\s*anon,\s*authenticated,\s*service_role/i);
});

test("server actions keep master-data mutations working through the scoped service-role client", () => {
  for (const functionName of [
    "createInventoryCategory",
    "createInventorySupplier",
    "importInventoryIntakeRows",
    "createInventoryIngredient",
    "updateInventoryIngredient",
    "deactivateInventoryIngredient",
    "upsertInventoryRecipeLine",
    "deleteInventoryRecipeLine",
    "updateInventoryAlertStatus",
  ]) {
    const block = inventoryServiceSource.match(
      new RegExp(`export\\s+async\\s+function\\s+${functionName}\\b([\\s\\S]*?)(?=\\nexport\\s+async\\s+function|\\nasync\\s+function|$)`),
    )?.[0] ?? "";
    assert.match(block, /createInventoryMutationSupabaseClient\(/, `${functionName} must use the scoped service-role client`);
    assert.doesNotMatch(block, /createServerSupabaseClient\(/, `${functionName} must not rely on revoked browser DML`);
  }

  for (const actionName of [
    "createInventoryCategoryAction",
    "createInventorySupplierAction",
    "deactivateInventoryIngredientAction",
    "upsertInventoryRecipeLineAction",
    "deleteInventoryRecipeLineAction",
  ]) {
    const block = inventoryActionsSource.match(
      new RegExp(`export\\s+async\\s+function\\s+${actionName}\\b([\\s\\S]*?)(?=\\nexport\\s+async\\s+function|$)`),
    )?.[0] ?? "";
    assert.match(block, /actorUserId:\s*session\.userId|,\s*session\.userId/, `${actionName} must bind the authenticated actor`);
  }
});
