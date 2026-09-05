import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildInventoryAlertCandidates, INVENTORY_ALERT_TYPES, type InventoryAlertCandidate, type InventoryAlertType } from "@/lib/inventory-alert-engine";
import { calculateRecipeCost, type InventoryCostStatus } from "@/lib/inventory-costing-engine";
import {
  buildInventoryFefoAllocationPlan,
  buildInventoryRollbackAllocations,
  type InventoryFefoStockInput
} from "@/lib/inventory-fefo-allocation-engine";
import { AppError } from "@/lib/response";
import { createAdminSupabaseClient, createScopedAdminSupabaseClient } from "@/lib/supabase/admin";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { ensureDefaultStoreBranch } from "@/services/branch-service";
import { writeOperationalEvent } from "@/services/operational-observability-service";
import type { DeliveryStatus, InventoryMovementType } from "@/types/domain";

type UntypedSupabase = {
  from: (table: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => any;
};

const inventoryActorHeader = "x-logivn-inventory-actor-id";

function createInventoryMutationSupabaseClient(actorUserId?: string | null) {
  if (!actorUserId) throw new AppError("Cần có người thực hiện để ghi nhận nghiệp vụ kho.", 400);
  return createScopedAdminSupabaseClient({ [inventoryActorHeader]: actorUserId });
}

export type InventoryCategory = {
  id: string;
  restaurantId: string;
  name: string;
};

export type InventoryIngredient = {
  id: string;
  restaurantId: string;
  categoryId: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit: string;
  onHandQuantity: number;
  minimumQuantity: number;
  referenceUnitCost: number;
  isActive: boolean;
  categoryName: string | null;
  storageArea: string;
  shelfCode: string;
  storageNote: string;
  reorderLeadDays: number;
};

export type InventoryRecipeLine = {
  id: string;
  menuItemId: string;
  ingredientId: string;
  ingredientName: string;
  ingredientUnit: string;
  quantityPerItem: number;
  wastePercent: number;
  referenceUnitCost: number;
  costPerItem: number;
};

export type InventoryRecipeMenuItem = {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
  categoryName: string;
  recipeLines: InventoryRecipeLine[];
  totalRecipeCost: number;
  recipeCostPercent: number;
  grossProfit: number;
  grossMarginPercent: number;
  costStatus: InventoryCostStatus;
  marginWarning: string | null;
};

export type InventorySnapshot = {
  schemaReady: boolean;
  ingredientCount: number;
  activeIngredientCount: number;
  lowStockCount: number;
  recipeReadyItemCount: number;
  menuItemCount: number;
  recipeCoveragePercent: number;
  openCountSessions: number;
  openAlertCount: number;
  wasteSpikeAlertCount: number;
  priceSpikeAlertCount: number;
  supplierDelayAlertCount: number;
  expiringBatchCount: number;
  openPurchaseOrderCount: number;
  totalReferenceValue: number;
  lowStockIngredients: Array<{
    id: string;
    name: string;
    unit: string;
    onHandQuantity: number;
    minimumQuantity: number;
    referenceUnitCost: number;
  }>;
  recentMovements: Array<{
    id: string;
    movementType: InventoryMovementType;
    quantityDelta: number;
    unitCost: number | null;
    sourceType: string;
    reason: string | null;
    createdAt: string;
    ingredientName: string;
    ingredientUnit: string;
  }>;
};

export type InventoryAiEconomicsSignal = {
  schemaReady: boolean;
  projectedPurchaseValue: number;
  weeklyUsageValue: number;
  reorderSuggestionCount: number;
  highReorderCount: number;
  topReorderSuggestion: InventoryReorderSuggestion | null;
  wasteSignalCount: number;
  topWasteSignal: InventoryWasteSignal | null;
  priceSignalCount: number;
  topPriceSignal: InventoryPriceSignal | null;
  highFoodCostItemCount: number;
  topHighFoodCostItem: {
    id: string;
    name: string;
    price: number;
    totalRecipeCost: number;
    recipeCostPercent: number;
  } | null;
};

export type InventoryActionPriority = "high" | "medium" | "low";

export type InventoryActionItem = {
  id: string;
  type: "reorder" | "waste" | "price" | "recipe" | "count";
  priority: InventoryActionPriority;
  title: string;
  detail: string;
  cta: string;
  valueLabel: string;
};

export type InventoryReorderSuggestion = {
  ingredientId: string;
  name: string;
  unit: string;
  onHandQuantity: number;
  minimumQuantity: number;
  dailyUsage: number;
  daysLeft: number | null;
  reorderQuantity: number;
  estimatedCost: number;
  urgency: InventoryActionPriority;
};

export type InventoryWasteSignal = {
  ingredientId: string;
  name: string;
  unit: string;
  wasteQuantity: number;
  wasteCost: number;
  movementCount: number;
};

export type InventoryPriceSignal = {
  ingredientId: string;
  name: string;
  latestUnitCost: number;
  previousUnitCost: number;
  changePercent: number;
};

export type InventoryIntelligence = {
  generatedAt: string;
  healthScore: number;
  aiBrief: string;
  projectedPurchaseValue: number;
  weeklyUsageValue: number;
  actionQueue: InventoryActionItem[];
  reorderSuggestions: InventoryReorderSuggestion[];
  wasteSignals: InventoryWasteSignal[];
  priceSignals: InventoryPriceSignal[];
};

export type InventoryLocation = {
  id: string;
  branchId: string | null;
  branchName: string | null;
  name: string;
  locationType: string;
  isPrimary: boolean;
};

export type InventorySupplier = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  defaultLeadDays: number;
  isPreferred: boolean;
  productCount: number;
};

export type InventoryPurchaseOrder = {
  id: string;
  poNumber: string;
  status: string;
  supplierName: string | null;
  totalAmount: number;
  expectedDeliveryAt: string | null;
  createdAt: string;
  lineCount: number;
  lines: InventoryPurchaseOrderLine[];
};

export type InventoryPurchaseOrderLine = {
  id: string;
  ingredientId: string;
  ingredientName: string;
  ingredientUnit: string;
  orderQuantity: number;
  receivedQuantity: number;
  remainingQuantity: number;
  orderUnit: string;
  unitCost: number;
  lineTotal: number;
  expirationDate: string | null;
  batchCode: string | null;
  note: string | null;
};

export type InventoryStockBalanceStatus = "available" | "low" | "out_of_stock" | "expired" | "pending_import";

export type InventoryStockBalance = {
  id: string;
  ingredientId: string;
  ingredientName: string;
  ingredientUnit: string;
  locationId: string | null;
  batchId: string | null;
  branchName: string | null;
  locationName: string | null;
  batchCode: string | null;
  expirationDate: string | null;
  onHandQuantity: number;
  reservedQuantity: number;
  incomingQuantity: number;
  availableQuantity: number;
  minimumQuantity: number;
  referenceUnitCost: number;
  status: InventoryStockBalanceStatus;
};

export type InventoryAlert = {
  id: string;
  alertType: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "acknowledged" | "resolved" | "dismissed";
  title: string;
  detail: string | null;
  detectedAt: string;
  ingredientName: string | null;
  branchName: string | null;
};

export type InventoryCountSession = {
  id: string;
  title: string;
  status: "draft" | "submitted" | "applied" | "cancelled";
  locationName: string | null;
  startedAt: string;
  appliedAt: string | null;
  lineCount: number;
  adjustedLineCount: number;
  totalAbsVariance: number;
  totalVarianceValue: number;
};

export type InventoryTransfer = {
  id: string;
  transferNumber: string;
  status: "draft" | "requested" | "approved" | "dispatched" | "received" | "cancelled";
  fromLocationId: string | null;
  toLocationId: string | null;
  fromLocationName: string | null;
  toLocationName: string | null;
  createdAt: string;
  lineCount: number;
  totalQuantity: number;
  dispatchedQuantity: number;
  receivedQuantity: number;
  varianceQuantity: number;
  lines: InventoryTransferLine[];
};

export type InventoryTransferLine = {
  id: string;
  ingredientId: string;
  ingredientName: string;
  unit: string;
  requestedQuantity: number;
  dispatchedQuantity: number;
  receivedQuantity: number;
  varianceQuantity: number;
};

export type InventoryWarehouseCommandCenter = {
  schemaReady: boolean;
  locationCount: number;
  supplierCount: number;
  purchaseOrderCount: number;
  openPurchaseOrderCount: number;
  stockBalanceCount: number;
  batchCount: number;
  expiringBatchCount: number;
  transferCount: number;
  countSessionCount: number;
  openAlertCount: number;
  locations: InventoryLocation[];
  suppliers: InventorySupplier[];
  purchaseOrders: InventoryPurchaseOrder[];
  stockBalances: InventoryStockBalance[];
  countSessions: InventoryCountSession[];
  transfers: InventoryTransfer[];
  alerts: InventoryAlert[];
};

type IngredientRow = {
  id: string;
  restaurant_id?: string;
  category_id?: string | null;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  unit: string;
  on_hand_quantity: number | string;
  minimum_quantity: number | string;
  reference_unit_cost: number | null;
  is_active?: boolean;
  metadata?: unknown;
  category?: { name: string } | { name: string }[] | null;
};

type RecipeRow = {
  menu_item_id: string | null;
};

type MovementRow = {
  id: string;
  movement_type: InventoryMovementType;
  quantity_delta: number | string;
  unit_cost: number | null;
  source_type: string;
  reason: string | null;
  created_at: string;
  ingredient: { name: string; unit: string } | { name: string; unit: string }[] | null;
};

type IntelligenceMovementRow = {
  ingredient_id: string;
  movement_type: InventoryMovementType;
  quantity_delta: number | string;
  unit_cost: number | null;
  created_at: string;
  ingredient: { name: string; unit: string; reference_unit_cost: number | null } | { name: string; unit: string; reference_unit_cost: number | null }[] | null;
};

type OrderItemInventoryRow = {
  menu_item_id: string;
  quantity: number | string;
};

type RecipeInventoryRow = {
  menu_item_id: string;
  ingredient_id: string;
  quantity_per_item: number | string;
  waste_percent: number | string | null;
};

type ExistingOrderMovementRow = {
  ingredient_id: string;
  branch_id: string | null;
  location_id: string | null;
  batch_id: string | null;
  quantity_delta: number | string;
  unit_cost: number | string | null;
  created_at: string;
};

type OrderStockBalanceRow = {
  ingredient_id: string;
  branch_id: string | null;
  location_id: string | null;
  batch_id: string | null;
  on_hand_quantity: number | string;
  reserved_quantity: number | string | null;
  batch:
    | {
        status: string | null;
        expiration_date: string | null;
        unit_cost: number | string | null;
        received_at?: string | null;
        created_at?: string | null;
      }
    | {
        status: string | null;
        expiration_date: string | null;
        unit_cost: number | string | null;
        received_at?: string | null;
        created_at?: string | null;
      }[]
    | null;
};

type RecipeMenuCategoryRow = {
  name: string;
  items?: Array<{
    id: string;
    name: string;
    price: number;
    is_available: boolean;
  }> | null;
};

type RecipeLineRow = {
  id: string;
  menu_item_id: string;
  ingredient_id: string;
  quantity_per_item: number | string;
  waste_percent: number | string | null;
  ingredient: { name: string; unit: string; reference_unit_cost: number } | { name: string; unit: string; reference_unit_cost: number }[] | null;
};

type LocationRow = {
  id: string;
  branch_id: string | null;
  name: string;
  location_type: string;
  is_primary: boolean;
  branch: { name: string } | { name: string }[] | null;
};

type SupplierRow = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  default_lead_days: number | null;
  is_preferred: boolean | null;
  items?: Array<{ id: string }> | null;
};

type PurchaseOrderRow = {
  id: string;
  po_number: string;
  status: string;
  total_amount: number | null;
  expected_delivery_at: string | null;
  created_at: string;
  supplier: { name: string } | { name: string }[] | null;
  lines?: Array<{
    id: string;
    ingredient_id: string;
    order_unit: string;
    order_quantity: number | string;
    received_quantity: number | string;
    unit_cost: number | string;
    line_total: number | string;
    expiration_date: string | null;
    batch_code: string | null;
    note: string | null;
    ingredient: { name: string; unit: string } | { name: string; unit: string }[] | null;
  }> | null;
};

type StockBalanceRow = {
  id: string;
  ingredient_id: string;
  location_id: string | null;
  batch_id: string | null;
  on_hand_quantity: number | string;
  reserved_quantity: number | string;
  incoming_quantity: number | string;
  counted_at?: string | null;
  updated_at?: string | null;
  ingredient:
    | { name: string; unit: string; minimum_quantity: number | string; reference_unit_cost: number | string | null }
    | { name: string; unit: string; minimum_quantity: number | string; reference_unit_cost: number | string | null }[]
    | null;
  location: { name: string } | { name: string }[] | null;
  branch: { name: string } | { name: string }[] | null;
  batch:
    | { batch_code: string | null; expiration_date: string | null; status: string; unit_cost: number | string | null }
    | { batch_code: string | null; expiration_date: string | null; status: string; unit_cost: number | string | null }[]
    | null;
};

type InventoryAlertRow = {
  id: string;
  alert_type: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "acknowledged" | "resolved" | "dismissed";
  title: string;
  detail: string | null;
  detected_at: string;
  ingredient: { name: string } | { name: string }[] | null;
  branch: { name: string } | { name: string }[] | null;
};

type ExistingInventoryAlertRow = {
  id: string;
  alert_type: string;
  source_id: string | null;
  status: "open" | "acknowledged";
};

type AlertBatchRow = {
  id: string;
  ingredient_id: string;
  batch_code: string | null;
  expiration_date: string | null;
  remaining_quantity: number | string;
  unit_cost: number | string | null;
  status: string | null;
  ingredient: { name: string; unit: string } | { name: string; unit: string }[] | null;
};

type AlertMovementRow = {
  id: string;
  ingredient_id: string;
  branch_id: string | null;
  location_id?: string | null;
  batch_id?: string | null;
  movement_type: string;
  quantity_delta: number | string;
  unit_cost: number | string | null;
  created_at: string;
  ingredient:
    | { name: string; unit: string; reference_unit_cost: number | string | null }
    | { name: string; unit: string; reference_unit_cost: number | string | null }[]
    | null;
};

type AlertPurchaseOrderRow = {
  id: string;
  branch_id: string | null;
  po_number: string;
  status: string;
  expected_delivery_at: string | null;
  total_amount: number | string | null;
  supplier: { name: string } | { name: string }[] | null;
  lines?: Array<{
    ingredient_id: string;
    ingredient: { name: string } | { name: string }[] | null;
  }> | null;
};

type AlertIngredientRow = {
  id: string;
  name: string;
  unit: string;
  on_hand_quantity: number | string;
  minimum_quantity: number | string;
};

type AlertMenuItemRow = {
  id: string;
  name: string;
  is_available: boolean;
};

