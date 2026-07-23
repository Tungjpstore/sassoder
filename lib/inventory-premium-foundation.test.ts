import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getFallbackCapabilityMap, legacyBillingFeatureMap, normalizeFeatureKey } from "@/services/billing/plan-features";

const inventoryActionsSource = readFileSync("app/dashboard/actions/inventory.ts", "utf8");
const inventoryRouteSource = readFileSync("app/dashboard/inventory/page.tsx", "utf8");
const inventoryWorkspaceSource = readFileSync("components/dashboard/inventory-workspace-v2.tsx", "utf8");
const inventoryServiceSource = readFileSync("services/inventory-service.ts", "utf8");
const adminSupabaseSource = readFileSync("lib/supabase/admin.ts", "utf8");
const inventoryOcrRouteSource = readFileSync("app/api/admin/ai/inventory-ocr/route.ts", "utf8");
const aiRuntimeSource = readFileSync("services/ai/runtime.ts", "utf8");
const ownerAgentCommandSource = readFileSync("lib/ai/owner-agent-command.ts", "utf8");
const ownerAgentExecutorSource = readFileSync("services/ai-owner-agent-executor.ts", "utf8");
const aiInsightsActionsSource = readFileSync("app/dashboard/actions/ai-insights.ts", "utf8");
const validatorsSource = readFileSync("lib/validators.ts", "utf8");
const hardeningMigration = readFileSync("supabase/migrations/20260603123221_inventory_premium_foundation_hardening.sql", "utf8");
const packageJson = readFileSync("package.json", "utf8");

function functionBlock(source: string, name: string) {
  const match = source.match(new RegExp(`export async function ${name}[\\s\\S]*?(?=\\nexport async function |\\nfunction |$)`));
  assert.ok(match, `${name} block should exist`);
  return match[0];
}

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("inventory entitlement fallback keeps basic on pro and premium workflows on premium", () => {
  const pro = getFallbackCapabilityMap("pro");
  const premium = getFallbackCapabilityMap("premium");

  for (const key of [
    "inventory_basic",
    "inventory_premium",
    "inventory_procurement",
    "inventory_warehouse_advanced",
    "inventory_alerts",
    "inventory_ai_ocr",
    "inventory_ai_intelligence"
  ]) {
    assert.equal(normalizeFeatureKey(key), key);
  }

  assert.equal(pro.inventory_management.enabled, true);
  assert.equal(pro.inventory_basic.enabled, true);
  assert.equal(pro.inventory_premium.enabled, false);
  assert.equal(pro.inventory_procurement.enabled, false);
  assert.equal(pro.inventory_ai_ocr.enabled, false);
  assert.equal(premium.inventory_basic.enabled, true);
  assert.equal(premium.inventory_premium.enabled, true);
  assert.equal(premium.inventory_procurement.enabled, true);
  assert.equal(premium.inventory_ai_ocr.enabled, true);
  assert.equal(premium.inventory_ai_intelligence.enabled, true);
});

