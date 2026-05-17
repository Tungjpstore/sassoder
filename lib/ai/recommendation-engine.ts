import type { AiOperationInsight, AiOperationInsightsDeck } from "@/lib/ai/operation-insights";

export type AiRecommendationType =
  | "combo"
  | "upsell"
  | "promotion"
  | "staffing"
  | "inventory"
  | "menu"
  | "payment"
  | "customer_retention"
  | "pricing";

export type AiRecommendationPriority = "critical" | "high" | "medium" | "low";
export type AiRecommendationStatus = "active" | "accepted" | "dismissed" | "resolved" | "expired";

export type AiRecommendation = {
  id: string;
  type: AiRecommendationType;
  priority: AiRecommendationPriority;
  title: string;
  detail: string;
  action: string;
  actionHref?: string | null;
  actionIntent?: string | null;
  confidence: "high" | "medium" | "low";
  estimatedImpact?: {
    label: string;
    value?: number | null;
  } | null;
  evidence: string[];
  sourceInsightId?: string | null;
  status?: AiRecommendationStatus;
  lifecycle?: {
    databaseId?: string;
    status: AiRecommendationStatus;
    schemaReady?: boolean;
    firstSeenAt?: string | null;
    lastSeenAt?: string | null;
    acceptedAt?: string | null;
    dismissedAt?: string | null;
    resolvedAt?: string | null;
    expiresAt?: string | null;
  };
};

export type AiRecommendationDeck = {
  generatedAt: string;
  summary: string;
  recommendations: AiRecommendation[];
};

const priorityRank: Record<AiRecommendationPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1
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

function priorityFromInsight(insight: AiOperationInsight): AiRecommendationPriority {
  if (insight.severity === "critical") return "critical";
  if (insight.severity === "warning") return "high";
  if (insight.severity === "opportunity") return "medium";
  return "low";
}

function recommendationId(type: AiRecommendationType, title: string, sourceInsightId?: string | null) {
  return `${type}-${sourceInsightId ?? (foldText(title).slice(0, 64) || "signal")}`;
}

function fromInsight(insight: AiOperationInsight): AiRecommendation | null {
  if (insight.kind === "inventory") {
    return {
      id: recommendationId("inventory", insight.title, insight.id),
      type: "inventory",
      priority: priorityFromInsight(insight),
      title: insight.title.includes("nhập") ? "Tạo kế hoạch nhập hàng" : "Xử lý rủi ro kho",
      detail: insight.detail,
      action: insight.action || "Mở kho để rà nguyên liệu thiếu, cảnh báo hao hụt và recipe coverage.",
      actionHref: insight.actionHref ?? "/dashboard/inventory",
      actionIntent: "inventory_review",
      confidence: insight.confidence,
      estimatedImpact: insight.metric ? { label: insight.metric.label } : { label: "Giảm thiếu hàng" },
      evidence: insight.evidence,
      sourceInsightId: insight.id
    };
  }

  if (insight.kind === "menu") {
    return {
      id: recommendationId("combo", insight.title, insight.id),
      type: "combo",
      priority: priorityFromInsight(insight),
      title: "Biến món mạnh thành combo/upsell",
      detail: insight.detail,
      action: insight.action || "Tạo combo quanh món bán chạy và thêm topping/size để tăng giá trị đơn.",
      actionHref: insight.actionHref ?? "/dashboard/menu",
      actionIntent: "create_combo",
      confidence: insight.confidence,
      estimatedImpact: { label: "Tăng average ticket" },
      evidence: insight.evidence,
      sourceInsightId: insight.id
    };
  }

  if (insight.kind === "promotion" || insight.kind === "revenue") {
    return {
      id: recommendationId("promotion", insight.title, insight.id),
      type: "promotion",
      priority: priorityFromInsight(insight),
      title: "Chạy khuyến mãi ngắn hạn",
      detail: insight.detail,
      action: insight.action || "Tạo ưu đãi khung thấp điểm hoặc combo nhỏ để kéo đơn trong hôm nay.",
      actionHref: insight.actionHref ?? "/dashboard/promotions",
      actionIntent: "create_promotion",
      confidence: insight.confidence,
      estimatedImpact: { label: "Kéo doanh thu thấp điểm" },
      evidence: insight.evidence,
      sourceInsightId: insight.id
    };
  }

  if (insight.kind === "staffing" || insight.kind === "service" || insight.kind === "tables") {
    return {
      id: recommendationId("staffing", insight.title, insight.id),
      type: "staffing",
      priority: priorityFromInsight(insight),
      title: insight.kind === "staffing" ? "Điều phối ca làm" : "Giảm nghẽn phục vụ",
      detail: insight.detail,
      action: insight.action || "Mở vận hành để xử lý bàn/đơn đang quá tải trước giờ cao điểm.",
      actionHref: insight.actionHref ?? (insight.kind === "staffing" ? "/dashboard/staff" : "/dashboard/orders"),
      actionIntent: "ops_review",
      confidence: insight.confidence,
      estimatedImpact: { label: "Giảm chậm phục vụ" },
      evidence: insight.evidence,
      sourceInsightId: insight.id
    };
  }

  if (insight.kind === "payment") {
    return {
      id: recommendationId("payment", insight.title, insight.id),
      type: "payment",
      priority: priorityFromInsight(insight),
      title: "Dọn thanh toán treo",
      detail: insight.detail,
      action: insight.action || "Mở danh sách thanh toán chờ xác nhận và xử lý trước khi hết ca.",
      actionHref: insight.actionHref ?? "/dashboard/orders",
      actionIntent: "payment_followup",
      confidence: insight.confidence,
      estimatedImpact: { label: "Giảm thất thoát" },
      evidence: insight.evidence,
      sourceInsightId: insight.id
    };
  }

  return null;
}

export function buildAiRecommendationDeck(input: { operationInsights: AiOperationInsightsDeck; limit?: number }): AiRecommendationDeck {
  const seen = new Set<string>();
  const recommendations = input.operationInsights.insights
    .map(fromInsight)
    .filter((recommendation): recommendation is AiRecommendation => Boolean(recommendation))
    .filter((recommendation) => {
      const key = `${recommendation.type}:${recommendation.actionHref}:${recommendation.sourceInsightId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority])
    .slice(0, input.limit ?? 6);

  return {
    generatedAt: input.operationInsights.generatedAt,
    summary: recommendations.length
      ? `${recommendations.length} gợi ý AI sẵn sàng để chủ quán duyệt.`
      : "Chưa có gợi ý AI đủ rõ để lưu thành hành động.",
    recommendations
  };
}
