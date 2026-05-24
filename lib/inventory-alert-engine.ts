import { createHash } from "node:crypto";

export const INVENTORY_ALERT_TYPES = [
  "low_stock",
  "out_of_stock",
  "expiring_soon",
  "expired",
  "abnormal_usage",
  "waste_spike",
  "missing_inventory",
  "supplier_delay",
  "price_spike",
  "recipe_gap",
  "stale_stock"
] as const;

export type InventoryAlertType = (typeof INVENTORY_ALERT_TYPES)[number];
export type InventoryAlertSeverity = "low" | "medium" | "high" | "critical";

export type InventoryAlertCandidate = {
  alertType: InventoryAlertType;
  severity: InventoryAlertSeverity;
  sourceType: "system" | "stock_balance" | "batch" | "movement" | "purchase_order" | "recipe" | "supplier";
  sourceId: string;
  branchId: string | null;
  ingredientId: string | null;
  title: string;
  detail: string;
  metadata: Record<string, unknown>;
};

export type InventoryAlertStockBalanceInput = {
  id: string;
  branchId: string | null;
  locationId: string | null;
  batchId: string | null;
  ingredientId: string;
  ingredientName: string;
  ingredientUnit: string;
  onHandQuantity: number;
  reservedQuantity: number;
  incomingQuantity: number;
  minimumQuantity: number;
  referenceUnitCost: number;
  countedAt?: string | null;
  updatedAt?: string | null;
};

export type InventoryAlertBatchInput = {
  id: string;
  ingredientId: string;
  ingredientName: string;
  ingredientUnit: string;
  batchCode: string | null;
  expirationDate: string | null;
  remainingQuantity: number;
  unitCost: number;
  status: string | null;
};

export type InventoryAlertMovementInput = {
  id?: string;
  ingredientId: string;
  branchId: string | null;
  ingredientName: string;
  ingredientUnit: string;
  movementType: string;
  quantityDelta: number;
  unitCost: number | null;
  referenceUnitCost: number;
  createdAt: string;
  locationId?: string | null;
  batchId?: string | null;
};

export type InventoryAlertPurchaseOrderInput = {
  id: string;
  branchId: string | null;
  supplierName: string | null;
  poNumber: string;
  status: string;
  expectedDeliveryAt: string | null;
  totalAmount: number;
  firstIngredientId: string | null;
  firstIngredientName: string | null;
  lineCount: number;
};

export type InventoryAlertIngredientInput = {
  id: string;
  name: string;
  unit: string;
  onHandQuantity: number;
  minimumQuantity: number;
};

export type InventoryAlertRecipeGapInput = {
  menuItemId: string;
  name: string;
  isAvailable: boolean;
  recipeLineCount: number;
};