test("inventory route and actions use split server-side feature guards", () => {
  assert.match(
    inventoryRouteSource,
    /requireDashboardPermissionAccess\("inventory_basic",\s*"inventory\.view",\s*\{\s*allowAdminBypass: false\s*\}\)/
  );
  assert.match(inventoryRouteSource, /inventoryFeatures=\{\{/);
  assert.match(inventoryWorkspaceSource, /inventoryFeatures\?: InventoryFeatureAccess/);
  assert.match(inventoryWorkspaceSource, /canUseProcurement=\{features\.procurement\}/);
  assert.match(inventoryWorkspaceSource, /canUseWarehouseAdvanced=\{features\.warehouseAdvanced\}/);
  assert.match(inventoryWorkspaceSource, /canUseAlerts=\{features\.alerts\}/);
  assert.match(inventoryWorkspaceSource, /canEditRecipes=\{features\.premium\}/);

  const expectedGuards: Array<[string, string]> = [
    ["createInventoryCategoryAction", "inventory_basic"],
    ["createInventorySupplierAction", "inventory_procurement"],
    ["createInventoryPurchaseOrderAction", "inventory_procurement"],
    ["receiveInventoryPurchaseOrderAction", "inventory_procurement"],
    ["refreshInventoryAlertsAction", "inventory_alerts"],
    ["applyInventoryCountAction", "inventory_warehouse_advanced"],
    ["createInventoryTransferAction", "inventory_warehouse_advanced"],
    ["processInventoryTransferAction", "inventory_warehouse_advanced"],
    ["updateInventoryAlertStatusAction", "inventory_alerts"],
    ["createInventoryIngredientAction", "inventory_basic"],
    ["updateInventoryIngredientAction", "inventory_basic"],
    ["deactivateInventoryIngredientAction", "inventory_basic"],
    ["recordInventoryMovementAction", "inventory_basic"],
    ["importInventoryIntakeAction", "inventory_procurement"],
    ["upsertInventoryRecipeLineAction", "inventory_premium"],
    ["deleteInventoryRecipeLineAction", "inventory_premium"]
  ];

  for (const [actionName, featureKey] of expectedGuards) {
    assert.match(functionBlock(inventoryActionsSource, actionName), new RegExp(`requireOperationalAdminSession\\("${featureKey}"\\)`));
  }
});

test("inventory command center keeps the default workspace compact with quick operations", () => {
  assert.match(inventoryWorkspaceSource, /type QuickOperation = "receive" \| "waste" \| "count" \| "transfer" \| "purchase"/);
  assert.match(inventoryWorkspaceSource, /function InventoryCommandCenter/);
  assert.match(inventoryWorkspaceSource, /function InventoryWorkbenchShell/);
  assert.match(inventoryWorkspaceSource, /function QuickOperationDrawer/);
  assert.match(inventoryWorkspaceSource, /count: number/);
  assert.match(inventoryWorkspaceSource, /const visibleActions = showMoreActions \? \[\.\.\.primaryActions, \.\.\.secondaryActions\] : primaryActions/);
  assert.match(inventoryWorkspaceSource, /Thao tác nhanh/);
  assert.match(inventoryWorkspaceSource, /Thêm thao tác/);
  assert.match(inventoryWorkspaceSource, /const QUICK_OPTION_LIMIT = 80/);
  assert.match(inventoryWorkspaceSource, /function getQuickIngredientOptions/);
  assert.match(inventoryWorkspaceSource, /function getQuickStockOptions/);
  assert.match(inventoryWorkspaceSource, /function QuickSearchInput/);
  assert.match(inventoryWorkspaceSource, /Scan SKU\/barcode hoặc tìm nguyên liệu/);
  assert.match(inventoryWorkspaceSource, /Scan SKU\/barcode hoặc tìm nguyên liệu\/lô/);
  assert.match(inventoryWorkspaceSource, /const \[showWorkbench, setShowWorkbench\] = useState\(false\)/);
  assert.match(inventoryWorkspaceSource, /const \[quickOperation, setQuickOperation\] = useState<QuickOperation \| null>\(null\)/);
  assert.match(inventoryWorkspaceSource, /setQuickOperation\("receive"\)/);
  assert.match(inventoryWorkspaceSource, /setQuickOperation\("waste"\)/);
  assert.match(inventoryWorkspaceSource, /setQuickOperation\("count"\)/);
  assert.match(inventoryWorkspaceSource, /setQuickOperation\("transfer"\)/);
  assert.match(inventoryWorkspaceSource, /setQuickOperation\("purchase"\)/);
  assert.match(inventoryWorkspaceSource, /QuickReceiveForm[\s\S]*recordInventoryMovementAction/);
  assert.match(inventoryWorkspaceSource, /QuickWasteForm[\s\S]*recordInventoryMovementAction/);
  assert.match(inventoryWorkspaceSource, /QuickCountForm[\s\S]*applyInventoryCountAction/);
  assert.match(inventoryWorkspaceSource, /QuickTransferForm[\s\S]*createInventoryTransferAction/);
  assert.match(inventoryWorkspaceSource, /QuickPurchaseOrderForm[\s\S]*createInventoryPurchaseOrderAction/);
});

test("inventory AI OCR and owner-agent PO drafts use inventory-specific entitlements", () => {
  assert.match(inventoryOcrRouteSource, /feature: "inventory_ai_ocr"/);
  assert.match(aiRuntimeSource, /featureKey: "inventory_ai_ocr"/);
  assert.equal(legacyBillingFeatureMap.inventory_ai_ocr, "inventory_ai_ocr");
  assert.match(aiRuntimeSource, /inventory_ai_ocr: "inventory_ai_ocr"/);
  assert.match(hardeningMigration, /'inventory_ai_ocr',\s*'AI đọc hóa đơn kho'/);
  assert.match(hardeningMigration, /'premium', 'inventory_ai_ocr', 'quota', 'ai_requests', 300/);
  assert.doesNotMatch(functionBlock(aiRuntimeSource, "generateInventoryOcrDraft"), /featureKey: "ai_menu_ocr"/);
  assert.match(ownerAgentCommandSource, /create_purchase_order_draft[\s\S]*requiredFeature: "inventory_ai_intelligence"/);
  assert.match(ownerAgentExecutorSource, /create_purchase_order_draft[\s\S]*assertFeatureEntitlement\(input\.restaurantId, "inventory_procurement"\)/);
  assert.match(aiInsightsActionsSource, /recommendation\.type === "inventory"[\s\S]*assertFeatureEntitlement\(session\.restaurantId, "inventory_ai_intelligence"\)/);
  assert.match(aiInsightsActionsSource, /recommendation\.type === "inventory"[\s\S]*assertFeatureEntitlement\(session\.restaurantId, "inventory_procurement"\)/);
});

test("workflow inventory RPCs are service-role only with scoped actor context", () => {
  assert.match(adminSupabaseSource, /export function createScopedAdminSupabaseClient/);
  assert.match(hardeningMigration, /create or replace function app_private\.request_header_text/);
  assert.match(hardeningMigration, /x-logivn-inventory-actor-id/);
  assert.match(hardeningMigration, /join plans on plans\.code::text = entitlements\.plan_code/);
  assert.doesNotMatch(hardeningMigration, /max\(id\) filter/);

  for (const fn of [
    "apply_inventory_movement",
    "create_purchase_order",
    "receive_purchase_order",
    "apply_inventory_count",
    "create_branch_transfer",
    "process_branch_transfer"
  ]) {
    assert.match(hardeningMigration, new RegExp(`revoke execute on function public\\.${fn}[\\s\\S]*?from public, anon, authenticated`, "i"));
    assert.match(hardeningMigration, new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*?to service_role`, "i"));
    assert.doesNotMatch(hardeningMigration, new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*?to authenticated`, "i"));
  }
});

test("atomic order inventory RPCs are service-role only after hardening", () => {
  for (const fn of [
    "accept_order_with_inventory_deduction",
    "cancel_order_with_inventory_rollback"
  ]) {
    assert.match(hardeningMigration, new RegExp(`revoke execute on function public\\.${fn}[\\s\\S]*from public, anon, authenticated`, "i"));
    assert.match(hardeningMigration, new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*to service_role`, "i"));
  }
});

test("workflow mutation adapters use scoped service-role actor context", () => {
  assert.match(inventoryServiceSource, /const inventoryActorHeader = "x-logivn-inventory-actor-id"/);
  assert.match(inventoryServiceSource, /createScopedAdminSupabaseClient\(\{ \[inventoryActorHeader\]: actorUserId \}\)/);

  const expectedActorExpressions: Array<[string, string]> = [
    ["createInventoryPurchaseOrder", "input.actorUserId"],
    ["receiveInventoryPurchaseOrder", "input.actorUserId"],
    ["applyInventoryCount", "input.actorUserId"],
    ["createInventoryTransfer", "input.actorUserId"],
    ["processInventoryTransfer", "input.actorUserId"],
    ["deductInventoryForOrder", "actorUserId"],
    ["rollbackInventoryForOrder", "actorUserId"],
    ["recordInventoryMovement", "input.actorUserId"]
  ];

  for (const [name, actorExpression] of expectedActorExpressions) {
    const block = functionBlock(inventoryServiceSource, name);
    assert.match(block, new RegExp(`createInventoryMutationSupabaseClient\\(${escapeRegExp(actorExpression)}\\)`), `${name} should use scoped service-role actor context`);
    assert.doesNotMatch(block, /createServerSupabaseClient\(\)/, `${name} should not rely on browser-authenticated RPC execution`);
  }
});

test("service-role-ready inventory adapters use the admin Supabase client", () => {
  for (const name of ["acceptOrderWithInventoryDeduction", "cancelOrderWithInventoryRollback", "refreshInventoryAlerts"]) {
    assert.match(functionBlock(inventoryServiceSource, name), /createAdminSupabaseClient\(\)/, `${name} should use service-role backend path`);
  }
});

test("purchase order row contract matches the database limit", () => {
  assert.match(validatorsSource, /inventoryPurchaseOrderRowsSchema[\s\S]*jsonArrayInput\(inventoryPurchaseOrderLineSchema, 100\)/);
  assert.match(validatorsSource, /inventoryPurchaseOrderReceiptRowsSchema[\s\S]*jsonArrayInput\(inventoryPurchaseOrderReceiptLineSchema, 100\)/);
  assert.match(hardeningMigration, /inventory_procurement/);
});

test("bootstrap script no longer presents stale schema.sql as inventory source of truth", () => {
  assert.doesNotMatch(packageJson, /Run supabase\/schema\.sql in the Supabase SQL editor/);
  assert.match(packageJson, /Supabase migrations as the bootstrap source/);
});
