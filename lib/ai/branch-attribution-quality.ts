import type { OrderBranchAssignmentSource } from "@/lib/orders/branch-attribution";
import type { FulfillmentType } from "@/types/domain";

export type BranchAttributionQualityBranch = {
  id: string;
  name: string;
  isPrimary?: boolean | null;
  isActive?: boolean | null;
};

export type BranchAttributionQualityOrder = {
  id: string;
  branchId?: string | null;
  branchAssignmentSource?: OrderBranchAssignmentSource | string | null;
  fulfillmentType?: FulfillmentType | string | null;
  status?: string | null;
  paymentStatus?: string | null;
  total?: number | string | null;
};

export type BranchAttributionQualityRow = {
  branchId: string;
  branchName: string;
  isPrimary: boolean;
  isActive: boolean;
  orderCount: number;
  paidRevenue: number;
  pickupOrders: number;
  dineInOrders: number;
  deliveryOrders: number;
  explicitOrderCount: number;
  manualOrderCount: number;
  deliveryQuoteOrderCount: number;
  fallbackOrderCount: number;
  primaryFallbackOrderCount: number;
  singleBranchFallbackOrderCount: number;
  unknownSourceOrderCount: number;
  deliveryWithoutQuoteCount: number;
  qualityScore: number;
  riskLevel: "good" | "watch" | "risk";
  action: string;
};

export type BranchAttributionQualityReport = {
  schemaReady: boolean;
  generatedAt: string;
  windowDays: number;
  branchCount: number;
  orderCount: number;
  attributedOrderCount: number;
  unassignedOrderCount: number;
  unknownBranchOrderCount: number;
  explicitOrderCount: number;
  fallbackOrderCount: number;
  primaryFallbackOrderCount: number;
  singleBranchFallbackOrderCount: number;
  deliveryQuoteOrderCount: number;
  manualOrderCount: number;
  deliveryWithoutQuoteCount: number;
  pickupOrderCount: number;
  dineInOrderCount: number;
  deliveryOrderCount: number;
  attributionRate: number;
  qualityScore: number;
  topIssue: string;
  recommendedAction: string;
  rows: BranchAttributionQualityRow[];
};

function asNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function asFulfillmentType(value: unknown): FulfillmentType | "UNKNOWN" {
  if (value === "PICKUP" || value === "DINE_IN" || value === "DELIVERY") return value;
  return "UNKNOWN";
}

function asAssignmentSource(value: unknown): OrderBranchAssignmentSource | "unknown" {
  if (value === "delivery_quote" || value === "single_branch" || value === "primary_branch" || value === "manual") return value;
  return "unknown";
}