type AlertRecipeRow = {
  menu_item_id: string;
};

type InventoryCountRow = {
  id: string;
  title: string;
  status: "draft" | "submitted" | "applied" | "cancelled";
  location_id: string | null;
  started_at: string;
  applied_at: string | null;
  metadata: unknown;
  location: { name: string } | { name: string }[] | null;
  lines?: Array<{
    id: string;
    variance_quantity: number | string | null;
    ingredient: { reference_unit_cost: number | null } | { reference_unit_cost: number | null }[] | null;
  }> | null;
};

type BranchTransferRow = {
  id: string;
  transfer_number: string;
  status: "draft" | "requested" | "approved" | "dispatched" | "received" | "cancelled";
  from_location_id: string | null;
  to_location_id: string | null;
  created_at: string;
  metadata: unknown;
  lines?: Array<{
    id: string;
    ingredient_id: string;
    unit: string;
    requested_quantity: number | string;
    dispatched_quantity: number | string;
    received_quantity: number | string;
    ingredient: { name: string } | { name: string }[] | null;
  }> | null;
};

export type InventoryOrderSyncResult = {
  schemaReady: boolean;
  movementCount: number;
  allocatedQuantity?: number;
  shortageCount?: number;
  allocationMode?: "legacy" | "fefo";
  skippedReason?: "schema_missing" | "no_items" | "no_recipes" | "already_synced";
};

type InventoryOrderAllocationRpcInput = {
  ingredientId: string;
  quantity: number;
  unitCost: number | null;
  branchId: string | null;
  locationId: string | null;
  batchId: string | null;
  allocationIndex: number;
};

type InventoryOrderAllocationPlanResult = {
  schemaReady: boolean;
  allocations: InventoryOrderAllocationRpcInput[];
  allocatedQuantity: number;
  skippedReason?: InventoryOrderSyncResult["skippedReason"];
};

type InventoryAcceptOrderInput = {
  orderId: string;
  actorUserId?: string | null;
  serviceDueAt?: string | null;
  deliveryStatus?: DeliveryStatus | null;
};

type InventoryCancelOrderInput = {
  orderId: string;
  actorUserId?: string | null;
};

export type InventoryImportRowInput = {
  name: string;
  unit: string;
  quantity: number;
  minimumQuantity: number;
  referenceUnitCost: number;
  categoryName?: string;
};

export type InventoryImportResult = {
  inserted: number;
  updated: number;
  movements: number;
  skipped: number;
};

export type InventorySupplierInput = {
  name: string;
  phone?: string;
  address?: string;
  defaultLeadDays?: number;
  isPreferred?: boolean;
  actorUserId: string;
};

export type InventoryPurchaseOrderLineInput = {
  ingredientId: string;
  orderQuantity: number;
  orderUnit?: string;
  unitCost: number;
  expirationDate?: string;
  batchCode?: string;
  note?: string;
};

export type InventoryPurchaseOrderInput = {
  supplierId?: string | null;
  locationId?: string | null;
  expectedDeliveryAt?: string | null;
  note?: string;
  actorUserId: string;
  lines: InventoryPurchaseOrderLineInput[];
};

export type InventoryPurchaseOrderReceiptResult = {
  purchaseOrderId: string;
  poNumber: string;
  status: string;
  receivedLines: number;
  receivedQuantity: number;
  receivedValue: number;
};

export type InventoryPurchaseOrderReceiptLineInput = {
  purchaseOrderLineId: string;
  receivedQuantity: number;
  unitCost?: number;
  expirationDate?: string;
  batchCode?: string;
  note?: string;
};

export type InventoryAlertRefreshResult = {
  created: number;
  updated: number;
  resolved: number;
  scanned: number;
};

export type InventoryCountLineInput = {
  ingredientId: string;
  countedQuantity: number;
  locationId?: string | null;
  note?: string;
};

export type InventoryCountInput = {
  title?: string;
  locationId?: string | null;
  note?: string;
  actorUserId: string;
  lines: InventoryCountLineInput[];
};

export type InventoryCountApplyResult = {
  countId: string;
  title: string;
  lineCount: number;
  adjustedLineCount: number;
  totalAbsVariance: number;
  totalVarianceValue: number;
};

export type InventoryTransferLineInput = {
  ingredientId: string;
  quantity: number;
  unit?: string;
  batchId?: string | null;
  note?: string;
};

export type InventoryTransferInput = {
  fromLocationId: string;
  toLocationId: string;
  note?: string;
  actorUserId: string;
  lines: InventoryTransferLineInput[];
};

export type InventoryTransferResult = {
  transferId: string;
  transferNumber: string;
  status?: InventoryTransfer["status"];
  lineCount: number;
  totalQuantity: number;
  movementCount?: number;
  skippedReason?: string;
};

export type InventoryTransferWorkflowAction = "approve" | "dispatch" | "receive" | "cancel";

export type InventoryTransferReceiveLineInput = {
  lineId: string;
  receivedQuantity: number;
  note?: string;
};

const emptyInventorySnapshot: InventorySnapshot = {
  schemaReady: false,
  ingredientCount: 0,
  activeIngredientCount: 0,
  lowStockCount: 0,
  recipeReadyItemCount: 0,
  menuItemCount: 0,
  recipeCoveragePercent: 0,
  openCountSessions: 0,
  openAlertCount: 0,
  wasteSpikeAlertCount: 0,
  priceSpikeAlertCount: 0,
  supplierDelayAlertCount: 0,
  expiringBatchCount: 0,
  openPurchaseOrderCount: 0,
  totalReferenceValue: 0,
  lowStockIngredients: [],
  recentMovements: []
};

const inventorySnapshotCache = new Map<string, { expiresAt: number; value: InventorySnapshot }>();
const inventorySnapshotCacheTtlMs = 8_000;

function readCachedInventorySnapshot(restaurantId: string) {
  const cached = inventorySnapshotCache.get(restaurantId);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    inventorySnapshotCache.delete(restaurantId);
    return null;
  }
  return cached.value;
}

function writeCachedInventorySnapshot(restaurantId: string, value: InventorySnapshot) {
  inventorySnapshotCache.set(restaurantId, {
    value,
    expiresAt: Date.now() + inventorySnapshotCacheTtlMs
  });
}

export function invalidateInventorySnapshotCache(restaurantId: string) {
  inventorySnapshotCache.delete(restaurantId);
}

const emptyInventoryAiEconomicsSignal: InventoryAiEconomicsSignal = {
  schemaReady: false,
  projectedPurchaseValue: 0,
  weeklyUsageValue: 0,
  reorderSuggestionCount: 0,
  highReorderCount: 0,
  topReorderSuggestion: null,
  wasteSignalCount: 0,
  topWasteSignal: null,
  priceSignalCount: 0,
  topPriceSignal: null,
  highFoodCostItemCount: 0,
  topHighFoodCostItem: null
};

const emptyWarehouseCommandCenter: InventoryWarehouseCommandCenter = {
  schemaReady: false,
  locationCount: 0,
  supplierCount: 0,
  purchaseOrderCount: 0,
  openPurchaseOrderCount: 0,
  stockBalanceCount: 0,
  batchCount: 0,
  expiringBatchCount: 0,
  transferCount: 0,
  countSessionCount: 0,
  openAlertCount: 0,
  locations: [],
  suppliers: [],
  purchaseOrders: [],
  stockBalances: [],
  countSessions: [],
  transfers: [],
  alerts: []
};

const inventoryMutationError = "Không thể cập nhật kho hàng lúc này.";

function isMissingInventorySchemaError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST202" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    /ingredient|inventory|recipe|supplier|purchase_order|stock_balance|branch_transfer|batch|location|alert|Could not find|does not exist/i.test(
      error.message ?? ""
    )
  );
}

