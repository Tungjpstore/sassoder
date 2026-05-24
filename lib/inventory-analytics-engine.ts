export type InventoryAnalyticsSeverity = "green" | "yellow" | "red" | "blue";

export type InventoryAnalyticsStockStatus = "available" | "low" | "out_of_stock" | "expired" | "pending_import";
export type InventoryAnalyticsCostStatus = "healthy" | "watch" | "high" | "critical";

export type InventoryAnalyticsStockInput = {
  id: string;
  ingredientName: string;
  ingredientUnit: string;
  locationName: string | null;
  branchName: string | null;
  batchCode: string | null;
  expirationDate: string | null;
  onHandQuantity: number;
  availableQuantity: number;
  reservedQuantity: number;
  incomingQuantity: number;
  referenceUnitCost: number;
  status: InventoryAnalyticsStockStatus;
};

export type InventoryAnalyticsPurchaseOrderInput = {
  id: string;
  status: string;
  supplierName: string | null;
  totalAmount: number;
  expectedDeliveryAt: string | null;
  lineCount: number;
};

export type InventoryAnalyticsCountInput = {
  id: string;
  title: string;
  status: string;
  locationName: string | null;
  lineCount: number;
  totalAbsVariance: number;
  totalVarianceValue: number;
};

export type InventoryAnalyticsRecipeInput = {
  id: string;
  name: string;
  categoryName: string;
  price: number;
  recipeLineCount: number;
  recipeCostPercent: number;
  grossProfit: number;
  grossMarginPercent: number;
  costStatus: InventoryAnalyticsCostStatus;
};

export type InventoryAnalyticsAlertInput = {
  id: string;
  alertType: string;
  severity: "low" | "medium" | "high" | "critical";
  status: string;
};

export type InventoryAnalyticsInput = {
  now?: Date | string;
  stockBalances: InventoryAnalyticsStockInput[];
  purchaseOrders: InventoryAnalyticsPurchaseOrderInput[];
  countSessions: InventoryAnalyticsCountInput[];
  recipeItems: InventoryAnalyticsRecipeInput[];
  alerts: InventoryAnalyticsAlertInput[];
};

export type InventoryAnalytics = {
  generatedAt: string;
  riskScore: number;
  workingCapital: {
    onHandValue: number;
    availableValue: number;
    reservedValue: number;
    incomingValue: number;
    riskValue: number;
  };
  stockSignals: {
    lowOrOutCount: number;
    expiredCount: number;
    expiringSoonCount: number;
    pendingImportCount: number;
    reservedLineCount: number;
  };
  purchasing: {
    openPurchaseOrderCount: number;
    latePurchaseOrderCount: number;
    openPurchaseValue: number;
    latePurchaseValue: number;
    supplierExposure: Array<{
      supplierName: string;
      openCount: number;
      lateCount: number;
      openValue: number;
      lineCount: number;
    }>;
  };
  counting: {
    activeSessionCount: number;
    varianceValue: number;
    varianceQuantity: number;
    largestVarianceSession: {
      id: string;
      title: string;
      locationName: string | null;
      totalVarianceValue: number;
    } | null;
  };
  recipeEconomics: {
    recipeReadyCount: number;
    missingRecipeCount: number;
    highCostCount: number;
    averageFoodCostPercent: number;
    averageGrossMarginPercent: number;
    grossProfitPool: number;
  };
  locationExposure: Array<{
    locationName: string;
    onHandValue: number;
    riskValue: number;
    reservedValue: number;
    lineCount: number;
    riskLineCount: number;
  }>;
  alertMix: Array<{
    label: string;
    count: number;
    severity: InventoryAnalyticsSeverity;
  }>;
  actionQueue: Array<{
    id: string;
    title: string;
    detail: string;
    value: string;
    severity: InventoryAnalyticsSeverity;
  }>;
};

const openPurchaseStatuses = new Set(["draft", "pending", "approved", "ordered", "partially_delivered"]);

function currency(value: number) {
  return Math.round(Math.max(0, Number(value) || 0));
}

function percent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function parseDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(value: string | null, now: Date) {
  const target = parseDate(value ? `${value}T00:00:00` : null);
  if (!target) return null;
  const current = new Date(now);
  current.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - current.getTime()) / 86_400_000);
}

function isLatePurchaseOrder(order: InventoryAnalyticsPurchaseOrderInput, now: Date) {
  if (!openPurchaseStatuses.has(order.status)) return false;
  const expected = parseDate(order.expectedDeliveryAt);
  return Boolean(expected && expected.getTime() < now.getTime());
}

function isRiskStock(row: InventoryAnalyticsStockInput, now: Date) {
  const expiringSoon = daysUntil(row.expirationDate, now);
  return row.status !== "available" || (expiringSoon !== null && expiringSoon <= 7 && row.availableQuantity > 0);
}

function locationName(row: InventoryAnalyticsStockInput) {
  return row.locationName || row.branchName || "Kho chính";
}

