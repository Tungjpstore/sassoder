import type { AiOperationInsight, AiOperationInsightSeverity, AiOperationInsightsDeck } from "@/lib/ai/operation-insights";

export type AiBranchOperationSnapshot = {
  branchId: string;
  branchName: string;
  isPrimary?: boolean;
  isActive?: boolean;
  acceptingDelivery?: boolean;
  deliveryPaused?: boolean;
  temporarilyClosed?: boolean;
  orders24h: number;
  deliveryOrders24h: number;
  paidRevenue: number;
  waitingPayment: number;
  waitingConfirm: number;
  averageDeliveryDistanceKm: number | null;
  stockBalanceCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  openInventoryAlertCount: number;
  wasteSpikeAlertCount: number;
  priceSpikeAlertCount: number;
  supplierDelayAlertCount: number;
  assignedStaff: number;
  activeStaff: number;
  lateCount: number;
  pendingApprovals: number;
  coverageScore: number | null;
};

type BranchInsightInput = Omit<AiOperationInsight, "id" | "confidence"> & {
  confidence?: AiOperationInsight["confidence"];
};

const severityRank: Record<AiOperationInsightSeverity, number> = {
  critical: 4,
  warning: 3,
  opportunity: 2,
  info: 1
};

const kindRank: Record<AiOperationInsight["kind"], number> = {
  payment: 8,
  staffing: 7,
  inventory: 6,
  service: 5,
  revenue: 4,
  tables: 3,
  menu: 2,
  promotion: 1
};

const severityPenalty: Record<AiOperationInsightSeverity, number> = {
  critical: 18,
  warning: 11,
  opportunity: 4,
  info: 1
};