function numberValue(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstOrNull<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function metadataObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function metadataText(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

function metadataInteger(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function metadataNumber(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildIngredientMetadata(input: {
  storageArea?: string;
  shelfCode?: string;
  storageNote?: string;
  reorderLeadDays?: number;
}) {
  return {
    storageArea: input.storageArea?.trim() ?? "",
    shelfCode: input.shelfCode?.trim() ?? "",
    storageNote: input.storageNote?.trim() ?? "",
    reorderLeadDays: Math.max(0, Math.round(input.reorderLeadDays ?? 0))
  };
}

function mapIngredient(row: IngredientRow): InventoryIngredient {
  const category = firstOrNull(row.category);
  const metadata = metadataObject(row.metadata);
  return {
    id: row.id,
    restaurantId: row.restaurant_id ?? "",
    categoryId: row.category_id ?? null,
    name: row.name,
    sku: row.sku ?? null,
    barcode: row.barcode ?? null,
    unit: row.unit,
    onHandQuantity: numberValue(row.on_hand_quantity),
    minimumQuantity: numberValue(row.minimum_quantity),
    referenceUnitCost: Number(row.reference_unit_cost ?? 0),
    isActive: row.is_active ?? true,
    categoryName: category?.name ?? null,
    storageArea: metadataText(metadata, "storageArea"),
    shelfCode: metadataText(metadata, "shelfCode"),
    storageNote: metadataText(metadata, "storageNote"),
    reorderLeadDays: metadataInteger(metadata, "reorderLeadDays")
  };
}

function signedMovementQuantity(type: InventoryMovementType, quantity: number) {
  if (
    type === "adjust_decrease" ||
    type === "waste" ||
    type === "deduct_sale" ||
    type === "expired" ||
    type === "internal_use" ||
    type === "supplier_return" ||
    type === "transfer_out"
  ) {
    return -Math.abs(quantity);
  }
  return Math.abs(quantity);
}

function isWasteSignalMovement(type: InventoryMovementType) {
  return type === "waste" || type === "expired";
}

function isDuplicateInventoryMovementError(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "23505" || /inventory_movements_order_.*_unique/i.test(error?.message ?? "");
}

function aggregateRecipeDemand(items: OrderItemInventoryRow[], recipes: RecipeInventoryRow[]) {
  const itemQuantities = new Map<string, number>();
  for (const item of items) {
    itemQuantities.set(item.menu_item_id, (itemQuantities.get(item.menu_item_id) ?? 0) + numberValue(item.quantity));
  }

  const demandByIngredient = new Map<string, number>();
  for (const recipe of recipes) {
    const orderedQuantity = itemQuantities.get(recipe.menu_item_id) ?? 0;
    const wasteMultiplier = 1 + numberValue(recipe.waste_percent) / 100;
    const demand = orderedQuantity * numberValue(recipe.quantity_per_item) * wasteMultiplier;
    if (demand > 0) {
      demandByIngredient.set(recipe.ingredient_id, (demandByIngredient.get(recipe.ingredient_id) ?? 0) + demand);
    }
  }

  return demandByIngredient;
}

function priorityRank(priority: InventoryActionPriority) {
  if (priority === "high") return 0;
  if (priority === "medium") return 1;
  return 2;
}

function formatCompactQuantity(value: number, unit: string) {
  return `${Number(value.toFixed(2)).toLocaleString("vi-VN")} ${unit}`;
}

function formatCompactVnd(value: number) {
  return `${Math.max(0, Math.round(value)).toLocaleString("vi-VN")}đ`;
}

function inventoryAlertKey(input: { alertType: string; sourceId: string | null }) {
  return `${input.alertType}:${input.sourceId ?? "none"}`;
}

function optionalIsoTimestamp(value?: string | null) {
  if (!value?.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function stockBalanceStatus(input: {
  availableQuantity: number;
  minimumQuantity: number;
  incomingQuantity: number;
  expirationDate: string | null;
  batchStatus: string | null;
}): InventoryStockBalanceStatus {
  if (input.batchStatus === "expired") return "expired";
  if (input.expirationDate && new Date(input.expirationDate).getTime() < Date.now()) return "expired";
  if (input.availableQuantity <= 0 && input.incomingQuantity > 0) return "pending_import";
  if (input.availableQuantity <= 0) return "out_of_stock";
  if (input.minimumQuantity > 0 && input.availableQuantity <= input.minimumQuantity) return "low";
  return "available";
}

function isOpenPurchaseOrder(status: string) {
  return ["draft", "pending", "approved", "ordered", "partially_delivered"].includes(status);
}

function reorderPriority(daysLeft: number | null, onHandQuantity: number, minimumQuantity: number, leadDays = 0): InventoryActionPriority {
  if (minimumQuantity > 0 && onHandQuantity <= minimumQuantity) return "high";
  if (daysLeft !== null && daysLeft <= Math.max(2, leadDays)) return "high";
  if (daysLeft !== null && daysLeft <= Math.max(5, leadDays + 2)) return "medium";
  return "low";
}

function buildInventoryBrief(input: {
  healthScore: number;
  reorderCount: number;
  wasteCount: number;
  priceCount: number;
  recipeGap: number;
}) {
  const parts = [`Sức khỏe kho ${input.healthScore}/100.`];
  if (input.reorderCount > 0) parts.push(`Có ${input.reorderCount} nguyên liệu nên mua.`);
  if (input.wasteCount > 0) parts.push(`${input.wasteCount} tín hiệu hao hụt cần xem.`);
  if (input.priceCount > 0) parts.push(`${input.priceCount} giá nhập biến động.`);
  if (input.recipeGap > 0) parts.push(`${input.recipeGap} món chưa có định mức.`);
  if (parts.length === 1) parts.push("Không có cảnh báo lớn, ưu tiên kiểm kê định kỳ và hoàn thiện định mức.");
  return parts.join(" ");
}

function countInventoryAlertsByType(rows: Array<{ alert_type?: string | null }>, type: InventoryAlertType) {
  return rows.filter((row) => row.alert_type === type).length;
}

async function applyOrderInventoryMovement(
  db: UntypedSupabase,
  restaurantId: string,
  input: {
    ingredientId: string;
    movementType: "deduct_sale" | "rollback";
    quantityDelta: number;
    unitCost?: number | null;
    branchId?: string | null;
    locationId?: string | null;
    batchId?: string | null;
    orderId: string;
    reason: string;
    metadata?: Record<string, unknown>;
    actorUserId?: string | null;
  }
) {
  const { data, error } = await db.rpc("apply_inventory_movement", {
    target_restaurant_id: restaurantId,
    target_ingredient_id: input.ingredientId,
    target_movement_type: input.movementType,
    target_quantity_delta: input.quantityDelta,
    target_unit_cost: input.unitCost ?? null,
    target_source_type: "order",
    target_source_id: input.orderId,
    target_reason: input.reason,
    target_actor_user_id: input.actorUserId ?? null,
    target_metadata: { orderId: input.orderId, ...(input.metadata ?? {}) },
    target_branch_id: input.branchId ?? null,
    target_location_id: input.locationId ?? null,
    target_batch_id: input.batchId ?? null,
    target_purchase_order_id: null,
    target_transfer_id: null
  });

  if (isDuplicateInventoryMovementError(error)) return null;
  if (error?.message?.includes("stock negative") || error?.message?.includes("batch negative") || error?.message?.includes("balance is missing")) {
    throw new AppError("Tồn kho không đủ để xác nhận đơn. Hãy nhập thêm hàng hoặc điều chỉnh công thức.", 400);
  }
  throwIfSupabaseError(error);
  return data;
}

async function buildOrderInventoryAllocationPlan(
  db: UntypedSupabase,
  restaurantId: string,
  orderId: string
): Promise<InventoryOrderAllocationPlanResult> {
  const [itemsResult, orderResult] = await Promise.all([
    db.from("order_items").select("menu_item_id,quantity").eq("order_id", orderId),
    db.from("orders").select("branch_id").eq("id", orderId).eq("restaurant_id", restaurantId).maybeSingle()
  ]);
  throwIfSupabaseError(itemsResult.error);
  throwIfSupabaseError(orderResult.error);
  const items = (itemsResult.data ?? []) as OrderItemInventoryRow[];
  if (items.length === 0) {
    return { schemaReady: true, allocations: [], allocatedQuantity: 0, skippedReason: "no_items" };
  }

  const menuItemIds = [...new Set(items.map((item) => item.menu_item_id))];
  const recipesResult = await db
    .from("menu_item_recipes")
    .select("menu_item_id,ingredient_id,quantity_per_item,waste_percent")
    .eq("restaurant_id", restaurantId)
    .in("menu_item_id", menuItemIds);

  if (isMissingInventorySchemaError(recipesResult.error)) {
    return { schemaReady: false, allocations: [], allocatedQuantity: 0, skippedReason: "schema_missing" };
  }
  throwIfSupabaseError(recipesResult.error);

  const demandByIngredient = aggregateRecipeDemand(items, (recipesResult.data ?? []) as RecipeInventoryRow[]);
  if (demandByIngredient.size === 0) {
    return { schemaReady: true, allocations: [], allocatedQuantity: 0, skippedReason: "no_recipes" };
  }

  const ingredientIds = [...demandByIngredient.keys()];
  let stockQuery = db
    .from("stock_balances")
    .select(
      "ingredient_id,branch_id,location_id,batch_id,on_hand_quantity,reserved_quantity,batch:inventory_batches(status,expiration_date,unit_cost,received_at,created_at)"
    )
    .eq("restaurant_id", restaurantId)
    .in("ingredient_id", ingredientIds);
  stockQuery = orderResult.data?.branch_id
    ? stockQuery.eq("branch_id", orderResult.data.branch_id)
    : stockQuery.is("branch_id", null);
  const stockResult = await stockQuery.gt("on_hand_quantity", 0);

  if (isMissingInventorySchemaError(stockResult.error)) {
    return { schemaReady: false, allocations: [], allocatedQuantity: 0, skippedReason: "schema_missing" };
  }
  throwIfSupabaseError(stockResult.error);

  const allocationPlan = buildInventoryFefoAllocationPlan({
    demands: ingredientIds.map((ingredientId) => ({
      ingredientId,
      quantity: demandByIngredient.get(ingredientId) ?? 0
    })),
    stock: ((stockResult.data ?? []) as OrderStockBalanceRow[]).map(mapOrderStockBalance)
  });

  if (allocationPlan.shortages.length > 0) {
    throw new AppError(formatInventoryShortageMessage(allocationPlan.shortages), 400);
  }

  return {
    schemaReady: true,
    allocatedQuantity: allocationPlan.allocatedQuantity,
    allocations: allocationPlan.allocations.map((allocation) => ({
      ingredientId: allocation.ingredientId,
      quantity: allocation.quantity,
      unitCost: allocation.unitCost,
      branchId: allocation.branchId,
      locationId: allocation.locationId,
      batchId: allocation.batchId,
      allocationIndex: allocation.allocationIndex
    })).sort((left, right) =>
      `${left.ingredientId}:${left.branchId ?? "global"}:${left.locationId ?? "global"}:${left.batchId ?? "no-batch"}`
        .localeCompare(`${right.ingredientId}:${right.branchId ?? "global"}:${right.locationId ?? "global"}:${right.batchId ?? "no-batch"}`)
    )
  };
}

function mapOrderStockBalance(row: OrderStockBalanceRow): InventoryFefoStockInput {
  const batch = firstOrNull(row.batch);
  return {
    ingredientId: row.ingredient_id,
    batchId: row.batch_id ?? null,
    locationId: row.location_id ?? null,
    branchId: row.branch_id ?? null,
    availableQuantity: Math.max(0, numberValue(row.on_hand_quantity) - numberValue(row.reserved_quantity ?? 0)),
    expirationDate: batch?.expiration_date ?? null,
    batchStatus: batch?.status ?? null,
    unitCost: batch?.unit_cost == null ? null : numberValue(batch.unit_cost),
    receivedAt: batch?.received_at ?? null,
    createdAt: batch?.created_at ?? null
  };
}

function formatInventoryShortageMessage(shortages: Array<{ ingredientId: string; shortageQuantity: number }>) {
  const preview = shortages
    .slice(0, 3)
    .map((shortage) => `${shortage.ingredientId}: thiếu ${shortage.shortageQuantity}`)
    .join("; ");
  return `Tồn kho không đủ để xác nhận đơn theo FEFO.${preview ? ` ${preview}.` : ""}`;
}

export async function getInventorySnapshot(restaurantId: string): Promise<InventorySnapshot> {
  const cached = readCachedInventorySnapshot(restaurantId);
  if (cached) return cached;

  const supabase = await createServerSupabaseClient();
  const db = supabase as unknown as UntypedSupabase;
  const expiryCutoff = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [
    ingredientCountResult,
    activeIngredientCountResult,
    lowStockResult,
    stockValueResult,
    recipeRowsResult,
    menuItemCountResult,
    openCountSessionsResult,
    recentMovementsResult,
    openAlertsResult,
    expiringBatchCountResult,
    openPurchaseOrderCountResult
  ] = await Promise.all([
    db.from("ingredients").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId),
    db.from("ingredients").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("is_active", true),
    db
      .from("ingredients")
      .select("id,name,unit,on_hand_quantity,minimum_quantity,reference_unit_cost")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .gt("minimum_quantity", 0)
      .order("on_hand_quantity", { ascending: true })
      .limit(100),
    db
      .from("ingredients")
      .select("id,on_hand_quantity,reference_unit_cost")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .limit(5000),
    db.from("menu_item_recipes").select("menu_item_id").eq("restaurant_id", restaurantId).limit(3000),
    db.from("menu_items").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId),
    db
      .from("inventory_counts")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .in("status", ["draft", "submitted"]),
    db
      .from("inventory_movements")
      .select("id,movement_type,quantity_delta,unit_cost,source_type,reason,created_at,ingredient:ingredients(name,unit)")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(8),
    db
      .from("inventory_alerts")
      .select("alert_type,severity,status")
      .eq("restaurant_id", restaurantId)
      .in("status", ["open", "acknowledged"])
      .limit(1000),
    db
      .from("inventory_batches")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .gt("remaining_quantity", 0)
      .lte("expiration_date", expiryCutoff)
      .in("status", ["active", "quarantined", "expired"]),
    db
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .in("status", ["draft", "pending", "approved", "ordered", "partially_delivered"])
  ]);

  const results = [
    ingredientCountResult,
    activeIngredientCountResult,
    lowStockResult,
    stockValueResult,
    recipeRowsResult,
    menuItemCountResult,
    openCountSessionsResult,
    recentMovementsResult,
    openAlertsResult,
    expiringBatchCountResult,
    openPurchaseOrderCountResult
  ];
  const missingSchema = results.some((result) => isMissingInventorySchemaError(result.error));
  if (missingSchema) {
    writeCachedInventorySnapshot(restaurantId, emptyInventorySnapshot);
    return emptyInventorySnapshot;
  }

  for (const result of results) {
    throwIfSupabaseError(result.error);
  }

  const lowStockIngredients = ((lowStockResult.data ?? []) as IngredientRow[])
    .filter((ingredient) => numberValue(ingredient.on_hand_quantity) <= numberValue(ingredient.minimum_quantity))
    .map((ingredient) => ({
      id: ingredient.id,
      name: ingredient.name,
      unit: ingredient.unit,
      onHandQuantity: numberValue(ingredient.on_hand_quantity),
      minimumQuantity: numberValue(ingredient.minimum_quantity),
      referenceUnitCost: Number(ingredient.reference_unit_cost ?? 0)
    }));
  const recipeReadyItemIds = new Set(
    ((recipeRowsResult.data ?? []) as RecipeRow[])
      .map((row) => row.menu_item_id)
      .filter((id): id is string => Boolean(id))
  );
  const menuItemCount = menuItemCountResult.count ?? 0;
  const recentMovements = ((recentMovementsResult.data ?? []) as MovementRow[]).map((movement) => {
    const ingredient = firstOrNull(movement.ingredient);
    return {
      id: movement.id,
      movementType: movement.movement_type,
      quantityDelta: numberValue(movement.quantity_delta),
      unitCost: movement.unit_cost,
      sourceType: movement.source_type,
      reason: movement.reason,
      createdAt: movement.created_at,
      ingredientName: ingredient?.name ?? "Nguyen lieu",
      ingredientUnit: ingredient?.unit ?? "unit"
    };
  });
  const totalReferenceValue = ((stockValueResult.data ?? []) as IngredientRow[]).reduce(
    (sum, ingredient) => sum + numberValue(ingredient.on_hand_quantity) * Number(ingredient.reference_unit_cost ?? 0),
    0
  );
  const openAlerts = (openAlertsResult.data ?? []) as Array<{ alert_type?: string | null }>;

  const snapshot = {
    schemaReady: true,
    ingredientCount: ingredientCountResult.count ?? 0,
    activeIngredientCount: activeIngredientCountResult.count ?? 0,
    lowStockCount: lowStockIngredients.length,
    recipeReadyItemCount: recipeReadyItemIds.size,
    menuItemCount,
    recipeCoveragePercent: menuItemCount > 0 ? Math.round((recipeReadyItemIds.size / menuItemCount) * 100) : 0,
    openCountSessions: openCountSessionsResult.count ?? 0,
    openAlertCount: openAlerts.length,
    wasteSpikeAlertCount: countInventoryAlertsByType(openAlerts, "waste_spike"),
    priceSpikeAlertCount: countInventoryAlertsByType(openAlerts, "price_spike"),
    supplierDelayAlertCount: countInventoryAlertsByType(openAlerts, "supplier_delay"),
    expiringBatchCount: expiringBatchCountResult.count ?? 0,
    openPurchaseOrderCount: openPurchaseOrderCountResult.count ?? 0,
    totalReferenceValue: Math.round(totalReferenceValue),
    lowStockIngredients,
    recentMovements
  };

  writeCachedInventorySnapshot(restaurantId, snapshot);
  return snapshot;
}

export async function listInventoryCategories(restaurantId: string): Promise<InventoryCategory[]> {
  const supabase = await createServerSupabaseClient();
  const db = supabase as unknown as UntypedSupabase;
  const { data, error } = await db
    .from("ingredient_categories")
    .select("id,restaurant_id,name")
    .eq("restaurant_id", restaurantId)
    .order("name", { ascending: true });

  if (isMissingInventorySchemaError(error)) return [];
  throwIfSupabaseError(error);
  return (data ?? []).map((row: { id: string; restaurant_id: string; name: string }) => ({
    id: row.id,
    restaurantId: row.restaurant_id,
    name: row.name
  }));
}

export async function listInventoryIngredients(restaurantId: string): Promise<InventoryIngredient[]> {
  const supabase = await createServerSupabaseClient();
  const db = supabase as unknown as UntypedSupabase;
  const { data, error } = await db
    .from("ingredients")
    .select("id,restaurant_id,category_id,name,sku,barcode,unit,on_hand_quantity,minimum_quantity,reference_unit_cost,is_active,metadata,category:ingredient_categories(name)")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (isMissingInventorySchemaError(error)) return [];
  throwIfSupabaseError(error);
  return ((data ?? []) as IngredientRow[]).map(mapIngredient);
}

export async function listInventoryRecipeMenuItems(restaurantId: string): Promise<InventoryRecipeMenuItem[]> {
  const supabase = await createServerSupabaseClient();
  const db = supabase as unknown as UntypedSupabase;

  const [menuResult, recipeResult] = await Promise.all([
    db
      .from("menu_categories")
      .select("name,items:menu_items(id,name,price,is_available)")
      .eq("restaurant_id", restaurantId)
      .order("name", { ascending: true })
      .order("name", { referencedTable: "menu_items", ascending: true }),
    db
      .from("menu_item_recipes")
      .select("id,menu_item_id,ingredient_id,quantity_per_item,waste_percent,ingredient:ingredients(name,unit,reference_unit_cost)")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: true })
  ]);

  if (isMissingInventorySchemaError(recipeResult.error)) return [];
  throwIfSupabaseError(menuResult.error);
  throwIfSupabaseError(recipeResult.error);

  const linesByMenuItem = new Map<string, InventoryRecipeLine[]>();
  for (const row of (recipeResult.data ?? []) as RecipeLineRow[]) {
    const ingredient = firstOrNull(row.ingredient);
    const quantityPerItem = numberValue(row.quantity_per_item);
    const wastePercent = numberValue(row.waste_percent);
    const referenceUnitCost = Number(ingredient?.reference_unit_cost ?? 0);
    const costPerItem = quantityPerItem * (1 + wastePercent / 100) * referenceUnitCost;
    const line: InventoryRecipeLine = {
      id: row.id,
      menuItemId: row.menu_item_id,
      ingredientId: row.ingredient_id,
      ingredientName: ingredient?.name ?? "Nguyen lieu",
      ingredientUnit: ingredient?.unit ?? "unit",
      quantityPerItem,
      wastePercent,
      referenceUnitCost,
      costPerItem
    };
    linesByMenuItem.set(row.menu_item_id, [...(linesByMenuItem.get(row.menu_item_id) ?? []), line]);
  }

  return ((menuResult.data ?? []) as RecipeMenuCategoryRow[]).flatMap((category) =>
    (category.items ?? []).map((item) => {
      const recipeLines = linesByMenuItem.get(item.id) ?? [];
      const costSummary = calculateRecipeCost({
        price: item.price,
        lines: recipeLines.map((line) => ({
          quantityPerItem: line.quantityPerItem,
          wastePercent: line.wastePercent,
          referenceUnitCost: line.referenceUnitCost
        }))
      });
      return {
        id: item.id,
        name: item.name,
        price: item.price,
        isAvailable: item.is_available,
        categoryName: category.name,
        recipeLines,
        totalRecipeCost: costSummary.totalRecipeCost,
        recipeCostPercent: costSummary.recipeCostPercent,
        grossProfit: costSummary.grossProfit,
        grossMarginPercent: costSummary.grossMarginPercent,
        costStatus: costSummary.costStatus,
        marginWarning: costSummary.marginWarning
      };
    })
  );
}

export async function getInventoryIntelligence(
  restaurantId: string,
  snapshot?: InventorySnapshot,
  ingredientsInput?: InventoryIngredient[]
): Promise<InventoryIntelligence> {
  const supabase = await createServerSupabaseClient();
  const db = supabase as unknown as UntypedSupabase;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [ingredientsResult, movementsResult] = await Promise.all([
    ingredientsInput
      ? Promise.resolve({ data: null, error: null })
      : db
          .from("ingredients")
          .select("id,restaurant_id,category_id,name,sku,barcode,unit,on_hand_quantity,minimum_quantity,reference_unit_cost,is_active,metadata,category:ingredient_categories(name)")
          .eq("restaurant_id", restaurantId)
          .eq("is_active", true)
          .order("name", { ascending: true }),
    db
      .from("inventory_movements")
      .select("ingredient_id,movement_type,quantity_delta,unit_cost,created_at,ingredient:ingredients(name,unit,reference_unit_cost)")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(3000)
  ]);

  if (isMissingInventorySchemaError(ingredientsResult.error) || isMissingInventorySchemaError(movementsResult.error)) {
    return {
      generatedAt: new Date().toISOString(),
      healthScore: 0,
      aiBrief: "Kho chưa sẵn sàng để tạo intelligence.",
      projectedPurchaseValue: 0,
      weeklyUsageValue: 0,
      actionQueue: [],
      reorderSuggestions: [],
      wasteSignals: [],
      priceSignals: []
    };
  }
  throwIfSupabaseError(ingredientsResult.error);
  throwIfSupabaseError(movementsResult.error);

  const ingredients = ingredientsInput ?? ((ingredientsResult.data ?? []) as IngredientRow[]).map(mapIngredient);
  const movements = (movementsResult.data ?? []) as IntelligenceMovementRow[];
  const usageByIngredient = new Map<string, number>();
  const wasteByIngredient = new Map<string, { quantity: number; cost: number; count: number; name: string; unit: string }>();
  const receiveCostsByIngredient = new Map<string, Array<{ cost: number; createdAt: string; name: string }>>();
  let weeklyUsageValue = 0;

  for (const movement of movements) {
    const quantity = numberValue(movement.quantity_delta);
    const absQuantity = Math.abs(quantity);
    const ingredient = firstOrNull(movement.ingredient);
    const referenceUnitCost = Number(ingredient?.reference_unit_cost ?? 0);
    const unitCost = movement.unit_cost ?? referenceUnitCost;

    if (quantity < 0) {
      usageByIngredient.set(movement.ingredient_id, (usageByIngredient.get(movement.ingredient_id) ?? 0) + absQuantity);
      weeklyUsageValue += (absQuantity * unitCost) / Math.max(1, 30 / 7);
    }

    if (isWasteSignalMovement(movement.movement_type)) {
      const current = wasteByIngredient.get(movement.ingredient_id) ?? {
        quantity: 0,
        cost: 0,
        count: 0,
        name: ingredient?.name ?? "Nguyen lieu",
        unit: ingredient?.unit ?? "unit"
      };
      current.quantity += absQuantity;
      current.cost += absQuantity * unitCost;
      current.count += 1;
      wasteByIngredient.set(movement.ingredient_id, current);
    }

    if (movement.movement_type === "receive" && movement.unit_cost && movement.unit_cost > 0) {
      const list = receiveCostsByIngredient.get(movement.ingredient_id) ?? [];
      list.push({
        cost: movement.unit_cost,
        createdAt: movement.created_at,
        name: ingredient?.name ?? "Nguyen lieu"
      });
      receiveCostsByIngredient.set(movement.ingredient_id, list);
    }
  }

  const reorderSuggestions = ingredients
    .map((ingredient) => {
      const monthlyUsage = usageByIngredient.get(ingredient.id) ?? 0;
      const dailyUsage = monthlyUsage / 30;
      const daysLeft = dailyUsage > 0 ? ingredient.onHandQuantity / dailyUsage : null;
      const targetQuantity = Math.max(ingredient.minimumQuantity * 1.5, dailyUsage * Math.max(7, ingredient.reorderLeadDays + 3));
      const shortageQuantity = Math.max(0, ingredient.minimumQuantity - ingredient.onHandQuantity);
      const reorderQuantity = Math.max(shortageQuantity, targetQuantity - ingredient.onHandQuantity, 0);
      const urgency = reorderPriority(daysLeft, ingredient.onHandQuantity, ingredient.minimumQuantity, ingredient.reorderLeadDays);
      if (reorderQuantity <= 0 && urgency === "low") return null;

      return {
        ingredientId: ingredient.id,
        name: ingredient.name,
        unit: ingredient.unit,
        onHandQuantity: ingredient.onHandQuantity,
        minimumQuantity: ingredient.minimumQuantity,
        dailyUsage,
        daysLeft,
        reorderQuantity,
        estimatedCost: Math.round(reorderQuantity * ingredient.referenceUnitCost),
        urgency
      } satisfies InventoryReorderSuggestion;
    })
    .filter((item): item is InventoryReorderSuggestion => Boolean(item))
    .sort((a, b) => priorityRank(a.urgency) - priorityRank(b.urgency) || b.estimatedCost - a.estimatedCost)
    .slice(0, 8);

  const wasteSignals = [...wasteByIngredient.entries()]
    .map(([ingredientId, item]) => ({
      ingredientId,
      name: item.name,
      unit: item.unit,
      wasteQuantity: item.quantity,
      wasteCost: Math.round(item.cost),
      movementCount: item.count
    }))
    .sort((a, b) => b.wasteCost - a.wasteCost)
    .slice(0, 5);

  const priceSignals = [...receiveCostsByIngredient.entries()]
    .map(([ingredientId, costs]) => {
      const sorted = [...costs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const latest = sorted[0];
      const previous = sorted.slice(1, 4);
      if (!latest || previous.length === 0) return null;
      const previousUnitCost = previous.reduce((sum, item) => sum + item.cost, 0) / previous.length;
      if (previousUnitCost <= 0) return null;
      const changePercent = ((latest.cost - previousUnitCost) / previousUnitCost) * 100;
      if (Math.abs(changePercent) < 5) return null;
      return {
        ingredientId,
        name: latest.name,
        latestUnitCost: latest.cost,
        previousUnitCost: Math.round(previousUnitCost),
        changePercent: Math.round(changePercent * 10) / 10
      } satisfies InventoryPriceSignal;
    })
    .filter((item): item is InventoryPriceSignal => Boolean(item))
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, 5);

  const recipeGap = snapshot ? Math.max(0, snapshot.menuItemCount - snapshot.recipeReadyItemCount) : 0;
  const highReorderCount = reorderSuggestions.filter((item) => item.urgency === "high").length;
  const healthScore = Math.max(
    0,
    Math.min(
      100,
      100 -
        highReorderCount * 14 -
        Math.max(0, reorderSuggestions.length - highReorderCount) * 6 -
        wasteSignals.length * 5 -
        priceSignals.length * 4 -
        recipeGap * 3 -
        (snapshot?.openCountSessions ?? 0) * 4
    )
  );
  const projectedPurchaseValue = reorderSuggestions.reduce((sum, item) => sum + item.estimatedCost, 0);
  const actionQueue: InventoryActionItem[] = [
    ...reorderSuggestions.slice(0, 3).map((item) => ({
      id: `reorder-${item.ingredientId}`,
      type: "reorder" as const,
      priority: item.urgency,
      title: `Mua ${item.name}`,
      detail:
        item.daysLeft !== null
          ? `Còn khoảng ${Number(item.daysLeft.toFixed(1)).toLocaleString("vi-VN")} ngày, đề xuất ${formatCompactQuantity(item.reorderQuantity, item.unit)}.`
          : `Đang dưới ngưỡng min hoặc chưa đủ lịch sử dùng, đề xuất ${formatCompactQuantity(item.reorderQuantity, item.unit)}.`,
      cta: "Tạo đơn mua",
      valueLabel: formatCompactVnd(item.estimatedCost)
    })),
    ...wasteSignals.slice(0, 2).map((item) => ({
      id: `waste-${item.ingredientId}`,
      type: "waste" as const,
      priority: (item.wasteCost > 200000 ? "high" : "medium") as InventoryActionPriority,
      title: `Hao hụt ${item.name}`,
      detail: `${formatCompactQuantity(item.wasteQuantity, item.unit)} trong 30 ngày, ${item.movementCount} lần ghi nhận.`,
      cta: "Xem waste",
      valueLabel: formatCompactVnd(item.wasteCost)
    })),
    ...priceSignals.slice(0, 2).map((item) => ({
      id: `price-${item.ingredientId}`,
      type: "price" as const,
      priority: (Math.abs(item.changePercent) >= 12 ? "high" : "medium") as InventoryActionPriority,
      title: `Giá ${item.name} ${item.changePercent > 0 ? "tăng" : "giảm"}`,
      detail: `${formatCompactVnd(item.previousUnitCost)} -> ${formatCompactVnd(item.latestUnitCost)} (${item.changePercent}%).`,
      cta: "Cập nhật giá vốn",
      valueLabel: `${item.changePercent > 0 ? "+" : ""}${item.changePercent}%`
    })),
    ...(recipeGap > 0
      ? [
          {
            id: "recipe-gap",
            type: "recipe" as const,
            priority: (recipeGap >= 5 ? "high" : "medium") as InventoryActionPriority,
            title: "Hoàn thiện định mức món",
            detail: `${recipeGap} món chưa có recipe nên AI chưa dự báo nguyên liệu đủ chính xác.`,
            cta: "Bổ sung recipe",
            valueLabel: `${recipeGap} món`
          }
        ]
      : []),
    ...((snapshot?.openCountSessions ?? 0) > 0
      ? [
          {
            id: "open-count-session",
            type: "count" as const,
            priority: "medium" as const,
            title: "Chốt phiên kiểm kê",
            detail: "Có phiên kiểm kê đang mở, nên chốt trước khi ra đề xuất mua cuối ngày.",
            cta: "Mở kiểm kê",
            valueLabel: `${snapshot?.openCountSessions ?? 0} phiên`
          }
        ]
      : [])
  ]
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
    .slice(0, 7);

  return {
    generatedAt: new Date().toISOString(),
    healthScore,
    aiBrief: buildInventoryBrief({
      healthScore,
      reorderCount: reorderSuggestions.length,
      wasteCount: wasteSignals.length,
      priceCount: priceSignals.length,
      recipeGap
    }),
    projectedPurchaseValue: Math.round(projectedPurchaseValue),
    weeklyUsageValue: Math.round(weeklyUsageValue),
    actionQueue,
    reorderSuggestions,
    wasteSignals,
    priceSignals
  };
}

export async function getInventoryAiEconomicsSignal(
  restaurantId: string,
  snapshot?: InventorySnapshot
): Promise<InventoryAiEconomicsSignal> {
  const baseSnapshot = snapshot ?? (await getInventorySnapshot(restaurantId));
  if (!baseSnapshot.schemaReady) return emptyInventoryAiEconomicsSignal;

  const [intelligence, recipeMenuItems] = await Promise.all([
    getInventoryIntelligence(restaurantId, baseSnapshot),
    listInventoryRecipeMenuItems(restaurantId)
  ]);
  const highFoodCostItems = recipeMenuItems
    .filter((item) => item.isAvailable && item.price > 0 && item.recipeLines.length > 0 && item.recipeCostPercent >= 45)
    .sort((left, right) => right.recipeCostPercent - left.recipeCostPercent || right.totalRecipeCost - left.totalRecipeCost)
    .slice(0, 5);
  const topHighFoodCostItem = highFoodCostItems[0] ?? null;

  return {
    schemaReady: true,
    projectedPurchaseValue: intelligence.projectedPurchaseValue,
    weeklyUsageValue: intelligence.weeklyUsageValue,
    reorderSuggestionCount: intelligence.reorderSuggestions.length,
    highReorderCount: intelligence.reorderSuggestions.filter((item) => item.urgency === "high").length,
    topReorderSuggestion: intelligence.reorderSuggestions[0] ?? null,
    wasteSignalCount: intelligence.wasteSignals.length,
    topWasteSignal: intelligence.wasteSignals[0] ?? null,
    priceSignalCount: intelligence.priceSignals.length,
    topPriceSignal: intelligence.priceSignals[0] ?? null,
    highFoodCostItemCount: highFoodCostItems.length,
    topHighFoodCostItem: topHighFoodCostItem
      ? {
          id: topHighFoodCostItem.id,
          name: topHighFoodCostItem.name,
          price: topHighFoodCostItem.price,
          totalRecipeCost: Math.round(topHighFoodCostItem.totalRecipeCost),
          recipeCostPercent: topHighFoodCostItem.recipeCostPercent
        }
      : null
  };
}

export async function getInventoryWarehouseCommandCenter(restaurantId: string): Promise<InventoryWarehouseCommandCenter> {
  await ensureDefaultStoreBranch(restaurantId);
  const supabase = await createServerSupabaseClient();
  const db = supabase as unknown as UntypedSupabase;
  const expiryCutoff = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [
    locationResult,
    supplierResult,
    purchaseOrderResult,
    stockBalanceResult,
    batchCountResult,
    expiringBatchResult,
    transferCountResult,
    transferResult,
    countSessionResult,
    openAlertCountResult,
    alertResult
  ] = await Promise.all([
    db
      .from("inventory_locations")
      .select("id,branch_id,name,location_type,is_primary,branch:store_branches(name)")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(50),
    db
      .from("suppliers")
      .select("id,name,phone,address,default_lead_days,is_preferred,items:supplier_items(id)")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .order("is_preferred", { ascending: false })
      .order("name", { ascending: true })
      .limit(50),
    db
      .from("purchase_orders")
      .select("id,po_number,status,total_amount,expected_delivery_at,created_at,supplier:suppliers(name),lines:purchase_order_lines(id,ingredient_id,order_unit,order_quantity,received_quantity,unit_cost,line_total,expiration_date,batch_code,note,ingredient:ingredients(name,unit))")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(12),
    db
      .from("stock_balances")
      .select(
        "id,ingredient_id,location_id,batch_id,on_hand_quantity,reserved_quantity,incoming_quantity,ingredient:ingredients(name,unit,minimum_quantity,reference_unit_cost),location:inventory_locations(name),branch:store_branches(name),batch:inventory_batches(batch_code,expiration_date,status,unit_cost)"
      )
      .eq("restaurant_id", restaurantId)
      .order("on_hand_quantity", { ascending: true })
      .limit(80),
    db.from("inventory_batches").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId),
    db
      .from("inventory_batches")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .eq("status", "active")
      .lte("expiration_date", expiryCutoff),
    db
      .from("branch_transfers")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .in("status", ["draft", "requested", "approved", "dispatched"]),
    db
      .from("branch_transfers")
      .select("id,transfer_number,status,from_location_id,to_location_id,created_at,metadata,lines:branch_transfer_lines(id,ingredient_id,unit,requested_quantity,dispatched_quantity,received_quantity,ingredient:ingredients(name))")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(8),
    db
      .from("inventory_counts")
      .select("id,title,status,location_id,started_at,applied_at,metadata,location:inventory_locations(name),lines:inventory_count_lines(id,variance_quantity,ingredient:ingredients(reference_unit_cost))")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(8),
    db
      .from("inventory_alerts")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .eq("status", "open"),
    db
      .from("inventory_alerts")
      .select("id,alert_type,severity,status,title,detail,detected_at,ingredient:ingredients(name),branch:store_branches(name)")
      .eq("restaurant_id", restaurantId)
      .in("status", ["open", "acknowledged"])
      .order("detected_at", { ascending: false })
      .limit(24)
  ]);

  const results = [
    locationResult,
    supplierResult,
    purchaseOrderResult,
    stockBalanceResult,
    batchCountResult,
    expiringBatchResult,
    transferCountResult,
    transferResult,
    countSessionResult,
    openAlertCountResult,
    alertResult
  ];
  if (results.some((result) => isMissingInventorySchemaError(result.error))) return emptyWarehouseCommandCenter;

  for (const result of results) {
    throwIfSupabaseError(result.error);
  }

  const locations = ((locationResult.data ?? []) as LocationRow[]).map((location) => {
    const branch = firstOrNull(location.branch);
    return {
      id: location.id,
      branchId: location.branch_id,
      branchName: branch?.name ?? null,
      name: location.name,
      locationType: location.location_type,
      isPrimary: location.is_primary
    };
  });

  const suppliers = ((supplierResult.data ?? []) as SupplierRow[]).map((supplier) => ({
    id: supplier.id,
    name: supplier.name,
    phone: supplier.phone,
    address: supplier.address,
    defaultLeadDays: Number(supplier.default_lead_days ?? 0),
    isPreferred: supplier.is_preferred ?? false,
    productCount: supplier.items?.length ?? 0
  }));

  const purchaseOrders = ((purchaseOrderResult.data ?? []) as PurchaseOrderRow[]).map((order) => {
    const supplier = firstOrNull(order.supplier);
    const lines = (order.lines ?? []).map((line) => {
      const ingredient = firstOrNull(line.ingredient);
      const orderQuantity = numberValue(line.order_quantity);
      const receivedQuantity = numberValue(line.received_quantity);

      return {
        id: line.id,
        ingredientId: line.ingredient_id,
        ingredientName: ingredient?.name ?? "Nguyen lieu",
        ingredientUnit: ingredient?.unit ?? line.order_unit,
        orderQuantity,
        receivedQuantity,
        remainingQuantity: Math.max(0, orderQuantity - receivedQuantity),
        orderUnit: line.order_unit,
        unitCost: numberValue(line.unit_cost),
        lineTotal: numberValue(line.line_total),
        expirationDate: line.expiration_date,
        batchCode: line.batch_code,
        note: line.note
      };
    });

    return {
      id: order.id,
      poNumber: order.po_number,
      status: order.status,
      supplierName: supplier?.name ?? null,
      totalAmount: Number(order.total_amount ?? 0),
      expectedDeliveryAt: order.expected_delivery_at,
      createdAt: order.created_at,
      lineCount: lines.length,
      lines
    };
  });

  const stockBalances = ((stockBalanceResult.data ?? []) as StockBalanceRow[]).map((balance) => {
    const ingredient = firstOrNull(balance.ingredient);
    const location = firstOrNull(balance.location);
    const branch = firstOrNull(balance.branch);
    const batch = firstOrNull(balance.batch);
    const onHandQuantity = numberValue(balance.on_hand_quantity);
    const reservedQuantity = numberValue(balance.reserved_quantity);
    const incomingQuantity = numberValue(balance.incoming_quantity);
    const availableQuantity = Math.max(0, onHandQuantity - reservedQuantity);
    const minimumQuantity = numberValue(ingredient?.minimum_quantity);

    return {
      id: balance.id,
      ingredientId: balance.ingredient_id,
      ingredientName: ingredient?.name ?? "Nguyen lieu",
      ingredientUnit: ingredient?.unit ?? "unit",
      locationId: balance.location_id,
      batchId: balance.batch_id,
      branchName: branch?.name ?? null,
      locationName: location?.name ?? null,
      batchCode: batch?.batch_code ?? null,
      expirationDate: batch?.expiration_date ?? null,
      onHandQuantity,
      reservedQuantity,
      incomingQuantity,
      availableQuantity,
      minimumQuantity,
      referenceUnitCost: numberValue(batch?.unit_cost ?? ingredient?.reference_unit_cost),
      status: stockBalanceStatus({
        availableQuantity,
        minimumQuantity,
        incomingQuantity,
        expirationDate: batch?.expiration_date ?? null,
        batchStatus: batch?.status ?? null
      })
    };
  });

  const locationNameById = new Map(locations.map((location) => [location.id, location.name]));

  const transfers = ((transferResult.data ?? []) as BranchTransferRow[]).map((transfer) => {
    const metadata = metadataObject(transfer.metadata);
    const lines = (transfer.lines ?? []).map((line) => {
      const ingredient = firstOrNull(line.ingredient);
      const requestedQuantity = numberValue(line.requested_quantity);
      const dispatchedQuantity = numberValue(line.dispatched_quantity);
      const receivedQuantity = numberValue(line.received_quantity);
      return {
        id: line.id,
        ingredientId: line.ingredient_id,
        ingredientName: ingredient?.name ?? "Nguyen lieu",
        unit: line.unit,
        requestedQuantity,
        dispatchedQuantity,
        receivedQuantity,
        varianceQuantity: Math.max(0, dispatchedQuantity - receivedQuantity)
      };
    });
    const dispatchedQuantity = lines.reduce((sum, line) => sum + line.dispatchedQuantity, 0);
    const receivedQuantity = lines.reduce((sum, line) => sum + line.receivedQuantity, 0);
    return {
      id: transfer.id,
      transferNumber: transfer.transfer_number,
      status: transfer.status,
      fromLocationId: transfer.from_location_id,
      toLocationId: transfer.to_location_id,
      fromLocationName: transfer.from_location_id ? locationNameById.get(transfer.from_location_id) ?? null : null,
      toLocationName: transfer.to_location_id ? locationNameById.get(transfer.to_location_id) ?? null : null,
      createdAt: transfer.created_at,
      lineCount: lines.length || metadataInteger(metadata, "lineCount"),
      totalQuantity: metadataNumber(metadata, "totalQuantity") || lines.reduce((sum, line) => sum + line.requestedQuantity, 0),
      dispatchedQuantity,
      receivedQuantity,
      varianceQuantity: Math.max(0, dispatchedQuantity - receivedQuantity),
      lines
    };
  });

  const countSessions = ((countSessionResult.data ?? []) as InventoryCountRow[]).map((count) => {
    const metadata = metadataObject(count.metadata);
    const location = firstOrNull(count.location);
    const varianceFromLines = (count.lines ?? []).reduce((sum, line) => sum + Math.abs(numberValue(line.variance_quantity)), 0);
    const valueFromLines = (count.lines ?? []).reduce((sum, line) => {
      const ingredient = firstOrNull(line.ingredient);
      return sum + Math.round(Math.abs(numberValue(line.variance_quantity)) * Number(ingredient?.reference_unit_cost ?? 0));
    }, 0);
    return {
      id: count.id,
      title: count.title,
      status: count.status,
      locationName: location?.name ?? (count.location_id ? locationNameById.get(count.location_id) ?? null : null),
      startedAt: count.started_at,
      appliedAt: count.applied_at,
      lineCount: count.lines?.length ?? metadataInteger(metadata, "lineCount"),
      adjustedLineCount: metadataInteger(metadata, "adjustedLineCount"),
      totalAbsVariance: metadataNumber(metadata, "totalAbsVariance") || varianceFromLines,
      totalVarianceValue: metadataInteger(metadata, "totalVarianceValue") || valueFromLines
    };
  });

  const alerts = ((alertResult.data ?? []) as InventoryAlertRow[]).map((alert) => {
    const ingredient = firstOrNull(alert.ingredient);
    const branch = firstOrNull(alert.branch);
    return {
      id: alert.id,
      alertType: alert.alert_type,
      severity: alert.severity,
      status: alert.status,
      title: alert.title,
      detail: alert.detail,
      detectedAt: alert.detected_at,
      ingredientName: ingredient?.name ?? null,
      branchName: branch?.name ?? null
    };
  });

  return {
    schemaReady: true,
    locationCount: locations.length,
    supplierCount: suppliers.length,
    purchaseOrderCount: purchaseOrders.length,
    openPurchaseOrderCount: purchaseOrders.filter((order) => isOpenPurchaseOrder(order.status)).length,
    stockBalanceCount: stockBalanceResult.count ?? stockBalances.length,
    batchCount: batchCountResult.count ?? 0,
    expiringBatchCount: expiringBatchResult.count ?? 0,
    transferCount: transferCountResult.count ?? 0,
    countSessionCount: countSessions.length,
    openAlertCount: openAlertCountResult.count ?? alerts.filter((alert) => alert.status === "open").length,
    locations,
    suppliers,
    purchaseOrders,
    stockBalances,
    countSessions,
    transfers,
    alerts
  };
}

export async function getInventoryWorkspaceData(restaurantId: string) {
  await ensureDefaultStoreBranch(restaurantId);
  const [snapshot, categories, ingredients, recipeMenuItems, warehouse] = await Promise.all([
    getInventorySnapshot(restaurantId),
    listInventoryCategories(restaurantId),
    listInventoryIngredients(restaurantId),
    listInventoryRecipeMenuItems(restaurantId),
    getInventoryWarehouseCommandCenter(restaurantId)
  ]);
  const intelligence = await getInventoryIntelligence(restaurantId, snapshot, ingredients);

  return { snapshot, categories, ingredients, recipeMenuItems, intelligence, warehouse };
}

export async function createInventoryCategory(restaurantId: string, input: { name: string }) {
  const supabase = await createServerSupabaseClient();
  const db = supabase as unknown as UntypedSupabase;
  const { data, error } = await db
    .from("ingredient_categories")
    .insert({
      restaurant_id: restaurantId,
      name: input.name
    })
    .select("id,restaurant_id,name")
    .single();

  if (isMissingInventorySchemaError(error)) throw new AppError("Cần chạy migration inventory trước khi tạo nhóm nguyên liệu.", 400);
  throwIfSupabaseError(error);
  return data as { id: string; restaurant_id: string; name: string };
}

export async function createInventorySupplier(restaurantId: string, input: InventorySupplierInput) {
  const supabase = createInventoryMutationSupabaseClient(input.actorUserId);
  const db = supabase as unknown as UntypedSupabase;
  const { data, error } = await db
    .from("suppliers")
    .insert({
      restaurant_id: restaurantId,
      name: input.name,
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
      default_lead_days: input.defaultLeadDays ?? 0,
      is_preferred: Boolean(input.isPreferred)
    })
    .select("id")
    .single();

  if (isMissingInventorySchemaError(error)) throw new AppError("Cần chạy migration warehouse trước khi tạo nhà cung cấp.", 400);
  throwIfSupabaseError(error);
  return data as { id: string };
}

export async function createInventoryPurchaseOrder(restaurantId: string, input: InventoryPurchaseOrderInput) {
  if (input.lines.length === 0) throw new AppError("Cần có ít nhất một dòng hàng để tạo PO.", 400);

  const supabase = createInventoryMutationSupabaseClient(input.actorUserId);
  const db = supabase as unknown as UntypedSupabase;
  const { data, error } = await db.rpc("create_purchase_order", {
    target_restaurant_id: restaurantId,
    target_supplier_id: input.supplierId || null,
    target_location_id: input.locationId || null,
    target_expected_delivery_at: optionalIsoTimestamp(input.expectedDeliveryAt),
    target_note: input.note?.trim() || null,
    target_actor_user_id: input.actorUserId,
    target_lines: input.lines.map((line) => ({
      ingredientId: line.ingredientId,
      quantity: line.orderQuantity,
      orderUnit: line.orderUnit?.trim() || undefined,
      unitCost: line.unitCost,
      expirationDate: line.expirationDate?.trim() || undefined,
      batchCode: line.batchCode?.trim() || undefined,
      note: line.note?.trim() || undefined
    }))
  });

  if (isMissingInventorySchemaError(error)) throw new AppError("Cần chạy migration warehouse trước khi tạo purchase order.", 400);
  throwIfSupabaseError(error);
  if (!data) throw new AppError(inventoryMutationError, 500);

  return {
    id: data.id as string,
    poNumber: data.po_number as string
  };
}

export async function receiveInventoryPurchaseOrder(
  restaurantId: string,
  input: { purchaseOrderId: string; actorUserId: string; lines?: InventoryPurchaseOrderReceiptLineInput[] }
): Promise<InventoryPurchaseOrderReceiptResult> {
  const supabase = createInventoryMutationSupabaseClient(input.actorUserId);
  const db = supabase as unknown as UntypedSupabase;
  const { data, error } = await db.rpc("receive_purchase_order", {
    target_restaurant_id: restaurantId,
    target_purchase_order_id: input.purchaseOrderId,
    target_actor_user_id: input.actorUserId,
    target_received_at: new Date().toISOString(),
    target_lines: input.lines?.map((line) => ({
      purchaseOrderLineId: line.purchaseOrderLineId,
      receivedQuantity: line.receivedQuantity,
      unitCost: line.unitCost,
      expirationDate: line.expirationDate?.trim() || undefined,
      batchCode: line.batchCode?.trim() || undefined,
      note: line.note?.trim() || undefined
    })) ?? undefined
  });

  if (isMissingInventorySchemaError(error)) throw new AppError("Cần chạy migration warehouse trước khi nhận hàng PO.", 400);
  if (error?.message?.includes("Missing unit conversion")) {
    throw new AppError("PO co don vi mua hang chua co quy doi sang don vi ton kho.", 400);
  }
  if (error?.message?.includes("current status")) {
    throw new AppError("PO nay da nhan hang hoac da bi huy.", 400);
  }
  throwIfSupabaseError(error);
  if (!data || typeof data !== "object") throw new AppError(inventoryMutationError, 500);

  const payload = data as Partial<InventoryPurchaseOrderReceiptResult>;
  return {
    purchaseOrderId: String(payload.purchaseOrderId ?? input.purchaseOrderId),
    poNumber: String(payload.poNumber ?? ""),
    status: String(payload.status ?? ""),
    receivedLines: numberValue(payload.receivedLines),
    receivedQuantity: numberValue(payload.receivedQuantity),
    receivedValue: numberValue(payload.receivedValue)
  };
}

export async function applyInventoryCount(restaurantId: string, input: InventoryCountInput): Promise<InventoryCountApplyResult> {
  if (input.lines.length === 0) throw new AppError("Cần có ít nhất một dòng để kiểm kê kho.", 400);

  const supabase = createInventoryMutationSupabaseClient(input.actorUserId);
  const db = supabase as unknown as UntypedSupabase;
  const { data, error } = await db.rpc("apply_inventory_count", {
    target_restaurant_id: restaurantId,
    target_title: input.title?.trim() || "Kiem ke kho",
    target_location_id: input.locationId || null,
    target_note: input.note?.trim() || null,
    target_actor_user_id: input.actorUserId,
    target_lines: input.lines.map((line) => ({
      ingredientId: line.ingredientId,
      countedQuantity: line.countedQuantity,
      locationId: line.locationId || input.locationId || undefined,
      note: line.note?.trim() || undefined
    }))
  });

  if (isMissingInventorySchemaError(error)) throw new AppError("Cần chạy migration workflow kho trước khi kiểm kê.", 400);
  if (error?.message?.includes("stock negative")) {
    throw new AppError("Ket qua kiem ke lam ton kho am. Hay kiem tra lai so luong thuc te.", 400);
  }
  throwIfSupabaseError(error);
  if (!data || typeof data !== "object") throw new AppError(inventoryMutationError, 500);

  const payload = data as Partial<InventoryCountApplyResult>;
  return {
    countId: String(payload.countId ?? ""),
    title: String(payload.title ?? input.title ?? "Kiem ke kho"),
    lineCount: numberValue(payload.lineCount),
    adjustedLineCount: numberValue(payload.adjustedLineCount),
    totalAbsVariance: numberValue(payload.totalAbsVariance),
    totalVarianceValue: numberValue(payload.totalVarianceValue)
  };
}

export async function createInventoryTransfer(restaurantId: string, input: InventoryTransferInput): Promise<InventoryTransferResult> {
  if (input.lines.length === 0) throw new AppError("Cần có ít nhất một dòng để điều chuyển kho.", 400);
  if (input.fromLocationId === input.toLocationId) throw new AppError("Kho xuat va kho nhan phai khac nhau.", 400);

  const supabase = createInventoryMutationSupabaseClient(input.actorUserId);
  const db = supabase as unknown as UntypedSupabase;
  const { data, error } = await db.rpc("create_branch_transfer", {
    target_restaurant_id: restaurantId,
    target_from_location_id: input.fromLocationId,
    target_to_location_id: input.toLocationId,
    target_note: input.note?.trim() || null,
    target_actor_user_id: input.actorUserId,
    target_lines: input.lines.map((line) => ({
      ingredientId: line.ingredientId,
      quantity: line.quantity,
      unit: line.unit?.trim() || undefined,
      batchId: line.batchId || undefined,
      note: line.note?.trim() || undefined
    }))
  });

  if (isMissingInventorySchemaError(error)) throw new AppError("Cần chạy migration workflow kho trước khi điều chuyển.", 400);
  if (error?.message?.includes("stock negative") || error?.message?.includes("balance is missing")) {
    throw new AppError("Kho xuat khong du hang de dieu chuyen.", 400);
  }
  if (error?.message?.includes("Missing unit conversion")) {
    throw new AppError("Don vi dieu chuyen chua co quy doi sang don vi ton kho.", 400);
  }
  throwIfSupabaseError(error);
  if (!data || typeof data !== "object") throw new AppError(inventoryMutationError, 500);

  const payload = data as Partial<InventoryTransferResult>;
  return {
    transferId: String(payload.transferId ?? ""),
    transferNumber: String(payload.transferNumber ?? ""),
    status: payload.status,
    lineCount: numberValue(payload.lineCount),
    totalQuantity: numberValue(payload.totalQuantity),
    movementCount: numberValue(payload.movementCount)
  };
}

export async function processInventoryTransfer(
  restaurantId: string,
  input: {
    transferId: string;
    action: InventoryTransferWorkflowAction;
    actorUserId: string;
    note?: string;
    lines?: InventoryTransferReceiveLineInput[];
  }
): Promise<InventoryTransferResult> {
  const supabase = createInventoryMutationSupabaseClient(input.actorUserId);
  const db = supabase as unknown as UntypedSupabase;
  const { data, error } = await db.rpc("process_branch_transfer", {
    target_restaurant_id: restaurantId,
    target_transfer_id: input.transferId,
    target_action: input.action,
    target_actor_user_id: input.actorUserId,
    target_note: input.note?.trim() || null,
    target_lines: input.lines?.map((line) => ({
      lineId: line.lineId,
      receivedQuantity: line.receivedQuantity,
      note: line.note?.trim() || undefined
    })) ?? null
  });

  if (isMissingInventorySchemaError(error)) throw new AppError("Cần chạy migration workflow điều chuyển kho trước.", 400);
  if (error?.message?.includes("Only approved transfers can be dispatched")) {
    throw new AppError("Chi phieu da duyet moi duoc xuat kho.", 400);
  }
  if (error?.message?.includes("Only dispatched transfers can be received")) {
    throw new AppError("Chi phieu da xuat kho moi duoc nhan hang.", 400);
  }
  if (error?.message?.includes("stock negative") || error?.message?.includes("batch negative") || error?.message?.includes("balance is missing")) {
    throw new AppError("Kho xuat khong du hang de xuat dieu chuyen.", 400);
  }
  throwIfSupabaseError(error);
  if (!data || typeof data !== "object") throw new AppError(inventoryMutationError, 500);

  const payload = data as Partial<InventoryTransferResult>;
  return {
    transferId: String(payload.transferId ?? input.transferId),
    transferNumber: String(payload.transferNumber ?? ""),
    status: payload.status,
    lineCount: numberValue(payload.lineCount),
    totalQuantity: numberValue(payload.totalQuantity),
    movementCount: numberValue(payload.movementCount),
    skippedReason: payload.skippedReason
  };
}

export async function updateInventoryAlertStatus(
  restaurantId: string,
  input: { alertId: string; status: "acknowledged" | "resolved" | "dismissed"; actorUserId: string }
) {
  const supabase = createInventoryMutationSupabaseClient(input.actorUserId);
  const db = supabase as unknown as UntypedSupabase;
  const patch: Record<string, unknown> = {
    status: input.status,
    actor_user_id: input.actorUserId
  };

  if (input.status === "resolved" || input.status === "dismissed") {
    patch.resolved_at = new Date().toISOString();
  }

  const { data, error } = await db
    .from("inventory_alerts")
    .update(patch)
    .eq("restaurant_id", restaurantId)
    .eq("id", input.alertId)
    .select("id,status")
    .single();

  if (isMissingInventorySchemaError(error)) throw new AppError("Cần chạy migration warehouse trước khi xử lý cảnh báo.", 400);
  throwIfSupabaseError(error);
  return data as { id: string; status: string };
}

export async function refreshInventoryAlerts(restaurantId: string): Promise<InventoryAlertRefreshResult> {
  await ensureDefaultStoreBranch(restaurantId);
  const supabase = createAdminSupabaseClient();
  const db = supabase as unknown as UntypedSupabase;
  const now = new Date();
  const movementStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    stockResult,
    batchResult,
    movementResult,
    purchaseOrderResult,
    ingredientResult,
    menuItemResult,
    recipeResult,
    existingAlertResult
  ] = await Promise.all([
    db
      .from("stock_balances")
      .select("id,branch_id,location_id,batch_id,ingredient_id,on_hand_quantity,reserved_quantity,incoming_quantity,counted_at,updated_at,ingredient:ingredients(name,unit,minimum_quantity,reference_unit_cost)")
      .eq("restaurant_id", restaurantId)
      .limit(1000),
    db
      .from("inventory_batches")
      .select("id,ingredient_id,batch_code,expiration_date,remaining_quantity,unit_cost,status,ingredient:ingredients(name,unit)")
      .eq("restaurant_id", restaurantId)
      .gt("remaining_quantity", 0)
      .in("status", ["active", "expired", "quarantined"])
      .limit(1000),
    db
      .from("inventory_movements")
      .select("id,ingredient_id,branch_id,location_id,batch_id,movement_type,quantity_delta,unit_cost,created_at,ingredient:ingredients(name,unit,reference_unit_cost)")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", movementStart)
      .in("movement_type", ["deduct_sale", "adjust_decrease", "internal_use", "waste", "expired", "receive"])
      .order("created_at", { ascending: false })
      .limit(2500),
    db
      .from("purchase_orders")
      .select("id,branch_id,po_number,status,expected_delivery_at,total_amount,supplier:suppliers(name),lines:purchase_order_lines(ingredient_id,ingredient:ingredients(name))")
      .eq("restaurant_id", restaurantId)
      .in("status", ["pending", "approved", "ordered", "partially_delivered"])
      .limit(300),
    db
      .from("ingredients")
      .select("id,name,unit,on_hand_quantity,minimum_quantity")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .limit(1000),
    db
      .from("menu_items")
      .select("id,name,is_available")
      .eq("restaurant_id", restaurantId)
      .eq("is_available", true)
      .limit(1000),
    db
      .from("menu_item_recipes")
      .select("menu_item_id")
      .eq("restaurant_id", restaurantId)
      .limit(3000),
    db
      .from("inventory_alerts")
      .select("id,alert_type,source_id,status")
      .eq("restaurant_id", restaurantId)
      .in("status", ["open", "acknowledged"])
      .in("alert_type", [...INVENTORY_ALERT_TYPES])
      .limit(1000)
  ]);

  const results = [
    stockResult,
    batchResult,
    movementResult,
    purchaseOrderResult,
    ingredientResult,
    menuItemResult,
    recipeResult,
    existingAlertResult
  ];

  if (results.some((result) => isMissingInventorySchemaError(result.error))) {
    throw new AppError("Cần chạy migration warehouse trước khi quét cảnh báo kho.", 400);
  }

  for (const result of results) {
    throwIfSupabaseError(result.error);
  }

  const stockBalances = ((stockResult.data ?? []) as Array<StockBalanceRow & { branch_id?: string | null }>).map((balance) => {
    const ingredient = firstOrNull(balance.ingredient);
    return {
      id: balance.id,
      branchId: balance.branch_id ?? null,
      locationId: balance.location_id,
      batchId: balance.batch_id,
      ingredientId: balance.ingredient_id,
      ingredientName: ingredient?.name ?? "Nguyên liệu",
      ingredientUnit: ingredient?.unit ?? "unit",
      onHandQuantity: numberValue(balance.on_hand_quantity),
      reservedQuantity: numberValue(balance.reserved_quantity),
      incomingQuantity: numberValue(balance.incoming_quantity),
      minimumQuantity: numberValue(ingredient?.minimum_quantity),
      referenceUnitCost: numberValue(ingredient?.reference_unit_cost),
      countedAt: balance.counted_at ?? null,
      updatedAt: balance.updated_at ?? null
    };
  });

  const batches = ((batchResult.data ?? []) as AlertBatchRow[]).map((batch) => {
    const ingredient = firstOrNull(batch.ingredient);
    return {
      id: batch.id,
      ingredientId: batch.ingredient_id,
      ingredientName: ingredient?.name ?? "Nguyên liệu",
      ingredientUnit: ingredient?.unit ?? "unit",
      batchCode: batch.batch_code,
      expirationDate: batch.expiration_date,
      remainingQuantity: numberValue(batch.remaining_quantity),
      unitCost: numberValue(batch.unit_cost),
      status: batch.status
    };
  });

  const movements = ((movementResult.data ?? []) as AlertMovementRow[]).map((movement) => {
    const ingredient = firstOrNull(movement.ingredient);
    return {
      id: movement.id,
      ingredientId: movement.ingredient_id,
      branchId: movement.branch_id,
      ingredientName: ingredient?.name ?? "Nguyên liệu",
      ingredientUnit: ingredient?.unit ?? "unit",
      locationId: movement.location_id ?? null,
      batchId: movement.batch_id ?? null,
      movementType: movement.movement_type,
      quantityDelta: numberValue(movement.quantity_delta),
      unitCost: movement.unit_cost === null ? null : numberValue(movement.unit_cost),
      referenceUnitCost: numberValue(ingredient?.reference_unit_cost),
      createdAt: movement.created_at
    };
  });

  const purchaseOrders = ((purchaseOrderResult.data ?? []) as AlertPurchaseOrderRow[]).map((order) => {
    const supplier = firstOrNull(order.supplier);
    const lines = order.lines ?? [];
    const firstLine = lines[0] ?? null;
    const firstIngredient = firstLine ? firstOrNull(firstLine.ingredient) : null;
    return {
      id: order.id,
      branchId: order.branch_id,
      supplierName: supplier?.name ?? null,
      poNumber: order.po_number,
      status: order.status,
      expectedDeliveryAt: order.expected_delivery_at,
      totalAmount: numberValue(order.total_amount),
      firstIngredientId: firstLine?.ingredient_id ?? null,
      firstIngredientName: firstIngredient?.name ?? null,
      lineCount: lines.length
    };
  });

  const ingredients = ((ingredientResult.data ?? []) as AlertIngredientRow[]).map((ingredient) => ({
    id: ingredient.id,
    name: ingredient.name,
    unit: ingredient.unit,
    onHandQuantity: numberValue(ingredient.on_hand_quantity),
    minimumQuantity: numberValue(ingredient.minimum_quantity)
  }));

  const recipeLineCountByMenuItem = new Map<string, number>();
  for (const recipe of (recipeResult.data ?? []) as AlertRecipeRow[]) {
    recipeLineCountByMenuItem.set(recipe.menu_item_id, (recipeLineCountByMenuItem.get(recipe.menu_item_id) ?? 0) + 1);
  }
  const recipeGaps = ((menuItemResult.data ?? []) as AlertMenuItemRow[]).map((item) => ({
    menuItemId: item.id,
    name: item.name,
    isAvailable: item.is_available,
    recipeLineCount: recipeLineCountByMenuItem.get(item.id) ?? 0
  }));

  const candidates = buildInventoryAlertCandidates({
    now,
    stockBalances,
    batches,
    movements,
    purchaseOrders,
    ingredients,
    recipeGaps
  });

  const candidateKeys = new Set(candidates.map((candidate) => inventoryAlertKey({ alertType: candidate.alertType, sourceId: candidate.sourceId })));
  const existingAlerts = (existingAlertResult.data ?? []) as ExistingInventoryAlertRow[];
  const existingKeys = new Set(existingAlerts.map((alert) => inventoryAlertKey({ alertType: alert.alert_type, sourceId: alert.source_id })));
  const existingByKey = new Map(existingAlerts.map((alert) => [inventoryAlertKey({ alertType: alert.alert_type, sourceId: alert.source_id }), alert]));
  const newAlerts = candidates
    .filter((candidate) => !existingKeys.has(inventoryAlertKey({ alertType: candidate.alertType, sourceId: candidate.sourceId })))
    .map((candidate) => ({
      restaurant_id: restaurantId,
      branch_id: candidate.branchId,
      ingredient_id: candidate.ingredientId,
      alert_type: candidate.alertType,
      severity: candidate.severity,
      title: candidate.title,
      detail: candidate.detail,
      source_type: candidate.sourceType,
      source_id: candidate.sourceId,
      metadata: candidate.metadata
    }));

  if (newAlerts.length > 0) {
    const { error } = await db.from("inventory_alerts").insert(newAlerts);
    throwIfSupabaseError(error);
  }

  let updated = 0;
  const updates = candidates
    .map((candidate) => ({
      candidate,
      existing: existingByKey.get(inventoryAlertKey({ alertType: candidate.alertType, sourceId: candidate.sourceId }))
    }))
    .filter((item): item is { candidate: InventoryAlertCandidate; existing: ExistingInventoryAlertRow } => Boolean(item.existing));

  await Promise.all(
    updates.map(async ({ candidate, existing }) => {
      const { error } = await db
        .from("inventory_alerts")
        .update({
          branch_id: candidate.branchId,
          ingredient_id: candidate.ingredientId,
          severity: candidate.severity,
          title: candidate.title,
          detail: candidate.detail,
          source_type: candidate.sourceType,
          metadata: candidate.metadata,
          resolved_at: null
        })
        .eq("restaurant_id", restaurantId)
        .eq("id", existing.id);
      throwIfSupabaseError(error);
      updated += 1;
    })
  );

  const resolvedAlertIds = existingAlerts
    .filter((alert) => !candidateKeys.has(inventoryAlertKey({ alertType: alert.alert_type, sourceId: alert.source_id })))
    .map((alert) => alert.id);

  if (resolvedAlertIds.length > 0) {
    const { error } = await db
      .from("inventory_alerts")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString()
      })
      .eq("restaurant_id", restaurantId)
      .in("id", resolvedAlertIds);
    throwIfSupabaseError(error);
  }

  return {
    created: newAlerts.length,
    updated,
    resolved: resolvedAlertIds.length,
    scanned:
      (stockResult.data ?? []).length +
      (batchResult.data ?? []).length +
      (movementResult.data ?? []).length +
      (purchaseOrderResult.data ?? []).length +
      (ingredientResult.data ?? []).length +
      (menuItemResult.data ?? []).length
  };
}

