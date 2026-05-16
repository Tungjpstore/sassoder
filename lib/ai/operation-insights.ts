export type AiOperationInsightSeverity = "critical" | "warning" | "opportunity" | "info";
export type AiOperationInsightLifecycleStatus = "active" | "seen" | "dismissed" | "resolved" | "expired";

export type AiOperationInsightKind =
  | "revenue"
  | "payment"
  | "service"
  | "staffing"
  | "menu"
  | "inventory"
  | "tables"
  | "promotion";

export type AiOperationInsight = {
  id: string;
  kind: AiOperationInsightKind;
  severity: AiOperationInsightSeverity;
  title: string;
  detail: string;
  action: string;
  confidence: "high" | "medium" | "low";
  evidence: string[];
  metric?: {
    label: string;
    value: string;
  };
  actionIntent?: string;
  actionHref?: string;
  lifecycle?: {
    databaseId?: string;
    status: AiOperationInsightLifecycleStatus;
    source?: string;
    scopeKey?: string;
    schemaReady?: boolean;
    firstSeenAt?: string | null;
    lastSeenAt?: string | null;
    seenAt?: string | null;
    dismissedAt?: string | null;
    resolvedAt?: string | null;
    expiresAt?: string | null;
  };
};

export type AiOperationInsightsDeck = {
  generatedAt: string;
  healthScore: number;
  summary: string;
  primaryInsightId: string | null;
  insights: AiOperationInsight[];
};

type InsightInput = Omit<AiOperationInsight, "id" | "confidence"> & {
  confidence?: AiOperationInsight["confidence"];
};

type OperationSnapshot = {
  summary24h?: {
    orderCount?: number;
    paidRevenue?: number;
    statusCount?: Record<string, number>;
    paymentStatusCount?: Record<string, number>;
  } | null;
  recentOrders?: Array<Record<string, unknown>> | null;
  menu?: {
    itemCount?: number;
    unavailableCount?: number;
  } | null;
  tables?: {
    tableCount?: number;
    activeTableCount?: number;
    qrDisabledCount?: number;
    tables?: Array<Record<string, unknown>>;
  } | null;
  payments?: {
    waitingConfirm?: number;
    waitingPayment?: number;
  } | null;
  inventory?: {
    schemaReady?: boolean;
    activeIngredientCount?: number;
    lowStockCount?: number;
    recipeCoveragePercent?: number;
    recipeReadyItemCount?: number;
    menuItemCount?: number;
    totalReferenceValue?: number;
    expiringBatchCount?: number;
    openAlertCount?: number;
    lowStockIngredients?: Array<{
      name?: string;
      unit?: string;
      onHandQuantity?: number;
      minimumQuantity?: number;
      referenceUnitCost?: number;
    }>;
  } | null;
  promotions?: Array<Record<string, unknown>> | null;
  topItems?: Array<{
    name?: string;
    quantity?: number;
    revenue?: number;
  }> | null;
};

const severityRank: Record<AiOperationInsightSeverity, number> = {
  critical: 4,
  warning: 3,
  opportunity: 2,
  info: 1
};

const severityPenalty: Record<AiOperationInsightSeverity, number> = {
  critical: 18,
  warning: 11,
  opportunity: 4,
  info: 1
};

function asNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function formatVnd(value: number) {
  return `${Math.max(0, Math.round(value)).toLocaleString("vi-VN")}đ`;
}

