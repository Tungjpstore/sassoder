export type PurchasePlanPriority = "urgent" | "soon" | "planned";

export type PurchasePlanReorderInput = {
  ingredientId: string;
  name: string;
  unit: string;
  onHandQuantity: number;
  minimumQuantity: number;
  dailyUsage: number;
  daysLeft: number | null;
  reorderQuantity: number;
  estimatedCost: number;
  urgency: "high" | "medium" | "low";
};

export type PurchasePlanSupplierInput = {
  id: string;
  name: string;
  defaultLeadDays: number;
  isPreferred: boolean;
  productCount: number;
};

export type PurchasePlanOrderInput = {
  id: string;
  status: string;
  supplierName: string | null;
  totalAmount: number;
  expectedDeliveryAt: string | null;
  lineCount: number;
};

export type PurchasePlanInput = {
  now?: Date | string;
  reorderSuggestions: PurchasePlanReorderInput[];
  suppliers: PurchasePlanSupplierInput[];
  purchaseOrders: PurchasePlanOrderInput[];
  budgetLimit?: number | null;
};

export type PurchasePlanLine = {
  ingredientId: string;
  name: string;
  unit: string;
  orderQuantity: number;
  unitCost: number;
  estimatedCost: number;
  daysLeft: number | null;
  priority: PurchasePlanPriority;
  reason: string;
};

export type InventoryPurchasePlan = {
  generatedAt: string;
  suggestedLineCount: number;
  urgentLineCount: number;
  totalSuggestedValue: number;
  urgentSuggestedValue: number;
  openPurchaseValue: number;
  latePurchaseOrderCount: number;
  recommendedSupplier: PurchasePlanSupplierInput | null;
  budget: {
    limit: number | null;
    plannedValue: number;
    remainingValue: number | null;
    isOverBudget: boolean;
  };
  priorityBuckets: Array<{
    priority: PurchasePlanPriority;
    label: string;
    lineCount: number;
    estimatedValue: number;
  }>;
  lines: PurchasePlanLine[];
  supplierPlans: Array<{
    supplierId: string | null;
    supplierName: string;
    isPreferred: boolean;
    defaultLeadDays: number;
    lineCount: number;
    estimatedValue: number;
    lines: PurchasePlanLine[];
  }>;
  warnings: Array<{
    id: string;
    title: string;
    detail: string;
    severity: "yellow" | "red" | "blue";
  }>;
};

const openPurchaseStatuses = new Set(["draft", "pending", "approved", "ordered", "partially_delivered"]);