async function resolveInventoryImportCategory(db: UntypedSupabase, restaurantId: string, categoryName?: string) {
  const normalizedName = categoryName?.trim();
  if (!normalizedName) return null;

  const { data: existingCategory, error: existingCategoryError } = await db
    .from("ingredient_categories")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .ilike("name", normalizedName)
    .maybeSingle();

  if (isMissingInventorySchemaError(existingCategoryError)) {
    throw new AppError("Cần chạy migration inventory trước khi nhập kho bằng AI.", 400);
  }
  throwIfSupabaseError(existingCategoryError);
  if (existingCategory?.id) return existingCategory.id as string;

  const { data: createdCategory, error: createdCategoryError } = await db
    .from("ingredient_categories")
    .insert({
      restaurant_id: restaurantId,
      name: normalizedName
    })
    .select("id")
    .single();

  if (isMissingInventorySchemaError(createdCategoryError)) {
    throw new AppError("Cần chạy migration inventory trước khi nhập kho bằng AI.", 400);
  }
  throwIfSupabaseError(createdCategoryError);
  return createdCategory.id as string;
}

export async function importInventoryIntakeRows(
  restaurantId: string,
  input: { rows: InventoryImportRowInput[]; actorUserId: string }
): Promise<InventoryImportResult> {
  const supabase = await createServerSupabaseClient();
  const db = supabase as unknown as UntypedSupabase;
  const result: InventoryImportResult = { inserted: 0, updated: 0, movements: 0, skipped: 0 };

  for (const row of input.rows) {
    const name = row.name.trim();
    const unit = row.unit.trim();
    if (!name || !unit) {
      result.skipped += 1;
      continue;
    }

    const categoryId = await resolveInventoryImportCategory(db, restaurantId, row.categoryName);
    const { data: existingIngredient, error: existingIngredientError } = await db
      .from("ingredients")
      .select("id,category_id")
      .eq("restaurant_id", restaurantId)
      .ilike("name", name)
      .maybeSingle();

    if (isMissingInventorySchemaError(existingIngredientError)) {
      throw new AppError("Cần chạy migration inventory trước khi nhập kho bằng AI.", 400);
    }
    throwIfSupabaseError(existingIngredientError);

    let ingredientId = existingIngredient?.id as string | undefined;
    if (ingredientId) {
      const { error: updateError } = await db
        .from("ingredients")
        .update({
          category_id: categoryId ?? existingIngredient.category_id ?? null,
          unit,
          minimum_quantity: row.minimumQuantity,
          reference_unit_cost: row.referenceUnitCost,
          is_active: true
        })
        .eq("restaurant_id", restaurantId)
        .eq("id", ingredientId);

      if (isMissingInventorySchemaError(updateError)) {
        throw new AppError("Cần chạy migration inventory trước khi nhập kho bằng AI.", 400);
      }
      throwIfSupabaseError(updateError);
      result.updated += 1;
    } else {
      const { data: createdIngredient, error: createError } = await db
        .from("ingredients")
        .insert({
          restaurant_id: restaurantId,
          category_id: categoryId,
          name,
          unit,
          on_hand_quantity: 0,
          minimum_quantity: row.minimumQuantity,
          reference_unit_cost: row.referenceUnitCost
        })
        .select("id")
        .single();

      if (isMissingInventorySchemaError(createError)) {
        throw new AppError("Cần chạy migration inventory trước khi nhập kho bằng AI.", 400);
      }
      throwIfSupabaseError(createError);
      ingredientId = createdIngredient.id as string;
      result.inserted += 1;
    }

    if (ingredientId && row.quantity > 0) {
      await recordInventoryMovement(restaurantId, {
        ingredientId,
        movementType: "receive",
        quantity: row.quantity,
        unitCost: row.referenceUnitCost,
        reason: "Nhap kho tu AI/file/giong noi",
        actorUserId: input.actorUserId
      });
      result.movements += 1;
    }
  }

  return result;
}