function foldText(value: string) {
  return value
    .replace(/[đĐ]/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatVnd(value: number) {
  return `${Math.max(0, Math.round(value)).toLocaleString("vi-VN")}đ`;
}

function buildBranchInsight(input: BranchInsightInput): AiOperationInsight {
  return {
    ...input,
    id: `${input.kind}-${foldText(input.title).slice(0, 52) || "branch-signal"}`,
    confidence: input.confidence ?? (input.evidence.length >= 2 ? "high" : "medium")
  };
}

function scoreBranchHealth(snapshot: AiBranchOperationSnapshot, insights: AiOperationInsight[]) {
  const hasOperationalData =
    snapshot.orders24h > 0 ||
    snapshot.stockBalanceCount > 0 ||
    snapshot.assignedStaff > 0 ||
    snapshot.openInventoryAlertCount > 0;
  const baseline = hasOperationalData ? 96 : 82;
  const pausePenalty = snapshot.deliveryPaused || snapshot.temporarilyClosed || snapshot.acceptingDelivery === false ? 6 : 0;
  const penalty = insights.reduce((sum, insight) => sum + severityPenalty[insight.severity], pausePenalty);
  return Math.max(24, Math.min(96, baseline - penalty));
}

function summarizeBranchDeck(snapshot: AiBranchOperationSnapshot, insights: AiOperationInsight[], healthScore: number) {
  const criticalCount = insights.filter((insight) => insight.severity === "critical").length;
  const warningCount = insights.filter((insight) => insight.severity === "warning").length;
  const opportunityCount = insights.filter((insight) => insight.severity === "opportunity").length;

  if (criticalCount > 0) return `${snapshot.branchName}: ${criticalCount} việc cần xử lý ngay. Health ${healthScore}/100.`;
  if (warningCount > 0) return `${snapshot.branchName}: ${warningCount} cảnh báo vận hành. Health ${healthScore}/100.`;
  if (opportunityCount > 0) return `${snapshot.branchName}: ${opportunityCount} cơ hội tối ưu. Health ${healthScore}/100.`;
  return `${snapshot.branchName}: chưa thấy rủi ro rõ. Health ${healthScore}/100.`;
}

export function buildBranchOperationInsights(
  snapshot: AiBranchOperationSnapshot,
  now = new Date()
): AiOperationInsightsDeck {
  const insights: AiOperationInsight[] = [];
  const paymentQueue = snapshot.waitingConfirm + snapshot.waitingPayment;

  if (snapshot.deliveryPaused || snapshot.temporarilyClosed || snapshot.acceptingDelivery === false) {
    insights.push(
      buildBranchInsight({
        kind: "service",
        severity: "warning",
        title: "Chi nhánh đang tạm dừng giao hàng",
        detail: `${snapshot.branchName} đang có metadata tạm dừng nhận đơn giao hàng hoặc đóng tạm thời.`,
        action: "Kiểm tra lại trạng thái nhận đơn của chi nhánh trước khi bật quảng bá khu vực.",
        evidence: [
          `acceptingDelivery=${snapshot.acceptingDelivery}`,
          `deliveryPaused=${snapshot.deliveryPaused}`,
          `temporarilyClosed=${snapshot.temporarilyClosed}`
        ],
        metric: { label: "Trạng thái", value: "paused" },
        actionIntent: "online",
        actionHref: "/dashboard/online"
      })
    );
  }

  if (snapshot.orders24h > 0 && snapshot.paidRevenue <= 0) {
    insights.push(
      buildBranchInsight({
        kind: "payment",
        severity: "critical",
        title: "Chi nhánh có đơn nhưng chưa thành doanh thu",
        detail: `${snapshot.branchName} có ${snapshot.orders24h} đơn được gắn chi nhánh nhưng chưa ghi nhận doanh thu đã thanh toán.`,
        action: "Đối soát thanh toán và trạng thái đơn của chi nhánh này trước khi chốt ca.",
        evidence: [`orders24h=${snapshot.orders24h}`, `paidRevenue=${snapshot.paidRevenue}`],
        metric: { label: "Doanh thu", value: formatVnd(snapshot.paidRevenue) },
        actionIntent: "payments",
        actionHref: "/dashboard/payments"
      })
    );
  }

  if (paymentQueue > 0) {
    insights.push(
      buildBranchInsight({
        kind: "payment",
        severity: snapshot.waitingConfirm > 0 || paymentQueue >= 3 ? "warning" : "info",
        title: "Thanh toán chi nhánh đang treo",
        detail:
          snapshot.waitingConfirm > 0
            ? `${snapshot.waitingConfirm} giao dịch của ${snapshot.branchName} cần đối soát.`
            : `${snapshot.waitingPayment} đơn của ${snapshot.branchName} đang chờ khách thanh toán.`,
        action: "Mở thanh toán để xử lý giao dịch theo chi nhánh, tránh kéo dài thời gian phục vụ.",
        evidence: [`waitingConfirm=${snapshot.waitingConfirm}`, `waitingPayment=${snapshot.waitingPayment}`],
        metric: { label: "Thanh toán treo", value: String(paymentQueue) },
        actionIntent: "payments",
        actionHref: "/dashboard/payments"
      })
    );
  }

  if (snapshot.outOfStockCount > 0 || snapshot.lowStockCount > 0) {
    insights.push(
      buildBranchInsight({
        kind: "inventory",
        severity: snapshot.outOfStockCount > 0 || snapshot.lowStockCount >= 3 ? "critical" : "warning",
        title: "Tồn kho chi nhánh dưới ngưỡng",
        detail:
          snapshot.outOfStockCount > 0
            ? `${snapshot.branchName} có ${snapshot.outOfStockCount} nguyên liệu hết tồn khả dụng.`
            : `${snapshot.branchName} có ${snapshot.lowStockCount} nguyên liệu dưới mức tối thiểu.`,
        action: "Mở Kho hàng để nhập thêm hoặc chuyển kho nội bộ cho chi nhánh này.",
        evidence: [
          `stockBalances=${snapshot.stockBalanceCount}`,
          `lowStock=${snapshot.lowStockCount}`,
          `outOfStock=${snapshot.outOfStockCount}`
        ],
        metric: { label: "Kho thiếu", value: String(snapshot.outOfStockCount || snapshot.lowStockCount) },
        actionIntent: "inventory",
        actionHref: "/dashboard/inventory"
      })
    );
  }

  if (snapshot.openInventoryAlertCount > 0) {
    insights.push(
      buildBranchInsight({
        kind: "inventory",
        severity: snapshot.openInventoryAlertCount >= 4 ? "warning" : "info",
        title: "Chi nhánh có cảnh báo kho chưa xử lý",
        detail: `${snapshot.branchName} còn ${snapshot.openInventoryAlertCount} cảnh báo kho đang mở hoặc cần theo dõi.`,
        action: "Ưu tiên xử lý alert kho theo chi nhánh để tránh thiếu nguyên liệu cục bộ.",
        evidence: [`openInventoryAlerts=${snapshot.openInventoryAlertCount}`],
        metric: { label: "Alert kho", value: String(snapshot.openInventoryAlertCount) },
        actionIntent: "inventory",
        actionHref: "/dashboard/inventory"
      })
    );
  }

  if (snapshot.wasteSpikeAlertCount > 0) {
    insights.push(
      buildBranchInsight({
        kind: "inventory",
        severity: snapshot.wasteSpikeAlertCount >= 2 ? "warning" : "info",
        title: "Chi nhánh có hao hụt tăng",
        detail: `${snapshot.branchName} có ${snapshot.wasteSpikeAlertCount} cảnh báo waste spike đang mở.`,
        action: "Mở Kho hàng để kiểm tra ca phát sinh hao hụt và điều chỉnh định mức chi nhánh.",
        evidence: [`wasteSpikeAlerts=${snapshot.wasteSpikeAlertCount}`],
        metric: { label: "Waste spike", value: String(snapshot.wasteSpikeAlertCount) },
        actionIntent: "inventory",
        actionHref: "/dashboard/inventory"
      })
    );
  }

  if (snapshot.priceSpikeAlertCount > 0 || snapshot.supplierDelayAlertCount > 0) {
    insights.push(
      buildBranchInsight({
        kind: "inventory",
        severity: snapshot.supplierDelayAlertCount > 0 ? "warning" : "info",
        title: "Chi nhánh có rủi ro nhập hàng",
        detail:
          snapshot.supplierDelayAlertCount > 0
            ? `${snapshot.branchName} có ${snapshot.supplierDelayAlertCount} PO hoặc dòng nhập hàng trễ.`
            : `${snapshot.branchName} có ${snapshot.priceSpikeAlertCount} cảnh báo giá nhập biến động.`,
        action: "Kiểm tra purchasing của chi nhánh trước khi duyệt giá bán hoặc chạy khuyến mãi.",
        evidence: [`supplierDelayAlerts=${snapshot.supplierDelayAlertCount}`, `priceSpikeAlerts=${snapshot.priceSpikeAlertCount}`],
        metric: { label: "Rủi ro nhập", value: String(snapshot.supplierDelayAlertCount || snapshot.priceSpikeAlertCount) },
        actionIntent: "inventory",
        actionHref: "/dashboard/inventory"
      })
    );
  }

  if (snapshot.assignedStaff > 0 && snapshot.activeStaff === 0 && snapshot.orders24h > 0) {
    insights.push(
      buildBranchInsight({
        kind: "staffing",
        severity: "critical",
        title: "Chi nhánh có đơn nhưng chưa thấy nhân sự online",
        detail: `${snapshot.branchName} có đơn trong 24h nhưng chưa có phiên nhân sự hoạt động gần đây.`,
        action: "Kiểm tra ca trực, phiên đăng nhập hoặc phân công nhân sự cho chi nhánh này.",
        evidence: [`assignedStaff=${snapshot.assignedStaff}`, `activeStaff=${snapshot.activeStaff}`, `orders24h=${snapshot.orders24h}`],
        metric: { label: "Nhân sự online", value: "0" },
        actionIntent: "staff",
        actionHref: "/dashboard/staff"
      })
    );
  }

  if ((snapshot.coverageScore !== null && snapshot.coverageScore < 60) || snapshot.lateCount > 0 || snapshot.pendingApprovals > 0) {
    insights.push(
      buildBranchInsight({
        kind: "staffing",
        severity:
          (snapshot.coverageScore !== null && snapshot.coverageScore < 45) || snapshot.pendingApprovals >= 3
            ? "warning"
            : "info",
        title: "Nhân sự chi nhánh cần rà soát",
        detail: `${snapshot.branchName} có coverage ${snapshot.coverageScore ?? "--"}%, ${snapshot.lateCount} lượt muộn và ${snapshot.pendingApprovals} yêu cầu chờ duyệt.`,
        action: "Mở Nhân viên để xử lý duyệt công và cân lại ca trực của chi nhánh.",
        evidence: [
          `coverageScore=${snapshot.coverageScore ?? "unknown"}`,
          `lateCount=${snapshot.lateCount}`,
          `pendingApprovals=${snapshot.pendingApprovals}`
        ],
        metric: { label: "Coverage", value: snapshot.coverageScore === null ? "--" : `${snapshot.coverageScore}%` },
        actionIntent: "staff",
        actionHref: "/dashboard/staff"
      })
    );
  }

  if (snapshot.deliveryOrders24h >= 3 && (snapshot.averageDeliveryDistanceKm ?? 0) >= 5) {
    insights.push(
      buildBranchInsight({
        kind: "service",
        severity: snapshot.averageDeliveryDistanceKm && snapshot.averageDeliveryDistanceKm >= 8 ? "warning" : "opportunity",
        title: "Chi nhánh đang gánh đơn giao xa",
        detail: `${snapshot.branchName} có ${snapshot.deliveryOrders24h} đơn giao, khoảng cách trung bình ${snapshot.averageDeliveryDistanceKm?.toFixed(1)}km.`,
        action: "Xem lại phí ship, bán kính giao và gợi ý khách chọn chi nhánh gần hơn nếu có.",
        evidence: [`deliveryOrders=${snapshot.deliveryOrders24h}`, `avgDistance=${snapshot.averageDeliveryDistanceKm}`],
        metric: { label: "Giao xa", value: `${snapshot.averageDeliveryDistanceKm?.toFixed(1)}km` },
        actionIntent: "online",
        actionHref: "/dashboard/online"
      })
    );
  }

  if (snapshot.orders24h === 0 && snapshot.assignedStaff > 0 && snapshot.acceptingDelivery !== false && !snapshot.deliveryPaused) {
    insights.push(
      buildBranchInsight({
        kind: "promotion",
        severity: "opportunity",
        title: "Chi nhánh chưa có đơn ghi nhận",
        detail: `${snapshot.branchName} có nhân sự phân công nhưng chưa có đơn được gắn chi nhánh trong 24h.`,
        action: "Kiểm tra khu vực giao/QR hoặc chạy ưu đãi nhẹ cho vùng quanh chi nhánh.",
        evidence: [`orders24h=0`, `assignedStaff=${snapshot.assignedStaff}`],
        metric: { label: "Đơn 24h", value: "0" },
        actionIntent: "promotions",
        actionHref: "/dashboard/promotions"
      })
    );
  }

  const sortedInsights = insights
    .sort(
      (a, b) =>
        severityRank[b.severity] - severityRank[a.severity] ||
        kindRank[b.kind] - kindRank[a.kind] ||
        b.evidence.length - a.evidence.length
    )
    .slice(0, 6);
  const healthScore = scoreBranchHealth(snapshot, sortedInsights);

  return {
    generatedAt: now.toISOString(),
    healthScore,
    summary: summarizeBranchDeck(snapshot, sortedInsights, healthScore),
    primaryInsightId: sortedInsights[0]?.id ?? null,
    insights: sortedInsights
  };
}