export type BuildInventoryAlertCandidatesInput = {
  now?: Date;
  expiryWindowDays?: number;
  staleStockDays?: number;
  stockBalances: InventoryAlertStockBalanceInput[];
  batches: InventoryAlertBatchInput[];
  movements: InventoryAlertMovementInput[];
  purchaseOrders: InventoryAlertPurchaseOrderInput[];
  ingredients: InventoryAlertIngredientInput[];
  recipeGaps: InventoryAlertRecipeGapInput[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const severityRank: Record<InventoryAlertSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

function stableUuid(input: string) {
  const hex = createHash("sha1").update(input).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 32)}`;
}

function startOfDay(value: Date) {
  const copy = new Date(value);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function daysUntil(dateValue: string | null, now: Date) {
  if (!dateValue) return null;
  const target = startOfDay(new Date(`${dateValue.slice(0, 10)}T00:00:00`));
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - startOfDay(now).getTime()) / DAY_MS);
}

function daysAgo(dateValue: string, now: Date) {
  const target = new Date(dateValue);
  if (Number.isNaN(target.getTime())) return Number.POSITIVE_INFINITY;
  return (now.getTime() - target.getTime()) / DAY_MS;
}

function formatQuantity(value: number, unit: string) {
  return `${Number(value.toFixed(2)).toLocaleString("vi-VN")} ${unit}`;
}

function formatVnd(value: number) {
  return `${Math.max(0, Math.round(value)).toLocaleString("vi-VN")}đ`;
}

function pushCandidate(candidates: Map<string, InventoryAlertCandidate>, candidate: InventoryAlertCandidate) {
  const metadata = {
    ...candidate.metadata,
    engineVersion: "inventory_alert_engine_v2"
  };
  const normalized = { ...candidate, metadata };
  const key = `${normalized.alertType}:${normalized.sourceId}`;
  const existing = candidates.get(key);
  if (!existing || severityRank[normalized.severity] > severityRank[existing.severity]) {
    candidates.set(key, normalized);
  }
}

function sourceFor(type: InventoryAlertType, parts: Array<string | null | undefined>) {
  return stableUuid([type, ...parts.map((part) => part || "global")].join(":"));
}

function stockActivityKey(input: {
  ingredientId: string;
  branchId: string | null;
  locationId: string | null;
  batchId: string | null;
}) {
  return [input.ingredientId, input.branchId || "global", input.locationId || "global", input.batchId || "no-batch"].join(":");
}

function newerDate(left: string | null | undefined, right: string | null | undefined) {
  if (!left) return right ?? null;
  if (!right) return left;
  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}

function buildStockCandidates(input: BuildInventoryAlertCandidatesInput, candidates: Map<string, InventoryAlertCandidate>) {
  for (const balance of input.stockBalances) {
    const availableQuantity = Math.max(0, balance.onHandQuantity - balance.reservedQuantity);
    if (balance.minimumQuantity > 0 && availableQuantity <= balance.minimumQuantity) {
      const outOfStock = availableQuantity <= 0;
      pushCandidate(candidates, {
        alertType: outOfStock ? "out_of_stock" : "low_stock",
        severity: outOfStock ? "critical" : availableQuantity <= balance.minimumQuantity * 0.5 ? "high" : "medium",
        sourceType: "stock_balance",
        sourceId: balance.id,
        branchId: balance.branchId,
        ingredientId: balance.ingredientId,
        title: outOfStock ? `${balance.ingredientName} đã hết hàng` : `${balance.ingredientName} sắp hết`,
        detail: `Khả dụng ${formatQuantity(availableQuantity, balance.ingredientUnit)}, ngưỡng tối thiểu ${formatQuantity(balance.minimumQuantity, balance.ingredientUnit)}.`,
        metadata: {
          availableQuantity,
          minimumQuantity: balance.minimumQuantity,
          incomingQuantity: balance.incomingQuantity,
          locationId: balance.locationId,
          batchId: balance.batchId,
          estimatedShortageValue: Math.round(Math.max(0, balance.minimumQuantity - availableQuantity) * balance.referenceUnitCost)
        }
      });
    }
  }
}

function buildStaleStockCandidates(input: BuildInventoryAlertCandidatesInput, candidates: Map<string, InventoryAlertCandidate>) {
  const now = input.now ?? new Date();
  const staleStockDays = input.staleStockDays ?? 21;
  const latestMovementByStock = new Map<string, string>();

  for (const movement of input.movements) {
    const key = stockActivityKey({
      ingredientId: movement.ingredientId,
      branchId: movement.branchId,
      locationId: movement.locationId ?? null,
      batchId: movement.batchId ?? null
    });
    latestMovementByStock.set(key, newerDate(latestMovementByStock.get(key), movement.createdAt) ?? movement.createdAt);
  }

  for (const balance of input.stockBalances) {
    const availableQuantity = Math.max(0, balance.onHandQuantity - balance.reservedQuantity);
    if (availableQuantity <= 0 || (balance.minimumQuantity > 0 && availableQuantity <= balance.minimumQuantity)) continue;

    const key = stockActivityKey(balance);
    const latestActivityAt = newerDate(newerDate(balance.countedAt, balance.updatedAt), latestMovementByStock.get(key));
    const ageDays = latestActivityAt ? daysAgo(latestActivityAt, now) : Number.POSITIVE_INFINITY;
    if (ageDays < staleStockDays) continue;

    const estimatedValue = Math.round(availableQuantity * balance.referenceUnitCost);
    const ageLabel = Number.isFinite(ageDays) ? `${Math.floor(ageDays)} ngày` : `trên ${staleStockDays} ngày`;
    pushCandidate(candidates, {
      alertType: "stale_stock",
      severity: ageDays >= staleStockDays * 3 || estimatedValue >= 1000000 ? "high" : ageDays >= staleStockDays * 2 ? "medium" : "low",
      sourceType: "stock_balance",
      sourceId: balance.id,
      branchId: balance.branchId,
      ingredientId: balance.ingredientId,
      title: `${balance.ingredientName} tồn lâu chưa kiểm kê`,
      detail: `Khả dụng ${formatQuantity(availableQuantity, balance.ingredientUnit)} nhưng chưa có hoạt động/kiểm kê ${ageLabel}.`,
      metadata: {
        availableQuantity,
        minimumQuantity: balance.minimumQuantity,
        latestActivityAt,
        staleStockDays,
        estimatedValue,
        locationId: balance.locationId,
        batchId: balance.batchId
      }
    });
  }
}

function buildBatchCandidates(input: BuildInventoryAlertCandidatesInput, candidates: Map<string, InventoryAlertCandidate>) {
  const windowDays = input.expiryWindowDays ?? 7;
  const now = input.now ?? new Date();

  for (const batch of input.batches) {
    if (batch.remainingQuantity <= 0) continue;
    const daysLeft = daysUntil(batch.expirationDate, now);
    if (daysLeft === null && batch.status !== "expired") continue;
    const isExpired = batch.status === "expired" || (daysLeft !== null && daysLeft <= 0);
    if (!isExpired && (daysLeft === null || daysLeft > windowDays)) continue;

    pushCandidate(candidates, {
      alertType: isExpired ? "expired" : "expiring_soon",
      severity: isExpired ? "critical" : daysLeft !== null && daysLeft <= 2 ? "high" : "medium",
      sourceType: "batch",
      sourceId: batch.id,
      branchId: null,
      ingredientId: batch.ingredientId,
      title: isExpired ? `${batch.ingredientName} có lô hết hạn` : `${batch.ingredientName} sắp hết hạn`,
      detail: `Lô ${batch.batchCode || "không mã"} ${isExpired ? "đã hết hạn" : `còn ${daysLeft} ngày`}, còn ${formatQuantity(batch.remainingQuantity, batch.ingredientUnit)}.`,
      metadata: {
        batchCode: batch.batchCode,
        expirationDate: batch.expirationDate,
        daysLeft,
        remainingQuantity: batch.remainingQuantity,
        estimatedValue: Math.round(batch.remainingQuantity * batch.unitCost)
      }
    });
  }
}

function buildPurchaseOrderCandidates(input: BuildInventoryAlertCandidatesInput, candidates: Map<string, InventoryAlertCandidate>) {
  const now = input.now ?? new Date();
  const openStatuses = new Set(["pending", "approved", "ordered", "partially_delivered"]);

  for (const order of input.purchaseOrders) {
    if (!openStatuses.has(order.status) || !order.expectedDeliveryAt) continue;
    const overdueDays = Math.floor((startOfDay(now).getTime() - startOfDay(new Date(order.expectedDeliveryAt)).getTime()) / DAY_MS);
    if (overdueDays < 0) continue;

    pushCandidate(candidates, {
      alertType: "supplier_delay",
      severity: overdueDays >= 3 ? "critical" : overdueDays >= 1 ? "high" : "medium",
      sourceType: "purchase_order",
      sourceId: order.id,
      branchId: order.branchId,
      ingredientId: order.firstIngredientId,
      title: `${order.poNumber} trễ giao hàng`,
      detail: `${order.supplierName || "Nhà cung cấp"} ${overdueDays === 0 ? "đến hạn hôm nay" : `trễ ${overdueDays} ngày`}, ${order.lineCount} dòng hàng đang mở.`,
      metadata: {
        poNumber: order.poNumber,
        status: order.status,
        expectedDeliveryAt: order.expectedDeliveryAt,
        overdueDays,
        supplierName: order.supplierName,
        firstIngredientName: order.firstIngredientName,
        totalAmount: order.totalAmount
      }
    });
  }
}

function buildMovementCandidates(input: BuildInventoryAlertCandidatesInput, candidates: Map<string, InventoryAlertCandidate>) {
  const now = input.now ?? new Date();
  const usageTypes = new Set(["deduct_sale", "internal_use", "adjust_decrease"]);
  const wasteTypes = new Set(["waste", "expired"]);
  const buckets = new Map<
    string,
    {
      ingredientId: string;
      branchId: string | null;
      name: string;
      unit: string;
      currentUsageQty: number;
      previousUsageQty: number;
      currentUsageCost: number;
      previousUsageCost: number;
      currentWasteQty: number;
      previousWasteQty: number;
      currentWasteCost: number;
      previousWasteCost: number;
      currentWasteCount: number;
    }
  >();
  const receiveCostsByIngredient = new Map<string, Array<{ cost: number; createdAt: string; name: string }>>();

  for (const movement of input.movements) {
    const ageDays = daysAgo(movement.createdAt, now);
    if (ageDays < 0 || ageDays > 30) continue;
    const quantity = Math.abs(movement.quantityDelta);
    const unitCost = movement.unitCost ?? movement.referenceUnitCost;
    const value = quantity * Math.max(0, unitCost);
    const key = `${movement.ingredientId}:${movement.branchId || "global"}`;
    const bucket =
      buckets.get(key) ??
      {
        ingredientId: movement.ingredientId,
        branchId: movement.branchId,
        name: movement.ingredientName,
        unit: movement.ingredientUnit,
        currentUsageQty: 0,
        previousUsageQty: 0,
        currentUsageCost: 0,
        previousUsageCost: 0,
        currentWasteQty: 0,
        previousWasteQty: 0,
        currentWasteCost: 0,
        previousWasteCost: 0,
        currentWasteCount: 0
      };

    if (usageTypes.has(movement.movementType) && movement.quantityDelta < 0) {
      if (ageDays <= 7) {
        bucket.currentUsageQty += quantity;
        bucket.currentUsageCost += value;
      } else {
        bucket.previousUsageQty += quantity;
        bucket.previousUsageCost += value;
      }
    }

    if (wasteTypes.has(movement.movementType) && movement.quantityDelta < 0) {
      if (ageDays <= 7) {
        bucket.currentWasteQty += quantity;
        bucket.currentWasteCost += value;
        bucket.currentWasteCount += 1;
      } else {
        bucket.previousWasteQty += quantity;
        bucket.previousWasteCost += value;
      }
    }

    buckets.set(key, bucket);

    if (movement.movementType === "receive" && unitCost > 0) {
      const costs = receiveCostsByIngredient.get(movement.ingredientId) ?? [];
      costs.push({ cost: unitCost, createdAt: movement.createdAt, name: movement.ingredientName });
      receiveCostsByIngredient.set(movement.ingredientId, costs);
    }
  }

  for (const bucket of buckets.values()) {
    const previousUsage7DayCost = bucket.previousUsageCost / (23 / 7);
    const previousUsage7DayQty = bucket.previousUsageQty / (23 / 7);
    const usageCostSpike = bucket.currentUsageCost >= Math.max(150000, previousUsage7DayCost * 2.2);
    const usageQuantitySpike = bucket.currentUsageQty >= Math.max(10, previousUsage7DayQty * 2.5) && bucket.currentUsageCost >= 50000;
    if (bucket.currentUsageQty > 0 && (usageCostSpike || usageQuantitySpike)) {
      pushCandidate(candidates, {
        alertType: "abnormal_usage",
        severity: bucket.currentUsageCost >= 800000 ? "critical" : bucket.currentUsageCost >= 300000 ? "high" : "medium",
        sourceType: "movement",
        sourceId: sourceFor("abnormal_usage", [bucket.ingredientId, bucket.branchId]),
        branchId: bucket.branchId,
        ingredientId: bucket.ingredientId,
        title: `${bucket.name} dùng bất thường`,
        detail: `7 ngày gần nhất dùng ${formatQuantity(bucket.currentUsageQty, bucket.unit)} (${formatVnd(bucket.currentUsageCost)}), cao hơn nền trước đó.`,
        metadata: {
          currentUsageQty: bucket.currentUsageQty,
          previousUsageQty: bucket.previousUsageQty,
          currentUsageCost: Math.round(bucket.currentUsageCost),
          previousUsage7DayCost: Math.round(previousUsage7DayCost)
        }
      });
    }

    const previousWaste7DayCost = bucket.previousWasteCost / (23 / 7);
    if (
      bucket.currentWasteQty > 0 &&
      bucket.currentWasteCost >= Math.max(50000, previousWaste7DayCost * 1.8) &&
      (bucket.currentWasteCount >= 2 || bucket.currentWasteCost >= 200000)
    ) {
      pushCandidate(candidates, {
        alertType: "waste_spike",
        severity: bucket.currentWasteCost >= 800000 ? "critical" : bucket.currentWasteCost >= 200000 ? "high" : "medium",
        sourceType: "movement",
        sourceId: sourceFor("waste_spike", [bucket.ingredientId, bucket.branchId]),
        branchId: bucket.branchId,
        ingredientId: bucket.ingredientId,
        title: `${bucket.name} hao hụt tăng`,
        detail: `7 ngày gần nhất ghi ${formatQuantity(bucket.currentWasteQty, bucket.unit)} hao hụt, ước tính ${formatVnd(bucket.currentWasteCost)}.`,
        metadata: {
          currentWasteQty: bucket.currentWasteQty,
          previousWasteQty: bucket.previousWasteQty,
          currentWasteCost: Math.round(bucket.currentWasteCost),
          previousWaste7DayCost: Math.round(previousWaste7DayCost),
          currentWasteCount: bucket.currentWasteCount
        }
      });
    }
  }

  for (const [ingredientId, costs] of receiveCostsByIngredient) {
    const sorted = costs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const latest = sorted[0];
    const previous = sorted.slice(1, 6);
    if (!latest || previous.length === 0 || daysAgo(latest.createdAt, now) > 7) continue;
    const previousAverage = previous.reduce((sum, item) => sum + item.cost, 0) / previous.length;
    const changePercent = previousAverage > 0 ? ((latest.cost - previousAverage) / previousAverage) * 100 : 0;
    if (changePercent < 15 || latest.cost - previousAverage < 1000) continue;

    pushCandidate(candidates, {
      alertType: "price_spike",
      severity: changePercent >= 35 ? "high" : "medium",
      sourceType: "supplier",
      sourceId: ingredientId,
      branchId: null,
      ingredientId,
      title: `${latest.name} tăng giá nhập`,
      detail: `Giá nhập mới ${formatVnd(latest.cost)}, cao hơn trung bình gần đây ${Math.round(changePercent)}%.`,
      metadata: {
        latestUnitCost: latest.cost,
        previousAverageUnitCost: Math.round(previousAverage),
        changePercent: Math.round(changePercent)
      }
    });
  }
}

function buildMissingInventoryCandidates(input: BuildInventoryAlertCandidatesInput, candidates: Map<string, InventoryAlertCandidate>) {
  const stockIngredientIds = new Set(input.stockBalances.map((balance) => balance.ingredientId));
  for (const ingredient of input.ingredients) {
    if (stockIngredientIds.has(ingredient.id)) continue;
    if (ingredient.onHandQuantity <= 0 && ingredient.minimumQuantity <= 0) continue;
    pushCandidate(candidates, {
      alertType: "missing_inventory",
      severity: ingredient.onHandQuantity > 0 ? "high" : "medium",
      sourceType: "system",
      sourceId: ingredient.id,
      branchId: null,
      ingredientId: ingredient.id,
      title: `${ingredient.name} thiếu dòng stock balance`,
      detail: `Nguyên liệu có tồn hệ thống ${formatQuantity(ingredient.onHandQuantity, ingredient.unit)} nhưng chưa có balance theo kho/lô để kiểm soát realtime.`,
      metadata: {
        onHandQuantity: ingredient.onHandQuantity,
        minimumQuantity: ingredient.minimumQuantity
      }
    });
  }
}

function buildRecipeGapCandidates(input: BuildInventoryAlertCandidatesInput, candidates: Map<string, InventoryAlertCandidate>) {
  for (const item of input.recipeGaps) {
    if (!item.isAvailable || item.recipeLineCount > 0) continue;
    pushCandidate(candidates, {
      alertType: "recipe_gap",
      severity: "medium",
      sourceType: "recipe",
      sourceId: item.menuItemId,
      branchId: null,
      ingredientId: null,
      title: `${item.name} chưa có định mức`,
      detail: "Món đang bật bán nhưng chưa có BOM/recipe nên đơn hàng không thể tự trừ kho chính xác.",
      metadata: {
        menuItemId: item.menuItemId,
        recipeLineCount: item.recipeLineCount
      }
    });
  }
}

export function buildInventoryAlertCandidates(input: BuildInventoryAlertCandidatesInput): InventoryAlertCandidate[] {
  const candidates = new Map<string, InventoryAlertCandidate>();
  buildStockCandidates(input, candidates);
  buildStaleStockCandidates(input, candidates);
  buildBatchCandidates(input, candidates);
  buildPurchaseOrderCandidates(input, candidates);
  buildMovementCandidates(input, candidates);
  buildMissingInventoryCandidates(input, candidates);
  buildRecipeGapCandidates(input, candidates);

  return [...candidates.values()].sort(
    (a, b) =>
      severityRank[b.severity] - severityRank[a.severity] ||
      INVENTORY_ALERT_TYPES.indexOf(a.alertType) - INVENTORY_ALERT_TYPES.indexOf(b.alertType) ||
      a.title.localeCompare(b.title, "vi")
  );
}