export async function createInventoryIngredient(
  restaurantId: string,
  input: {
    categoryId?: string | null;
    name: string;
    unit: string;
    onHandQuantity: number;
    minimumQuantity: number;
    referenceUnitCost: number;
    storageArea?: string;
    shelfCode?: string;
    storageNote?: string;
    reorderLeadDays?: number;
    actorUserId: string;
  }
) {
  const supabase = await createServerSupabaseClient();
  const db = supabase as unknown as UntypedSupabase;
  const { data, error } = await db
    .from("ingredients")
    .insert({
      restaurant_id: restaurantId,
      category_id: input.categoryId || null,
      name: input.name,
      unit: input.unit,
      on_hand_quantity: 0,
      minimum_quantity: input.minimumQuantity,
      reference_unit_cost: input.referenceUnitCost,
      metadata: buildIngredientMetadata(input)
    })
    .select("id")
    .single();

  if (isMissingInventorySchemaError(error)) throw new AppError("Cần chạy migration inventory trước khi tạo nguyên liệu.", 400);
  throwIfSupabaseError(error);

  if (input.onHandQuantity > 0) {
    await recordInventoryMovement(restaurantId, {
      ingredientId: data.id,
      movementType: "receive",
      quantity: input.onHandQuantity,
      unitCost: input.referenceUnitCost,
      reason: "Ton dau ky",
      actorUserId: input.actorUserId
    });
  }

  return data as { id: string };
}