function buildLocationExposure(stockBalances: InventoryAnalyticsStockInput[], now: Date) {
  const byLocation = new Map<string, InventoryAnalytics["locationExposure"][number]>();
  for (const row of stockBalances) {
    const key = locationName(row);
    const current =
      byLocation.get(key) ?? {
        locationName: key,
        onHandValue: 0,
        riskValue: 0,
        reservedValue: 0,
        lineCount: 0,
        riskLineCount: 0
      };
    const onHandValue = currency(row.onHandQuantity * row.referenceUnitCost);
    current.onHandValue += onHandValue;
    current.reservedValue += currency(row.reservedQuantity * row.referenceUnitCost);
    current.lineCount += 1;
    if (isRiskStock(row, now)) {
      current.riskValue += onHandValue;
      current.riskLineCount += 1;
    }
    byLocation.set(key, current);
  }

  return [...byLocation.values()]
    .map((item) => ({
      ...item,
      onHandValue: currency(item.onHandValue),
      riskValue: currency(item.riskValue),
      reservedValue: currency(item.reservedValue)
    }))
    .sort((left, right) => right.riskValue - left.riskValue || right.onHandValue - left.onHandValue)
    .slice(0, 6);
}

function buildSupplierExposure(purchaseOrders: InventoryAnalyticsPurchaseOrderInput[], now: Date) {
  const bySupplier = new Map<string, InventoryAnalytics["purchasing"]["supplierExposure"][number]>();
  for (const order of purchaseOrders.filter((item) => openPurchaseStatuses.has(item.status))) {
    const key = order.supplierName || "Chưa chọn NCC";
    const current = bySupplier.get(key) ?? { supplierName: key, openCount: 0, lateCount: 0, openValue: 0, lineCount: 0 };
    current.openCount += 1;
    current.lineCount += order.lineCount;
    current.openValue += currency(order.totalAmount);
    if (isLatePurchaseOrder(order, now)) current.lateCount += 1;
    bySupplier.set(key, current);
  }

  return [...bySupplier.values()]
    .map((item) => ({ ...item, openValue: currency(item.openValue) }))
    .sort((left, right) => right.lateCount - left.lateCount || right.openValue - left.openValue)
    .slice(0, 6);
}

function buildAlertMix(alerts: InventoryAnalyticsAlertInput[]) {
  const groups = new Map<string, { count: number; maxSeverity: number }>();
  const severityRank = { low: 1, medium: 2, high: 3, critical: 4 };
  for (const alert of alerts.filter((item) => item.status === "open" || item.status === "acknowledged")) {
    const current = groups.get(alert.alertType) ?? { count: 0, maxSeverity: 0 };
    current.count += 1;
    current.maxSeverity = Math.max(current.maxSeverity, severityRank[alert.severity]);
    groups.set(alert.alertType, current);
  }

  return [...groups.entries()]
    .map(([label, item]) => ({
      label,
      count: item.count,
      severity: item.maxSeverity >= 3 ? "red" : item.maxSeverity === 2 ? "yellow" : "blue"
    }) satisfies InventoryAnalytics["alertMix"][number])
    .sort((left, right) => right.count - left.count)
    .slice(0, 8);
}

function buildActionQueue(analytics: Omit<InventoryAnalytics, "actionQueue">) {
  const actions: InventoryAnalytics["actionQueue"] = [];
  if (analytics.stockSignals.lowOrOutCount > 0) {
    actions.push({
      id: "stock-risk",
      title: "Xử lý nguyên liệu thiếu",
      detail: `${analytics.stockSignals.lowOrOutCount} dòng đang thấp hoặc hết hàng.`,
      value: `${analytics.stockSignals.lowOrOutCount}`,
      severity: "red"
    });
  }
  if (analytics.purchasing.latePurchaseOrderCount > 0) {
    actions.push({
      id: "late-po",
      title: "Theo dõi PO trễ",
      detail: `${analytics.purchasing.latePurchaseOrderCount} đơn mua đã quá thời gian dự kiến.`,
      value: `${analytics.purchasing.latePurchaseOrderCount}`,
      severity: "yellow"
    });
  }
  if (analytics.recipeEconomics.highCostCount > 0 || analytics.recipeEconomics.missingRecipeCount > 0) {
    actions.push({
      id: "recipe-economics",
      title: "Rà food cost",
      detail: `${analytics.recipeEconomics.highCostCount} món cost cao, ${analytics.recipeEconomics.missingRecipeCount} món thiếu recipe.`,
      value: `${analytics.recipeEconomics.highCostCount + analytics.recipeEconomics.missingRecipeCount}`,
      severity: analytics.recipeEconomics.highCostCount > 0 ? "red" : "yellow"
    });
  }
  if (analytics.counting.varianceValue > 0) {
    actions.push({
      id: "count-variance",
      title: "Kiểm tra lệch kiểm kê",
      detail: `Giá trị lệch gần đây khoảng ${analytics.counting.varianceValue.toLocaleString("vi-VN")}đ.`,
      value: analytics.counting.varianceValue.toLocaleString("vi-VN"),
      severity: "blue"
    });
  }
  return actions.slice(0, 5);
}