function numberValue(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function money(value: number) {
  return Math.round(Math.max(0, Number(value) || 0));
}

function parseDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isLatePurchaseOrder(order: PurchasePlanOrderInput, now: Date) {
  const expected = parseDate(order.expectedDeliveryAt);
  return openPurchaseStatuses.has(order.status) && Boolean(expected && expected.getTime() < now.getTime());
}

function linePriority(item: PurchasePlanReorderInput): PurchasePlanPriority {
  if (item.urgency === "high" || item.onHandQuantity <= 0 || (item.daysLeft !== null && item.daysLeft <= 2)) return "urgent";
  if (item.urgency === "medium" || (item.daysLeft !== null && item.daysLeft <= 7)) return "soon";
  return "planned";
}

function priorityRank(priority: PurchasePlanPriority) {
  if (priority === "urgent") return 0;
  if (priority === "soon") return 1;
  return 2;
}

function priorityLabel(priority: PurchasePlanPriority) {
  if (priority === "urgent") return "Cần mua ngay";
  if (priority === "soon") return "Mua trong tuần";
  return "Theo kế hoạch";
}

function unitCost(item: PurchasePlanReorderInput) {
  if (item.reorderQuantity <= 0) return 0;
  return money(item.estimatedCost / item.reorderQuantity);
}

function buildReason(item: PurchasePlanReorderInput, priority: PurchasePlanPriority) {
  if (item.daysLeft !== null) {
    return `${priorityLabel(priority)} vì còn khoảng ${Math.max(0, Math.round(item.daysLeft * 10) / 10)} ngày bán.`;
  }
  if (item.onHandQuantity <= item.minimumQuantity) return `${priorityLabel(priority)} vì tồn đang dưới ngưỡng min.`;
  return `${priorityLabel(priority)} dựa trên lịch sử sử dụng gần đây.`;
}

function chooseRecommendedSupplier(suppliers: PurchasePlanSupplierInput[]) {
  return [...suppliers].sort((left, right) => {
    if (left.isPreferred !== right.isPreferred) return left.isPreferred ? -1 : 1;
    if (left.productCount !== right.productCount) return right.productCount - left.productCount;
    return left.defaultLeadDays - right.defaultLeadDays;
  })[0] ?? null;
}

function bucketLines(lines: PurchasePlanLine[]) {
  return (["urgent", "soon", "planned"] as const).map((priority) => {
    const bucket = lines.filter((line) => line.priority === priority);
    return {
      priority,
      label: priorityLabel(priority),
      lineCount: bucket.length,
      estimatedValue: money(bucket.reduce((sum, line) => sum + line.estimatedCost, 0))
    };
  });
}

function buildWarnings({
  lines,
  latePurchaseOrderCount,
  suppliers,
  budget
}: {
  lines: PurchasePlanLine[];
  latePurchaseOrderCount: number;
  suppliers: PurchasePlanSupplierInput[];
  budget: InventoryPurchasePlan["budget"];
}) {
  const warnings: InventoryPurchasePlan["warnings"] = [];
  if (lines.some((line) => line.priority === "urgent")) {
    warnings.push({
      id: "urgent-reorder",
      title: "Có nguyên liệu cần mua ngay",
      detail: `${lines.filter((line) => line.priority === "urgent").length} dòng đang hết hoặc sắp hết trong 2 ngày.`,
      severity: "red"
    });
  }
  if (latePurchaseOrderCount > 0) {
    warnings.push({
      id: "late-po",
      title: "PO đang trễ",
      detail: `${latePurchaseOrderCount} đơn mua mở đã quá thời gian giao dự kiến.`,
      severity: "yellow"
    });
  }
  if (suppliers.length === 0 && lines.length > 0) {
    warnings.push({
      id: "missing-supplier",
      title: "Chưa có NCC",
      detail: "Kế hoạch mua có dòng đề xuất nhưng chưa có nhà cung cấp để gán.",
      severity: "blue"
    });
  }
  if (budget.isOverBudget) {
    warnings.push({
      id: "over-budget",
      title: "Vượt ngân sách mua",
      detail: `Kế hoạch đang vượt ngân sách khoảng ${Math.abs(budget.remainingValue ?? 0).toLocaleString("vi-VN")}đ.`,
      severity: "yellow"
    });
  }
  return warnings;
}

export function buildInventoryPurchasePlan(input: PurchasePlanInput): InventoryPurchasePlan {
  const now = parseDate(input.now) ?? new Date();
  const recommendedSupplier = chooseRecommendedSupplier(input.suppliers);
  const lines = input.reorderSuggestions
    .filter((item) => item.reorderQuantity > 0 || item.urgency !== "low")
    .map((item) => {
      const priority = linePriority(item);
      return {
        ingredientId: item.ingredientId,
        name: item.name,
        unit: item.unit,
        orderQuantity: Math.max(0, Number(item.reorderQuantity) || 0),
        unitCost: unitCost(item),
        estimatedCost: money(item.estimatedCost),
        daysLeft: item.daysLeft,
        priority,
        reason: buildReason(item, priority)
      } satisfies PurchasePlanLine;
    })
    .sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority) || right.estimatedCost - left.estimatedCost);
  const openPurchaseOrders = input.purchaseOrders.filter((order) => openPurchaseStatuses.has(order.status));
  const latePurchaseOrderCount = openPurchaseOrders.filter((order) => isLatePurchaseOrder(order, now)).length;
  const totalSuggestedValue = money(lines.reduce((sum, line) => sum + line.estimatedCost, 0));
  const urgentSuggestedValue = money(lines.filter((line) => line.priority === "urgent").reduce((sum, line) => sum + line.estimatedCost, 0));
  const budgetLimit = typeof input.budgetLimit === "number" && input.budgetLimit > 0 ? money(input.budgetLimit) : null;
  const remainingValue = budgetLimit === null ? null : budgetLimit - totalSuggestedValue;
  const budget = {
    limit: budgetLimit,
    plannedValue: totalSuggestedValue,
    remainingValue,
    isOverBudget: remainingValue !== null && remainingValue < 0
  };
  const supplierPlan = {
    supplierId: recommendedSupplier?.id ?? null,
    supplierName: recommendedSupplier?.name ?? "Chưa chọn NCC",
    isPreferred: recommendedSupplier?.isPreferred ?? false,
    defaultLeadDays: recommendedSupplier?.defaultLeadDays ?? 0,
    lineCount: lines.length,
    estimatedValue: totalSuggestedValue,
    lines
  };

  return {
    generatedAt: now.toISOString(),
    suggestedLineCount: lines.length,
    urgentLineCount: lines.filter((line) => line.priority === "urgent").length,
    totalSuggestedValue,
    urgentSuggestedValue,
    openPurchaseValue: money(openPurchaseOrders.reduce((sum, order) => sum + numberValue(order.totalAmount), 0)),
    latePurchaseOrderCount,
    recommendedSupplier,
    budget,
    priorityBuckets: bucketLines(lines),
    lines,
    supplierPlans: lines.length > 0 ? [supplierPlan] : [],
    warnings: buildWarnings({ lines, latePurchaseOrderCount, suppliers: input.suppliers, budget })
  };
}