function isPaidOrder(order: BranchAttributionQualityOrder) {
  return order.status === "paid" || order.paymentStatus === "paid";
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function percent(count: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((count / total) * 100);
}

function createRow(branch: BranchAttributionQualityBranch): BranchAttributionQualityRow {
  return {
    branchId: branch.id,
    branchName: branch.name,
    isPrimary: Boolean(branch.isPrimary),
    isActive: branch.isActive !== false,
    orderCount: 0,
    paidRevenue: 0,
    pickupOrders: 0,
    dineInOrders: 0,
    deliveryOrders: 0,
    explicitOrderCount: 0,
    manualOrderCount: 0,
    deliveryQuoteOrderCount: 0,
    fallbackOrderCount: 0,
    primaryFallbackOrderCount: 0,
    singleBranchFallbackOrderCount: 0,
    unknownSourceOrderCount: 0,
    deliveryWithoutQuoteCount: 0,
    qualityScore: 100,
    riskLevel: "good",
    action: "Attribution của chi nhánh đang rõ ràng."
  };
}

function scoreRow(row: BranchAttributionQualityRow, activeBranchCount: number) {
  const fallbackRisk = row.fallbackOrderCount;
  const fallbackPenalty = activeBranchCount > 1 ? 0.25 : 0.12;
  const deliveryRisk = row.deliveryWithoutQuoteCount;
  const score = clampScore(
    100 -
      percent(row.primaryFallbackOrderCount, row.orderCount) * 0.5 -
      percent(fallbackRisk, row.orderCount) * fallbackPenalty -
      percent(row.unknownSourceOrderCount, row.orderCount) * 0.35 -
      percent(deliveryRisk, row.deliveryOrders || row.orderCount) * 0.3
  );

  if (score < 70 || row.primaryFallbackOrderCount > 0 || deliveryRisk > 0) {
    return { score, riskLevel: "risk" as const };
  }

  if (score < 88 || fallbackRisk > 0 || row.singleBranchFallbackOrderCount > 0 || row.unknownSourceOrderCount > 0) {
    return { score, riskLevel: "watch" as const };
  }

  return { score, riskLevel: "good" as const };
}

function actionForRow(row: BranchAttributionQualityRow, activeBranchCount: number) {
  if (row.deliveryWithoutQuoteCount > 0) {
    return "Kiểm tra delivery quote/nearest branch để đơn giao hàng không rơi khỏi chi nhánh đúng.";
  }

  if (row.primaryFallbackOrderCount > 0) {
    return "Gắn chi nhánh rõ cho pickup và bàn QR để giảm đơn fallback về chi nhánh chính.";
  }

  if (row.singleBranchFallbackOrderCount > 0) {
    return "Rà lại cấu hình active branch vì hệ thống đang dùng single-branch fallback.";
  }

  if (row.unknownSourceOrderCount > 0) {
    return "Kiểm tra các đơn có branch_id nhưng thiếu nguồn attribution để dễ audit sau này.";
  }

  return "Attribution của chi nhánh đang rõ ràng.";
}

function reportIssue(input: {
  orderCount: number;
  unassignedOrderCount: number;
  deliveryWithoutQuoteCount: number;
  primaryFallbackOrderCount: number;
  fallbackOrderCount: number;
}) {
  if (input.orderCount === 0) {
    return {
      topIssue: "Chưa có đơn trong kỳ so sánh.",
      recommendedAction: "Đợi thêm dữ liệu hoặc mở rộng cửa sổ phân tích."
    };
  }

  if (input.unassignedOrderCount > 0) {
    return {
      topIssue: `${input.unassignedOrderCount} đơn chưa gắn chi nhánh.`,
      recommendedAction: "Ưu tiên kiểm tra delivery quote, pickup branch picker và bàn QR chưa gắn chi nhánh."
    };
  }

  if (input.deliveryWithoutQuoteCount > 0) {
    return {
      topIssue: `${input.deliveryWithoutQuoteCount} đơn giao hàng chưa có attribution từ delivery quote.`,
      recommendedAction: "Kiểm tra luồng nearest branch và dữ liệu quote trước khi xác nhận đơn delivery."
    };
  }

  if (input.primaryFallbackOrderCount > 0) {
    return {
      topIssue: `${input.primaryFallbackOrderCount} đơn đang fallback về chi nhánh chính.`,
      recommendedAction: "Gắn rõ chi nhánh cho pickup/table để số liệu từng điểm bán chính xác hơn."
    };
  }

  if (input.fallbackOrderCount > 0) {
    return {
      topIssue: `${input.fallbackOrderCount} đơn dùng fallback attribution.`,
      recommendedAction: "Theo dõi fallback khi mở thêm chi nhánh hoặc bật thêm kênh bán."
    };
  }

  return {
    topIssue: "Attribution theo chi nhánh đang rõ.",
    recommendedAction: "Có thể dùng số liệu này để so sánh hiệu quả pickup, dine-in và delivery theo chi nhánh."
  };
}

export function buildBranchAttributionQualityReport(input: {
  branches: BranchAttributionQualityBranch[];
  orders: BranchAttributionQualityOrder[];
  windowDays?: number;
  generatedAt?: Date;
  schemaReady?: boolean;
}): BranchAttributionQualityReport {
  const activeBranchCount = input.branches.filter((branch) => branch.isActive !== false).length;
  const rowsByBranch = new Map(input.branches.map((branch) => [branch.id, createRow(branch)]));

  let unassignedOrderCount = 0;
  let unknownBranchOrderCount = 0;
  let pickupOrderCount = 0;
  let dineInOrderCount = 0;
  let deliveryOrderCount = 0;
  let manualOrderCount = 0;
  let deliveryQuoteOrderCount = 0;
  let fallbackOrderCount = 0;
  let primaryFallbackOrderCount = 0;
  let singleBranchFallbackOrderCount = 0;
  let explicitOrderCount = 0;
  let deliveryWithoutQuoteCount = 0;

  for (const order of input.orders) {
    const fulfillmentType = asFulfillmentType(order.fulfillmentType);
    const source = asAssignmentSource(order.branchAssignmentSource);
    const branchId = order.branchId?.trim() || null;

    if (fulfillmentType === "PICKUP") pickupOrderCount += 1;
    if (fulfillmentType === "DINE_IN") dineInOrderCount += 1;
    if (fulfillmentType === "DELIVERY") deliveryOrderCount += 1;

    if (!branchId) {
      unassignedOrderCount += 1;
      if (fulfillmentType === "DELIVERY") deliveryWithoutQuoteCount += 1;
      continue;
    }

    let row = rowsByBranch.get(branchId);
    if (!row) {
      unknownBranchOrderCount += 1;
      row = createRow({ id: branchId, name: "Chi nhánh đã ẩn", isActive: false });
      rowsByBranch.set(branchId, row);
    }

    row.orderCount += 1;
    if (isPaidOrder(order)) row.paidRevenue += asNumber(order.total);
    if (fulfillmentType === "PICKUP") row.pickupOrders += 1;
    if (fulfillmentType === "DINE_IN") row.dineInOrders += 1;
    if (fulfillmentType === "DELIVERY") row.deliveryOrders += 1;

    if (source === "manual") {
      row.manualOrderCount += 1;
      manualOrderCount += 1;
      explicitOrderCount += 1;
      row.explicitOrderCount += 1;
    } else if (source === "delivery_quote") {
      row.deliveryQuoteOrderCount += 1;
      deliveryQuoteOrderCount += 1;
      explicitOrderCount += 1;
      row.explicitOrderCount += 1;
    } else if (source === "primary_branch") {
      row.primaryFallbackOrderCount += 1;
      row.fallbackOrderCount += 1;
      primaryFallbackOrderCount += 1;
      fallbackOrderCount += 1;
    } else if (source === "single_branch") {
      row.singleBranchFallbackOrderCount += 1;
      row.fallbackOrderCount += 1;
      singleBranchFallbackOrderCount += 1;
      fallbackOrderCount += 1;
    } else {
      row.unknownSourceOrderCount += 1;
    }

    if (fulfillmentType === "DELIVERY" && source !== "delivery_quote" && !(activeBranchCount <= 1 && source === "single_branch")) {
      row.deliveryWithoutQuoteCount += 1;
      deliveryWithoutQuoteCount += 1;
    }
  }

  const rows = [...rowsByBranch.values()].map((row) => {
    const scored = scoreRow(row, activeBranchCount);
    return {
      ...row,
      paidRevenue: Math.round(row.paidRevenue),
      qualityScore: row.orderCount > 0 ? scored.score : 100,
      riskLevel: row.orderCount > 0 ? scored.riskLevel : "good",
      action: actionForRow(row, activeBranchCount)
    };
  });

  const orderCount = input.orders.length;
  const attributedOrderCount = orderCount - unassignedOrderCount;
  const score = clampScore(
    100 -
      percent(unassignedOrderCount, orderCount) * 0.45 -
      percent(primaryFallbackOrderCount, orderCount) * 0.3 -
      percent(fallbackOrderCount, orderCount) * 0.12 -
      percent(unknownBranchOrderCount, orderCount) * 0.25 -
      percent(deliveryWithoutQuoteCount, deliveryOrderCount || orderCount) * 0.25
  );
  const issue = reportIssue({
    orderCount,
    unassignedOrderCount,
    deliveryWithoutQuoteCount,
    primaryFallbackOrderCount,
    fallbackOrderCount
  });

  return {
    schemaReady: input.schemaReady ?? true,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    windowDays: input.windowDays ?? 7,
    branchCount: rows.length,
    orderCount,
    attributedOrderCount,
    unassignedOrderCount,
    unknownBranchOrderCount,
    explicitOrderCount,
    fallbackOrderCount,
    primaryFallbackOrderCount,
    singleBranchFallbackOrderCount,
    deliveryQuoteOrderCount,
    manualOrderCount,
    deliveryWithoutQuoteCount,
    pickupOrderCount,
    dineInOrderCount,
    deliveryOrderCount,
    attributionRate: percent(attributedOrderCount, orderCount),
    qualityScore: orderCount > 0 ? score : 100,
    topIssue: issue.topIssue,
    recommendedAction: issue.recommendedAction,
    rows: rows.sort((left, right) => {
      const riskDelta = left.qualityScore - right.qualityScore;
      if (riskDelta !== 0) return riskDelta;
      return right.orderCount - left.orderCount || Number(right.isPrimary) - Number(left.isPrimary) || left.branchName.localeCompare(right.branchName);
    })
  };
}