export function buildInventoryAnalytics(input: InventoryAnalyticsInput): InventoryAnalytics {
  const now = parseDate(input.now) ?? new Date();
  const stockBalances = input.stockBalances;
  const openPurchaseOrders = input.purchaseOrders.filter((order) => openPurchaseStatuses.has(order.status));
  const latePurchaseOrders = openPurchaseOrders.filter((order) => isLatePurchaseOrder(order, now));
  const recipeReadyItems = input.recipeItems.filter((item) => item.recipeLineCount > 0);
  const highCostItems = recipeReadyItems.filter((item) => item.costStatus === "high" || item.costStatus === "critical");
  const missingRecipeItems = input.recipeItems.filter((item) => item.recipeLineCount === 0);
  const riskRows = stockBalances.filter((row) => isRiskStock(row, now));
  const activeCountSessions = input.countSessions.filter((session) => session.status !== "applied" && session.status !== "cancelled");
  const largestVariance = [...input.countSessions].sort((left, right) => right.totalVarianceValue - left.totalVarianceValue)[0];

  const base = {
    generatedAt: now.toISOString(),
    riskScore: 0,
    workingCapital: {
      onHandValue: currency(stockBalances.reduce((sum, row) => sum + row.onHandQuantity * row.referenceUnitCost, 0)),
      availableValue: currency(stockBalances.reduce((sum, row) => sum + row.availableQuantity * row.referenceUnitCost, 0)),
      reservedValue: currency(stockBalances.reduce((sum, row) => sum + row.reservedQuantity * row.referenceUnitCost, 0)),
      incomingValue: currency(stockBalances.reduce((sum, row) => sum + row.incomingQuantity * row.referenceUnitCost, 0)),
      riskValue: currency(riskRows.reduce((sum, row) => sum + Math.max(row.onHandQuantity, row.availableQuantity) * row.referenceUnitCost, 0))
    },
    stockSignals: {
      lowOrOutCount: stockBalances.filter((row) => row.status === "low" || row.status === "out_of_stock").length,
      expiredCount: stockBalances.filter((row) => row.status === "expired").length,
      expiringSoonCount: stockBalances.filter((row) => {
        const days = daysUntil(row.expirationDate, now);
        return days !== null && days <= 7 && row.availableQuantity > 0;
      }).length,
      pendingImportCount: stockBalances.filter((row) => row.status === "pending_import" || row.incomingQuantity > 0).length,
      reservedLineCount: stockBalances.filter((row) => row.reservedQuantity > 0).length
    },
    purchasing: {
      openPurchaseOrderCount: openPurchaseOrders.length,
      latePurchaseOrderCount: latePurchaseOrders.length,
      openPurchaseValue: currency(openPurchaseOrders.reduce((sum, order) => sum + order.totalAmount, 0)),
      latePurchaseValue: currency(latePurchaseOrders.reduce((sum, order) => sum + order.totalAmount, 0)),
      supplierExposure: buildSupplierExposure(input.purchaseOrders, now)
    },
    counting: {
      activeSessionCount: activeCountSessions.length,
      varianceValue: currency(input.countSessions.reduce((sum, session) => sum + session.totalVarianceValue, 0)),
      varianceQuantity: percent(input.countSessions.reduce((sum, session) => sum + session.totalAbsVariance, 0)),
      largestVarianceSession:
        largestVariance && largestVariance.totalVarianceValue > 0
          ? {
              id: largestVariance.id,
              title: largestVariance.title,
              locationName: largestVariance.locationName,
              totalVarianceValue: largestVariance.totalVarianceValue
            }
          : null
    },
    recipeEconomics: {
      recipeReadyCount: recipeReadyItems.length,
      missingRecipeCount: missingRecipeItems.length,
      highCostCount: highCostItems.length,
      averageFoodCostPercent: recipeReadyItems.length > 0 ? percent(recipeReadyItems.reduce((sum, item) => sum + item.recipeCostPercent, 0) / recipeReadyItems.length) : 0,
      averageGrossMarginPercent: recipeReadyItems.length > 0 ? percent(recipeReadyItems.reduce((sum, item) => sum + item.grossMarginPercent, 0) / recipeReadyItems.length) : 0,
      grossProfitPool: currency(recipeReadyItems.reduce((sum, item) => sum + item.grossProfit, 0))
    },
    locationExposure: buildLocationExposure(stockBalances, now),
    alertMix: buildAlertMix(input.alerts)
  };
  const riskScore = Math.max(
    0,
    Math.min(
      100,
      100 -
        base.stockSignals.lowOrOutCount * 7 -
        base.stockSignals.expiredCount * 9 -
        base.stockSignals.expiringSoonCount * 4 -
        base.purchasing.latePurchaseOrderCount * 8 -
        base.recipeEconomics.highCostCount * 5 -
        base.recipeEconomics.missingRecipeCount * 2 -
        base.counting.activeSessionCount * 3
    )
  );

  const analytics = { ...base, riskScore };
  return { ...analytics, actionQueue: buildActionQueue(analytics) };
}