export async function updateInventoryIngredient(
  restaurantId: string,
  input: {
    ingredientId: string;
    categoryId?: string | null;
    name: string;
    unit: string;
    minimumQuantity: number;
    referenceUnitCost: number;
    storageArea?: string;
    shelfCode?: string;
    storageNote?: string;
    reorderLeadDays?: number;
    onHandQuantity?: number;
    actorUserId?: string;
  }
) {
  const supabase = await createServerSupabaseClient();
  const db = supabase as unknown as UntypedSupabase;
  const currentResult = await db
    .from("ingredients")
    .select("metadata, on_hand_quantity")
    .eq("restaurant_id", restaurantId)
    .eq("id", input.ingredientId)
    .maybeSingle();

  if (isMissingInventorySchemaError(currentResult.error)) throw new AppError("Cần chạy migration inventory trước khi sửa nguyên liệu.", 400);
  throwIfSupabaseError(currentResult.error);

  const currentMetadata = metadataObject(currentResult.data?.metadata);
  const { data, error } = await db
    .from("ingredients")
    .update({
      category_id: input.categoryId || null,
      name: input.name,
      unit: input.unit,
      minimum_quantity: input.minimumQuantity,
      reference_unit_cost: input.referenceUnitCost,
      is_active: true,
      metadata: {
        ...currentMetadata,
        ...buildIngredientMetadata(input)
      }
    })
    .eq("restaurant_id", restaurantId)
    .eq("id", input.ingredientId)
    .select("id")
    .single();

  if (isMissingInventorySchemaError(error)) throw new AppError("Cần chạy migration inventory trước khi sửa nguyên liệu.", 400);
  throwIfSupabaseError(error);

  // On-hand is ledger-managed: when the editor sets an absolute target quantity,
  // reconcile it by recording an adjustment movement for the delta so the ledger stays consistent.
  if (typeof input.onHandQuantity === "number" && input.actorUserId) {
    const currentOnHand = Number(currentResult.data?.on_hand_quantity ?? 0);
    const targetOnHand = input.onHandQuantity;
    const delta = Number((targetOnHand - currentOnHand).toFixed(4));
    if (delta !== 0) {
      await recordInventoryMovement(restaurantId, {
        ingredientId: input.ingredientId,
        movementType: delta > 0 ? "adjust_increase" : "adjust_decrease",
        quantity: Math.abs(delta),
        unitCost: delta > 0 ? input.referenceUnitCost : undefined,
        reason: "Dieu chinh ton khi sua nguyen lieu",
        sourceType: "manual",
        metadata: { recordedFrom: "ingredient_edit", previousOnHand: currentOnHand, targetOnHand },
        actorUserId: input.actorUserId
      });
    }
  }

  return data as { id: string };
}