function foldText(value: string) {
  return value
    .replace(/[đĐ]/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildInsight(input: InsightInput): AiOperationInsight {
  return {
    ...input,
    id: `${input.kind}-${foldText(input.title).slice(0, 52) || "signal"}`,
    confidence: input.confidence ?? (input.evidence.length >= 2 ? "high" : "medium")
  };
}

function activeOrders(orders: Array<Record<string, unknown>>) {
  return orders.filter((order) => {
    const status = asText(order.status);
    return ["pending", "ordering", "preparing", "waiting_payment", "waiting_confirm"].includes(status);
  });
}

function delayedOrders(orders: Array<Record<string, unknown>>, now: Date) {
  return activeOrders(orders).filter((order) => {
    const dueAt = asText(order.serviceDueAt ?? order.service_due_at);
    if (!dueAt) return false;
    const dueTime = new Date(dueAt).getTime();
    return Number.isFinite(dueTime) && dueTime < now.getTime();
  });
}

function orderHour(order: Record<string, unknown>) {
  const createdAt = asText(order.createdAt ?? order.created_at);
  if (!createdAt) return null;
  const date = new Date(createdAt);
  if (!Number.isFinite(date.getTime())) return null;
  return date.getHours();
}

function peakHour(orders: Array<Record<string, unknown>>) {
  const counts = orders.reduce<Record<number, number>>((acc, order) => {
    const hour = orderHour(order);
    if (hour === null) return acc;
    acc[hour] = (acc[hour] ?? 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .map(([hour, count]) => ({ hour: Number(hour), count }))
    .sort((a, b) => b.count - a.count)[0] ?? null;
}

function collectItemSales(orders: Array<Record<string, unknown>>) {
  const sales = new Map<string, { name: string; quantity: number; revenue: number }>();

  for (const order of orders) {
    const items = Array.isArray(order.items) ? (order.items as Array<Record<string, unknown>>) : [];
    for (const item of items) {
      const name = asText(item.name);
      if (!name) continue;
      const quantity = Math.max(1, asNumber(item.quantity));
      const price = asNumber(item.price);
      const current = sales.get(name) ?? { name, quantity: 0, revenue: 0 };
      current.quantity += quantity;
      current.revenue += quantity * price;
      sales.set(name, current);
    }
  }

  return Array.from(sales.values()).sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue);
}

function topSnapshotItem(items: OperationSnapshot["topItems"]) {
  if (!Array.isArray(items)) return null;
  const item = items.find((entry) => asText(entry.name) && asNumber(entry.quantity) > 0);
  if (!item) return null;
  return {
    name: asText(item.name),
    quantity: asNumber(item.quantity),
    revenue: asNumber(item.revenue)
  };
}

function tableOverdueCount(tables: OperationSnapshot["tables"]) {
  if (!Array.isArray(tables?.tables)) return 0;
  return tables.tables.reduce((sum, table) => {
    const status = asText(table.status);
    const overdueCount = asNumber(table.overdueCount);
    return sum + (overdueCount > 0 ? overdueCount : status === "overdue" ? 1 : 0);
  }, 0);
}

function scoreHealth(insights: AiOperationInsight[], hasOrders: boolean) {
  if (!hasOrders && insights.length === 0) return 58;
  const penalty = insights.reduce((sum, insight) => sum + severityPenalty[insight.severity], 0);
  return Math.max(22, Math.min(96, 100 - penalty));
}

function summarizeDeck(insights: AiOperationInsight[], healthScore: number) {
  const criticalCount = insights.filter((insight) => insight.severity === "critical").length;
  const warningCount = insights.filter((insight) => insight.severity === "warning").length;
  const opportunityCount = insights.filter((insight) => insight.severity === "opportunity").length;

  if (criticalCount > 0) return `AI Ops phát hiện ${criticalCount} việc cần xử lý ngay. Health ${healthScore}/100.`;
  if (warningCount > 0) return `AI Ops có ${warningCount} cảnh báo vận hành. Health ${healthScore}/100.`;
  if (opportunityCount > 0) return `AI Ops thấy ${opportunityCount} cơ hội tăng trưởng nhẹ. Health ${healthScore}/100.`;
  return `AI Ops chưa thấy rủi ro rõ. Health ${healthScore}/100.`;
}

export function buildOperationInsights(snapshot: OperationSnapshot, now = new Date()): AiOperationInsightsDeck {
  const orders = Array.isArray(snapshot.recentOrders) ? snapshot.recentOrders : [];
  const delayed = delayedOrders(orders, now);
  const summary = snapshot.summary24h ?? {};
  const orderCount = asNumber(summary.orderCount);
  const paidRevenue = asNumber(summary.paidRevenue);
  const insights: AiOperationInsight[] = [];

  if (orderCount === 0) {
    insights.push(
      buildInsight({
        kind: "revenue",
        severity: "warning",
        title: "Chưa có đơn trong 24 giờ",
        detail: "Dashboard chưa ghi nhận đơn mới nên AI chưa đủ dữ liệu để phân tích doanh thu.",
        action: "Kiểm tra QR/menu khách và tạo một chiến dịch kéo đơn đầu ngày.",
        evidence: ["orderCount=0", `paidRevenue=${paidRevenue}`],
        metric: { label: "Doanh thu 24h", value: formatVnd(paidRevenue) },
        actionIntent: "overview",
        actionHref: "/dashboard"
      })
    );
  } else if (paidRevenue <= 0) {
    insights.push(
      buildInsight({
        kind: "payment",
        severity: "critical",
        title: "Có đơn nhưng chưa thành doanh thu",
        detail: `${orderCount} đơn gần đây chưa tạo doanh thu đã thanh toán.`,
        action: "Mở đối soát thanh toán và kiểm tra đơn waiting_payment/waiting_confirm trước.",
        evidence: [`orderCount=${orderCount}`, "paidRevenue=0"],
        metric: { label: "Doanh thu đã thanh toán", value: formatVnd(paidRevenue) },
        actionIntent: "payments",
        actionHref: "/dashboard/payments"
      })
    );
  }

  const waitingConfirm = asNumber(snapshot.payments?.waitingConfirm);
  const waitingPayment = asNumber(snapshot.payments?.waitingPayment);
  const paymentQueue = waitingConfirm + waitingPayment;
  if (paymentQueue > 0) {
    insights.push(
      buildInsight({
        kind: "payment",
        severity: waitingConfirm >= 3 ? "critical" : paymentQueue >= 3 || waitingConfirm > 0 ? "warning" : "info",
        title: waitingConfirm > 0 ? "Thanh toán chờ đối soát" : "Đơn đang chờ thanh toán",
        detail:
          waitingConfirm > 0
            ? `${waitingConfirm} giao dịch đang cần chủ quán kiểm tiền thủ công.`
            : `${waitingPayment} đơn đang chờ khách hoàn tất thanh toán.`,
        action:
          waitingConfirm > 0
            ? "Ưu tiên kiểm số tiền và nội dung chuyển khoản, không để đơn chờ quá lâu."
            : "Mở danh sách thanh toán để nhắc hoặc hỗ trợ khách hoàn tất bước trả tiền.",
        evidence: [`waitingConfirm=${waitingConfirm}`, `waitingPayment=${waitingPayment}`],
        metric: { label: "Thanh toán treo", value: String(paymentQueue) },
        actionIntent: "payments",
        actionHref: "/dashboard/payments"
      })
    );
  }

  const overdueTables = tableOverdueCount(snapshot.tables);
  if (delayed.length > 0 || overdueTables > 0) {
    const first = delayed[0];
    const delayedCount = delayed.length || overdueTables;
    insights.push(
      buildInsight({
        kind: "service",
        severity: delayedCount >= 2 ? "critical" : "warning",
        title: "Đơn có nguy cơ trễ phục vụ",
        detail: `${delayedCount} đơn hoặc bàn đang quá mốc phục vụ trong snapshot.`,
        action: "Mở màn Đơn hàng/Bếp và xử lý đơn quá hạn trước khi nhận thêm việc mới.",
        evidence: [
          `delayedOrders=${delayed.length}`,
          `overdueTables=${overdueTables}`,
          first && asText(first.shortId ?? first.id) ? `first=${asText(first.shortId ?? first.id)}` : ""
        ].filter(Boolean),
        metric: { label: "Quá hạn", value: String(delayedCount) },
        actionIntent: "kitchen",
        actionHref: "/dashboard/orders"
      })
    );
  }

  const peak = peakHour(orders);
  const activeTableCount = asNumber(snapshot.tables?.activeTableCount);
  if (peak && peak.count >= 3) {
    insights.push(
      buildInsight({
        kind: "staffing",
        severity: peak.count >= 6 || delayed.length >= 2 || activeTableCount >= 5 ? "warning" : "info",
        title: "Khung giờ có tải cao",
        detail: `${peak.count} đơn trong snapshot rơi vào khung ${peak.hour}:00-${peak.hour + 1}:00.`,
        action: "Dùng tín hiệu này để chuẩn bị thêm người ở quầy/bếp trong khung cao điểm tương tự.",
        evidence: [`peakHour=${peak.hour}`, `peakCount=${peak.count}`, `activeTables=${activeTableCount}`],
        metric: { label: "Peak hour", value: `${peak.hour}:00-${peak.hour + 1}:00` },
        actionIntent: "staff",
        actionHref: "/dashboard/staff"
      })
    );
  }

  const topItem = collectItemSales(orders)[0] ?? topSnapshotItem(snapshot.topItems);
  if (topItem && topItem.quantity >= 2) {
    insights.push(
      buildInsight({
        kind: "menu",
        severity: "opportunity",
        title: "Món có lực kéo upsell",
        detail: `${topItem.name} đang xuất hiện nhiều nhất trong đơn gần đây.`,
        action: "Dùng món này làm anchor cho combo, topping hoặc gợi ý món kèm.",
        evidence: [`item=${topItem.name}`, `quantity=${topItem.quantity}`, `revenue=${topItem.revenue}`],
        metric: { label: "Top món", value: `${topItem.quantity} lượt` },
        actionIntent: "menu",
        actionHref: "/dashboard/menu"
      })
    );
  }

  const unavailableCount = asNumber(snapshot.menu?.unavailableCount);
  const itemCount = asNumber(snapshot.menu?.itemCount);
  if (unavailableCount > 0) {
    insights.push(
      buildInsight({
        kind: "menu",
        severity: unavailableCount >= Math.max(3, itemCount * 0.2) ? "warning" : "info",
        title: "Menu có món đang tạm ẩn",
        detail: `${unavailableCount}/${itemCount || "?"} món đang hết hoặc chưa bán trên menu khách.`,
        action: "Kiểm tra món tạm hết để tránh khách thấy menu mỏng vào giờ cao điểm.",
        evidence: [`unavailable=${unavailableCount}`, `itemCount=${itemCount}`],
        metric: { label: "Món tạm ẩn", value: String(unavailableCount) },
        actionIntent: "menu",
        actionHref: "/dashboard/menu"
      })
    );
  }

  const inventory = snapshot.inventory;
  if (inventory?.schemaReady) {
    const lowStockCount = asNumber(inventory.lowStockCount);
    const activeIngredientCount = asNumber(inventory.activeIngredientCount);
    const lowStockIngredients = Array.isArray(inventory.lowStockIngredients) ? inventory.lowStockIngredients : [];
    const firstLowStock = lowStockIngredients.find((ingredient) => asText(ingredient.name));
    if (lowStockCount > 0) {
      insights.push(
        buildInsight({
          kind: "inventory",
          severity: lowStockCount >= Math.max(3, activeIngredientCount * 0.18) ? "critical" : "warning",
          title: "Kho có nguyên liệu dưới ngưỡng",
          detail: firstLowStock
            ? `${firstLowStock.name} và ${Math.max(0, lowStockCount - 1)} nguyên liệu khác đang dưới mức tối thiểu.`
            : `${lowStockCount} nguyên liệu đang dưới mức tối thiểu.`,
          action: "Mở Kho hàng để tạo phiếu nhập hoặc đơn mua trước khi nhận thêm cao điểm.",
          evidence: [
            `lowStock=${lowStockCount}`,
            `activeIngredients=${activeIngredientCount}`,
            firstLowStock ? `first=${asText(firstLowStock.name)}` : "",
            firstLowStock ? `onHand=${asNumber(firstLowStock.onHandQuantity)}` : "",
            firstLowStock ? `minimum=${asNumber(firstLowStock.minimumQuantity)}` : ""
          ].filter(Boolean),
          metric: { label: "Kho thiếu", value: String(lowStockCount) },
          actionIntent: "inventory",
          actionHref: "/dashboard/inventory"
        })
      );
    }

    const recipeCoveragePercent = asNumber(inventory.recipeCoveragePercent);
    const menuItemCountForInventory = asNumber(inventory.menuItemCount);
    const recipeReadyItemCount = asNumber(inventory.recipeReadyItemCount);
    if (menuItemCountForInventory > 0 && recipeCoveragePercent < 70) {
      insights.push(
        buildInsight({
          kind: "inventory",
          severity: recipeCoveragePercent < 35 ? "warning" : "opportunity",
          title: "Định mức món chưa đủ để AI dự báo kho",
          detail: `${recipeReadyItemCount}/${menuItemCountForInventory} món đã có định mức nguyên liệu.`,
          action: "Bổ sung recipe cho món bán chạy để AI trừ kho, dự báo thiếu hàng và food cost chính xác hơn.",
          evidence: [
            `recipeCoverage=${recipeCoveragePercent}`,
            `recipeReady=${recipeReadyItemCount}`,
            `menuItems=${menuItemCountForInventory}`
          ],
          metric: { label: "Recipe coverage", value: `${Math.round(recipeCoveragePercent)}%` },
          actionIntent: "inventory",
          actionHref: "/dashboard/inventory"
        })
      );
    }

    const expiringBatchCount = asNumber(inventory.expiringBatchCount);
    if (expiringBatchCount > 0) {
      insights.push(
        buildInsight({
          kind: "inventory",
          severity: expiringBatchCount >= 3 ? "warning" : "info",
          title: "Có lô hàng sắp hết hạn",
          detail: `${expiringBatchCount} lô hàng cần dùng trước hoặc kiểm tra hạn.`,
          action: "Ưu tiên đưa nguyên liệu sắp hết hạn vào món/combo phù hợp hoặc kiểm kê lại.",
          evidence: [`expiringBatch=${expiringBatchCount}`],
          metric: { label: "Lô sắp hết hạn", value: String(expiringBatchCount) },
          actionIntent: "inventory",
          actionHref: "/dashboard/inventory"
        })
      );
    }

    const openAlertCount = asNumber(inventory.openAlertCount);
    if (openAlertCount > 0) {
      insights.push(
        buildInsight({
          kind: "inventory",
          severity: openAlertCount >= 5 ? "warning" : "info",
          title: "Kho có cảnh báo chưa xử lý",
          detail: `${openAlertCount} cảnh báo kho đang mở trong hệ thống.`,
          action: "Mở tab cảnh báo kho để xử lý tồn thấp, lệch kho hoặc lô cần kiểm tra.",
          evidence: [`openInventoryAlerts=${openAlertCount}`],
          metric: { label: "Alert kho", value: String(openAlertCount) },
          actionIntent: "inventory",
          actionHref: "/dashboard/inventory"
        })
      );
    }
  }

  const qrDisabledCount = asNumber(snapshot.tables?.qrDisabledCount);
  if (qrDisabledCount > 0) {
    insights.push(
      buildInsight({
        kind: "tables",
        severity: "warning",
        title: "Có bàn chưa bật QR",
        detail: `${qrDisabledCount} bàn đang tắt QR, có thể làm mất đơn tự phục vụ.`,
        action: "Mở màn Bàn & QR để bật lại trước giờ đông khách.",
        evidence: [`qrDisabled=${qrDisabledCount}`],
        metric: { label: "QR tắt", value: String(qrDisabledCount) },
        actionIntent: "tables",
        actionHref: "/dashboard/tables"
      })
    );
  }

  const activePromotions = Array.isArray(snapshot.promotions)
    ? snapshot.promotions.filter((promotion) => promotion.active !== false && promotion.is_active !== false)
    : [];
  if (orderCount > 0 && activePromotions.length === 0) {
    insights.push(
      buildInsight({
        kind: "promotion",
        severity: "opportunity",
        title: "Chưa có chiến dịch đang chạy",
        detail: "Quán đã có đơn nhưng chưa có khuyến mãi active trong snapshot.",
        action: "Tạo một ưu đãi có min order cho khung thấp điểm hoặc nhóm khách quay lại.",
        evidence: [`orderCount=${orderCount}`, "activePromotions=0"],
        metric: { label: "Promo active", value: "0" },
        actionIntent: "promotions",
        actionHref: "/dashboard/promotions"
      })
    );
  }

  const sortedInsights = insights
    .sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || b.evidence.length - a.evidence.length)
    .slice(0, 7);
  const healthScore = scoreHealth(sortedInsights, orderCount > 0);

  return {
    generatedAt: now.toISOString(),
    healthScore,
    summary: summarizeDeck(sortedInsights, healthScore),
    primaryInsightId: sortedInsights[0]?.id ?? null,
    insights: sortedInsights
  };
}