export async function deactivateInventoryIngredient(restaurantId: string, ingredientId: string) {
  const supabase = await createServerSupabaseClient();
  const db = supabase as unknown as UntypedSupabase;
  const currentResult = await db
    .from("ingredients")
    .select("metadata")
    .eq("restaurant_id", restaurantId)
    .eq("id", ingredientId)
    .maybeSingle();

  if (isMissingInventorySchemaError(currentResult.error)) throw new AppError("Cần chạy migration inventory trước khi xóa nguyên liệu.", 400);
  throwIfSupabaseError(currentResult.error);

  const { data, error } = await db
    .from("ingredients")
    .update({
      is_active: false,
      metadata: {
        ...metadataObject(currentResult.data?.metadata),
        archivedAt: new Date().toISOString()
      }
    })
    .eq("restaurant_id", restaurantId)
    .eq("id", ingredientId)
    .select("id")
    .single();

  if (isMissingInventorySchemaError(error)) throw new AppError("Cần chạy migration inventory trước khi xóa nguyên liệu.", 400);
  throwIfSupabaseError(error);
  return data as { id: string };
}

export async function upsertInventoryRecipeLine(
  restaurantId: string,
  input: {
    menuItemId: string;
    ingredientId: string;
    quantityPerItem: number;
    wastePercent?: number;
  }
) {
  const supabase = await createServerSupabaseClient();
  const db = supabase as unknown as UntypedSupabase;
  const { data, error } = await db
    .from("menu_item_recipes")
    .upsert(
      {
        restaurant_id: restaurantId,
        menu_item_id: input.menuItemId,
        ingredient_id: input.ingredientId,
        quantity_per_item: input.quantityPerItem,
        waste_percent: input.wastePercent ?? 0
      },
      { onConflict: "restaurant_id,menu_item_id,ingredient_id" }
    )
    .select("id")
    .single();

  if (isMissingInventorySchemaError(error)) throw new AppError("Cần chạy migration inventory trước khi gán recipe.", 400);
  throwIfSupabaseError(error);
  return data as { id: string };
}

export async function deleteInventoryRecipeLine(restaurantId: string, recipeLineId: string) {
  const supabase = await createServerSupabaseClient();
  const db = supabase as unknown as UntypedSupabase;
  const { data, error } = await db
    .from("menu_item_recipes")
    .delete()
    .eq("id", recipeLineId)
    .eq("restaurant_id", restaurantId)
    .select("id")
    .single();

  if (isMissingInventorySchemaError(error)) throw new AppError("Cần chạy migration inventory trước khi xóa recipe.", 400);
  throwIfSupabaseError(error);
  return data as { id: string };
}

async function acceptOrderWithoutInventory(
  restaurantId: string,
  input: InventoryAcceptOrderInput,
  reason: "schema_missing" | "rpc_missing"
) {
  const supabase = createAdminSupabaseClient();
  const nowIso = new Date().toISOString();

  const { data: current, error: readError } = await supabase
    .from("orders")
    .select("id,status,accepted_at")
    .eq("id", input.orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  throwIfSupabaseError(readError);
  if (!current) throw new AppError("Không tìm thấy đơn hàng", 404);
  if (current.status !== "pending" && current.status !== "ordering") {
    throw new AppError("Trạng thái đơn đã thay đổi. Vui lòng tải lại danh sách đơn.", 409);
  }

  const updatePayload = {
    status: "ordering" as const,
    updated_at: nowIso,
    accepted_at: current.accepted_at ?? nowIso,
    ...(input.serviceDueAt ? { service_due_at: input.serviceDueAt } : {}),
    ...(input.deliveryStatus
      ? {
          delivery_status: input.deliveryStatus,
          delivery_tracking_updated_at: nowIso
        }
      : {})
  };

  const { data, error } = await supabase
    .from("orders")
    .update(updatePayload)
    .eq("id", input.orderId)
    .eq("restaurant_id", restaurantId)
    .in("status", ["pending", "ordering"])
    .select("*")
    .maybeSingle();
  throwIfSupabaseError(error);
  if (!data) throw new AppError("Trạng thái đơn đã thay đổi. Vui lòng tải lại danh sách đơn.", 409);

  writeOperationalEvent({
    area: "ops",
    event: "order_accept_without_inventory",
    status: "warn",
    restaurantId,
    metadata: { orderId: input.orderId, reason }
  });

  return data;
}

export async function reserveInventoryForPrepaidOrder(restaurantId: string, orderId: string, actorUserId?: string | null) {
  const db = createAdminSupabaseClient() as unknown as UntypedSupabase;
  const existingResult = await db
    .from("inventory_reservations")
    .select("quantity,status")
    .eq("restaurant_id", restaurantId)
    .eq("order_id", orderId)
    .in("status", ["reserved", "consumed"]);
  if (!isMissingInventorySchemaError(existingResult.error)) {
    throwIfSupabaseError(existingResult.error);
    const existingReservations = (existingResult.data ?? []) as Array<{ quantity?: number | string | null; status?: string | null }>;
    if (existingReservations.length > 0) {
      return {
        schemaReady: true,
        status: "reserved",
        reservationCount: existingReservations.length,
        quantity: existingReservations.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0),
        replayed: true
      };
    }
  }

  const allocationPlan = await buildOrderInventoryAllocationPlan(db, restaurantId, orderId);
  if (!allocationPlan.schemaReady) {
    throw new AppError("Chưa thể giữ tồn kho prepaid vì schema inventory chưa sẵn sàng.", 503);
  }
  if (allocationPlan.allocations.length === 0) {
    return { schemaReady: true, reservationCount: 0, skippedReason: allocationPlan.skippedReason ?? "no_recipes" };
  }
  const { data, error } = await db.rpc("reserve_order_inventory", {
    target_restaurant_id: restaurantId,
    target_order_id: orderId,
    target_actor_user_id: actorUserId ?? null,
    target_allocations: allocationPlan.allocations
  });
  if (error?.message?.includes("insufficient") || error?.message?.includes("reservation")) {
    throw new AppError("Món prepaid vừa hết tồn kho. Vui lòng chọn món khác hoặc thử lại.", 409);
  }
  throwIfSupabaseError(error);
  return { schemaReady: true, ...(data as Record<string, unknown>) };
}

export async function consumeReservedInventory(restaurantId: string, orderId: string, actorUserId?: string | null) {
  const db = createAdminSupabaseClient() as unknown as UntypedSupabase;
  const { data, error } = await db.rpc("consume_order_inventory", {
    target_restaurant_id: restaurantId,
    target_order_id: orderId,
    target_actor_user_id: actorUserId ?? null
  });
  if (isMissingInventorySchemaError(error)) return { status: "no_reservation" };
  throwIfSupabaseError(error);
  return data as Record<string, unknown>;
}

export async function releaseReservedInventory(restaurantId: string, orderId: string, actorUserId?: string | null) {
  const db = createAdminSupabaseClient() as unknown as UntypedSupabase;
  const { data, error } = await db.rpc("release_order_inventory", {
    target_restaurant_id: restaurantId,
    target_order_id: orderId,
    target_actor_user_id: actorUserId ?? null
  });
  if (isMissingInventorySchemaError(error)) return { status: "no_reservation" };
  throwIfSupabaseError(error);
  return data as Record<string, unknown>;
}

export async function acceptOrderWithInventoryDeduction(restaurantId: string, input: InventoryAcceptOrderInput) {
  const supabase = createAdminSupabaseClient();
  const db = supabase as unknown as UntypedSupabase;

  const reservedResult = await db
    .from("inventory_reservations")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .eq("order_id", input.orderId)
    .eq("status", "reserved");
  if (isMissingInventorySchemaError(reservedResult.error)) {
    return acceptOrderWithoutInventory(restaurantId, input, "rpc_missing");
  }
  throwIfSupabaseError(reservedResult.error);
  const hasReservedInventory = (reservedResult.count ?? 0) > 0;
  if (hasReservedInventory) {
    const { data: reservedOrder, error: reservedOrderError } = await db.rpc("accept_order_with_reserved_inventory", {
      target_restaurant_id: restaurantId,
      target_order_id: input.orderId,
      target_actor_user_id: input.actorUserId ?? null,
      target_service_due_at: input.serviceDueAt ?? null,
      target_delivery_status: input.deliveryStatus ?? null
    });
    throwIfSupabaseError(reservedOrderError);
    return reservedOrder;
  }

  const allocationPlan = await buildOrderInventoryAllocationPlan(db, restaurantId, input.orderId);

  // Quán chưa bật/migration inventory: vẫn cho nhận đơn (không trừ kho).
  if (!allocationPlan.schemaReady) {
    return acceptOrderWithoutInventory(restaurantId, input, "schema_missing");
  }

  const { data, error } = await db.rpc("accept_order_with_inventory_deduction", {
    target_restaurant_id: restaurantId,
    target_order_id: input.orderId,
    target_actor_user_id: input.actorUserId ?? null,
    target_service_due_at: input.serviceDueAt ?? null,
    target_delivery_status: input.deliveryStatus ?? null,
    target_allocations: hasReservedInventory ? [] : allocationPlan.allocations
  });

  if (isMissingInventorySchemaError(error)) {
    return acceptOrderWithoutInventory(restaurantId, input, "rpc_missing");
  }
  if (error?.message?.includes("partial order inventory sync")) {
    throw new AppError(
      "Đơn hàng có ledger kho chưa đồng bộ trọn vẹn. Hãy kiểm tra và rollback thủ công trước khi xác nhận lại.",
      409
    );
  }
  if (error?.message?.includes("stock negative") || error?.message?.includes("batch negative") || error?.message?.includes("balance is missing")) {
    throw new AppError("Tồn kho không đủ để xác nhận đơn. Hãy nhập thêm hàng hoặc điều chỉnh công thức.", 400);
  }
  if (error?.message?.includes("changed before inventory acceptance")) {
    throw new AppError("Trạng thái đơn đã thay đổi. Vui lòng tải lại danh sách đơn.", 409);
  }
  throwIfSupabaseError(error);
  return data;
}

export async function cancelOrderWithInventoryRollback(restaurantId: string, input: InventoryCancelOrderInput) {
  const supabase = createAdminSupabaseClient();
  const db = supabase as unknown as UntypedSupabase;
  const atomicReservationRollback = await db.rpc("cancel_order_with_inventory_reservation_rollback", {
    target_restaurant_id: restaurantId,
    target_order_id: input.orderId,
    target_actor_user_id: input.actorUserId ?? null
  });

  if (!isMissingInventorySchemaError(atomicReservationRollback.error)) {
    if (atomicReservationRollback.error?.message?.includes("stock negative") || atomicReservationRollback.error?.message?.includes("batch negative") || atomicReservationRollback.error?.message?.includes("balance is missing")) {
      throw new AppError("Không thể hoàn kho an toàn cho đơn này. Vui lòng kiểm tra ledger kho trước khi hủy.", 409);
    }
    if (atomicReservationRollback.error?.message?.includes("changed before inventory cancellation")) {
      throw new AppError("Trạng thái đơn đã thay đổi. Không thể huỷ an toàn, vui lòng tải lại.", 409);
    }
    throwIfSupabaseError(atomicReservationRollback.error);
    return atomicReservationRollback.data;
  }

  // Older deployments do not have the Phase 2 wrapper; preserve the Phase 1 path.
  await releaseReservedInventory(restaurantId, input.orderId, input.actorUserId);
  const { data, error } = await db.rpc("cancel_order_with_inventory_rollback", {
    target_restaurant_id: restaurantId,
    target_order_id: input.orderId,
    target_actor_user_id: input.actorUserId ?? null
  });

  if (isMissingInventorySchemaError(error)) {
    throw new AppError("Cần chạy migration atomic inventory trước khi hủy đơn.", 400);
  }
  if (error?.message?.includes("stock negative") || error?.message?.includes("batch negative") || error?.message?.includes("balance is missing")) {
    throw new AppError("Không thể hoàn kho an toàn cho đơn này. Vui lòng kiểm tra ledger kho trước khi hủy.", 409);
  }
  if (error?.message?.includes("changed before inventory cancellation")) {
    throw new AppError("Trạng thái đơn đã thay đổi. Không thể huỷ an toàn, vui lòng tải lại.", 409);
  }
  throwIfSupabaseError(error);
  return data;
}

export async function deductInventoryForOrder(
  restaurantId: string,
  orderId: string,
  actorUserId?: string | null
): Promise<InventoryOrderSyncResult> {
  const supabase = createInventoryMutationSupabaseClient(actorUserId);
  const db = supabase as unknown as UntypedSupabase;

  const existingResult = await db
    .from("inventory_movements")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("source_type", "order")
    .eq("source_id", orderId)
    .eq("movement_type", "deduct_sale")
    .limit(1);

  if (isMissingInventorySchemaError(existingResult.error)) {
    return { schemaReady: false, movementCount: 0, skippedReason: "schema_missing" };
  }
  throwIfSupabaseError(existingResult.error);
  if ((existingResult.data ?? []).length > 0) {
    return { schemaReady: true, movementCount: 0, skippedReason: "already_synced" };
  }

  const allocationPlan = await buildOrderInventoryAllocationPlan(db, restaurantId, orderId);
  if (!allocationPlan.schemaReady) {
    return { schemaReady: false, movementCount: 0, skippedReason: allocationPlan.skippedReason ?? "schema_missing" };
  }
  if (allocationPlan.allocations.length === 0) {
    return { schemaReady: true, movementCount: 0, skippedReason: allocationPlan.skippedReason };
  }

  let movementCount = 0;
  for (const allocation of allocationPlan.allocations) {
    const movement = await applyOrderInventoryMovement(db, restaurantId, {
      ingredientId: allocation.ingredientId,
      movementType: "deduct_sale",
      quantityDelta: -Math.abs(allocation.quantity),
      unitCost: allocation.unitCost,
      branchId: allocation.branchId,
      locationId: allocation.locationId,
      batchId: allocation.batchId,
      orderId,
      reason: "Tru kho theo don hang",
      metadata: {
        allocationMode: "fefo",
        allocationIndex: allocation.allocationIndex,
        demandQuantity: allocation.quantity
      },
      actorUserId
    });
    if (movement) movementCount += 1;
  }

  return {
    schemaReady: true,
    movementCount,
    allocatedQuantity: allocationPlan.allocatedQuantity,
    shortageCount: 0,
    allocationMode: "fefo"
  };
}

export async function rollbackInventoryForOrder(
  restaurantId: string,
  orderId: string,
  actorUserId?: string | null
): Promise<InventoryOrderSyncResult> {
  const supabase = createInventoryMutationSupabaseClient(actorUserId);
  const db = supabase as unknown as UntypedSupabase;

  const rollbackResult = await db
    .from("inventory_movements")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("source_type", "order")
    .eq("source_id", orderId)
    .eq("movement_type", "rollback")
    .limit(1);

  if (isMissingInventorySchemaError(rollbackResult.error)) {
    return { schemaReady: false, movementCount: 0, skippedReason: "schema_missing" };
  }
  throwIfSupabaseError(rollbackResult.error);
  if ((rollbackResult.data ?? []).length > 0) {
    return { schemaReady: true, movementCount: 0, skippedReason: "already_synced" };
  }

  const deductionsResult = await db
    .from("inventory_movements")
    .select("ingredient_id,branch_id,location_id,batch_id,quantity_delta,unit_cost,created_at")
    .eq("restaurant_id", restaurantId)
    .eq("source_type", "order")
    .eq("source_id", orderId)
    .eq("movement_type", "deduct_sale")
    .order("created_at", { ascending: true });

  if (isMissingInventorySchemaError(deductionsResult.error)) {
    return { schemaReady: false, movementCount: 0, skippedReason: "schema_missing" };
  }
  throwIfSupabaseError(deductionsResult.error);

  const rollbackAllocations = buildInventoryRollbackAllocations(
    ((deductionsResult.data ?? []) as ExistingOrderMovementRow[]).map((movement) => ({
      ingredientId: movement.ingredient_id,
      batchId: movement.batch_id ?? null,
      locationId: movement.location_id ?? null,
      branchId: movement.branch_id ?? null,
      quantityDelta: numberValue(movement.quantity_delta),
      unitCost: movement.unit_cost == null ? null : numberValue(movement.unit_cost),
      createdAt: movement.created_at
    }))
  );
  if (rollbackAllocations.length === 0) return { schemaReady: true, movementCount: 0, skippedReason: "no_recipes" };

  let movementCount = 0;
  for (const allocation of rollbackAllocations) {
    const movement = await applyOrderInventoryMovement(db, restaurantId, {
      ingredientId: allocation.ingredientId,
      movementType: "rollback",
      quantityDelta: Math.abs(allocation.quantity),
      unitCost: allocation.unitCost,
      branchId: allocation.branchId,
      locationId: allocation.locationId,
      batchId: allocation.batchId,
      orderId,
      reason: "Hoan kho do huy don hang",
      metadata: {
        allocationMode: "fefo",
        allocationIndex: allocation.allocationIndex,
        restoredBatchId: allocation.batchId,
        restoredLocationId: allocation.locationId
      },
      actorUserId
    });
    if (movement) movementCount += 1;
  }

  return {
    schemaReady: true,
    movementCount,
    allocatedQuantity: rollbackAllocations.reduce((total, allocation) => total + allocation.quantity, 0),
    shortageCount: 0,
    allocationMode: "fefo"
  };
}

export async function recordInventoryMovement(
  restaurantId: string,
  input: {
    ingredientId: string;
    movementType: Exclude<InventoryMovementType, "deduct_sale">;
    quantity: number;
    unitCost?: number;
    reason?: string;
    locationId?: string | null;
    batchId?: string | null;
    sourceType?: "manual" | "order" | "count" | "recipe" | "system" | "purchase_order" | "transfer" | "supplier" | "expiry" | "ai_draft";
    metadata?: Record<string, unknown>;
    actorUserId: string;
  }
) {
  const supabase = createInventoryMutationSupabaseClient(input.actorUserId);
  const db = supabase as unknown as UntypedSupabase;
  const { data, error } = await db.rpc("apply_inventory_movement", {
    target_restaurant_id: restaurantId,
    target_ingredient_id: input.ingredientId,
    target_movement_type: input.movementType,
    target_quantity_delta: signedMovementQuantity(input.movementType, input.quantity),
    target_unit_cost: input.unitCost ?? null,
    target_source_type: input.sourceType ?? "manual",
    target_source_id: null,
    target_reason: input.reason || null,
    target_actor_user_id: input.actorUserId,
    target_metadata: input.metadata ?? {},
    target_branch_id: null,
    target_location_id: input.locationId || null,
    target_batch_id: input.batchId || null,
    target_purchase_order_id: null,
    target_transfer_id: null
  });

  if (isMissingInventorySchemaError(error) && error?.code !== "P0001") {
    throw new AppError("Can chay migration inventory truoc khi ghi ledger kho.", 400);
  }
  if (error?.code === "P0001" || error?.message) {
    const message = error?.message ?? "";
    if (/scope mismatch/i.test(message)) {
      throw new AppError("Tai khoan chua gan dung nha hang de ghi nghiep vu kho.", 403);
    }
    if (/quantity cannot be zero/i.test(message)) {
      throw new AppError("So luong ghi kho phai khac 0.", 400);
    }
    if (/stock negative|batch negative|over-reserved|balance is missing|ingredient is missing/i.test(message)) {
      throw new AppError("Ton kho khong du de ghi phieu giam hoac hao hut.", 400);
    }
  }
  throwIfSupabaseError(error);
  if (!data) throw new AppError(inventoryMutationError, 500);
  return data;
}
