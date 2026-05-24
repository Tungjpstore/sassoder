import type { AiOperationInsight } from "@/lib/ai/operation-insights";
import type { AiAgentAction, AiAgentMissionStep } from "@/types/ai-agent";

export type AiAutomationWorkflowDomain = "inventory" | "marketing" | "staffing";
export type AiAutomationWorkflowPriority = "critical" | "high" | "medium";

export type AiAutomationWorkflow = {
  id: string;
  domain: AiAutomationWorkflowDomain;
  title: string;
  trigger: string;
  outcome: string;
  priority: AiAutomationWorkflowPriority;
  confidence: "high" | "medium";
  estimatedMinutes: number;
  executionMode: "confirm_first" | "manual_only";
  evidence: string[];
  steps: AiAgentMissionStep[];
  actions: AiAgentAction[];
};

type AutomationSnapshot = {
  summary24h?: {
    orderCount?: number;
    paidRevenue?: number;
  } | null;
  inventory?: {
    lowStockCount?: number;
    openAlertCount?: number;
    projectedPurchaseValue?: number;
    reorderSuggestionCount?: number;
    highReorderCount?: number;
    wasteSignalCount?: number;
    expiringBatchCount?: number;
    highFoodCostItemCount?: number;
    recipeCoveragePercent?: number;
  } | null;
  promotions?: Array<{
    active?: boolean;
    showOnCustomerMenu?: boolean;
  }> | null;
  operationInsights?: {
    insights?: AiOperationInsight[];
  } | null;
};

function asNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatVnd(value: number) {
  return `${Math.max(0, Math.round(value)).toLocaleString("vi-VN")}đ`;
}

function workflowAction(input: AiAgentAction): AiAgentAction {
  return {
    safety: "confirm",
    priority: "secondary",
    ...input
  };
}

function workflowStep(id: string, label: string, description: string, status: AiAgentMissionStep["status"]): AiAgentMissionStep {
  return { id, label, description, status };
}

function insightSeverityScore(insight: AiOperationInsight) {
  if (insight.severity === "critical") return 3;
  if (insight.severity === "warning") return 2;
  return 1;
}

function byPriority(left: AiAutomationWorkflow, right: AiAutomationWorkflow) {
  const rank: Record<AiAutomationWorkflowPriority, number> = { critical: 3, high: 2, medium: 1 };
  return rank[right.priority] - rank[left.priority] || right.evidence.length - left.evidence.length;
}

export function buildAiAutomationWorkflows(input: { snapshot?: unknown; limit?: number } = {}): AiAutomationWorkflow[] {
  const snapshot = (input.snapshot ?? {}) as AutomationSnapshot;
  const inventory = snapshot.inventory;
  const summary = snapshot.summary24h;
  const insights = snapshot.operationInsights?.insights ?? [];
  const workflows: AiAutomationWorkflow[] = [];

  const lowStockCount = asNumber(inventory?.lowStockCount);
  const projectedPurchaseValue = asNumber(inventory?.projectedPurchaseValue);
  const reorderSuggestionCount = asNumber(inventory?.reorderSuggestionCount);
  const highReorderCount = asNumber(inventory?.highReorderCount);
  const openAlertCount = asNumber(inventory?.openAlertCount);

  if (lowStockCount > 0 || projectedPurchaseValue > 0 || reorderSuggestionCount > 0) {
    workflows.push({
      id: "workflow-inventory-purchase-plan",
      domain: "inventory",
      title: "Chốt kế hoạch nhập hàng",
      trigger:
        projectedPurchaseValue > 0
          ? `Dự kiến cần nhập ${formatVnd(projectedPurchaseValue)}.`
          : `${lowStockCount || reorderSuggestionCount} nguyên liệu cần xem lại tồn kho.`,
      outcome: "Có danh sách nguyên liệu cần mua, PO nháp hoặc checklist gọi nhà cung cấp trước giờ cao điểm.",
      priority: highReorderCount > 0 || lowStockCount >= 3 || projectedPurchaseValue >= 500000 ? "critical" : "high",
      confidence: projectedPurchaseValue > 0 || reorderSuggestionCount > 0 ? "high" : "medium",
      estimatedMinutes: 8,
      executionMode: "confirm_first",
      evidence: [
        `lowStock=${lowStockCount}`,
        `reorderSuggestions=${reorderSuggestionCount}`,
        `highReorder=${highReorderCount}`,
        `projectedPurchase=${projectedPurchaseValue}`,
        `openInventoryAlerts=${openAlertCount}`
      ],
      steps: [
        workflowStep("review-shortage", "Rà nguyên liệu thiếu", "Mở danh sách tồn thấp và đề xuất reorder.", "ready"),
        workflowStep("group-po-lines", "Gom dòng mua", "Gộp nguyên liệu theo nhà cung cấp hoặc nhóm hàng.", "needs_confirmation"),
        workflowStep("confirm-owner", "Chủ quán xác nhận", "Chỉ tạo PO hoặc gửi thông báo sau khi có xác nhận.", "manual")
      ],
      actions: [
        workflowAction({
          id: "open-inventory-purchase-plan",
          type: "link",
          label: "Mở kế hoạch nhập",
          href: "/dashboard/inventory",
          intent: "inventory",
          priority: "primary",
          safety: "safe"
        }),
        workflowAction({
          id: "draft-purchase-checklist",
          type: "prompt",
          label: "Soạn checklist mua hàng",
          prompt: "Tạo checklist nhập hàng ngắn gọn từ các nguyên liệu thiếu, ưu tiên món bán chạy và giờ cao điểm.",
          intent: "inventory",
          safety: "confirm"
        })
      ]
    });
  }

  const wasteSignalCount = asNumber(inventory?.wasteSignalCount);
  const expiringBatchCount = asNumber(inventory?.expiringBatchCount);
  const highFoodCostItemCount = asNumber(inventory?.highFoodCostItemCount);
  const recipeCoveragePercent = asNumber(inventory?.recipeCoveragePercent);

  if (expiringBatchCount > 0 || openAlertCount >= 3) {
    workflows.push({
      id: "workflow-inventory-expiry-alert-sweep",
      domain: "inventory",
      title: "Dọn cảnh báo kho và hạn dùng",
      trigger: `${expiringBatchCount} lô gần hết hạn · ${openAlertCount} cảnh báo kho đang mở.`,
      outcome: "Có checklist xử lý lô gần hết hạn, hàng cần xả trước và cảnh báo cần xác nhận trong ngày.",
      priority: expiringBatchCount >= 3 || openAlertCount >= 5 ? "high" : "medium",
      confidence: expiringBatchCount > 0 ? "high" : "medium",
      estimatedMinutes: 6,
      executionMode: "manual_only",
      evidence: [`expiringBatches=${expiringBatchCount}`, `openInventoryAlerts=${openAlertCount}`],
      steps: [
        workflowStep("review-expiry", "Rà lô gần hết hạn", "Ưu tiên lô FEFO trong kho/bếp/bar.", "ready"),
        workflowStep("assign-action", "Chọn hành động", "Xả hàng, chuyển chi nhánh, tạo món đẩy bán hoặc ghi waste.", "queued"),
        workflowStep("close-alerts", "Đóng cảnh báo", "Xác nhận cảnh báo đã xử lý để dashboard sạch trước ca.", "manual")
      ],
      actions: [
        workflowAction({
          id: "open-inventory-alerts",
          type: "link",
          label: "Mở cảnh báo kho",
          href: "/dashboard/inventory",
          intent: "inventory_alerts",
          safety: "safe",
          priority: "primary"
        })
      ]
    });
  }

  if (lowStockCount > 0 && (expiringBatchCount > 0 || openAlertCount > 0)) {
    workflows.push({
      id: "workflow-inventory-branch-transfer-balance",
      domain: "inventory",
      title: "Cân bằng kho giữa chi nhánh",
      trigger: `${lowStockCount} dòng tồn thấp trong khi có ${expiringBatchCount} lô cần ưu tiên FEFO.`,
      outcome: "Có draft điều chuyển hoặc checklist chuyển hàng từ kho tổng/chi nhánh dư sang điểm thiếu trước giờ cao điểm.",
      priority: lowStockCount >= 3 ? "high" : "medium",
      confidence: "medium",
      estimatedMinutes: 7,
      executionMode: "confirm_first",
      evidence: [`lowStock=${lowStockCount}`, `expiringBatches=${expiringBatchCount}`, `openInventoryAlerts=${openAlertCount}`],
      steps: [
        workflowStep("review-shortage-branches", "Rà điểm thiếu", "Xem stock board và cân bằng kho theo chi nhánh.", "ready"),
        workflowStep("draft-transfer", "Tạo nháp điều chuyển", "Gom nguyên liệu cần chuyển theo kho nguồn và kho nhận.", "needs_confirmation"),
        workflowStep("dispatch-receive", "Xuất và nhận", "Chỉ ghi transfer out/in sau khi chủ quán xác nhận luồng chuyển.", "manual")
      ],
      actions: [
        workflowAction({
          id: "open-inventory-transfer-balance",
          type: "link",
          label: "Mở điều chuyển",
          href: "/dashboard/inventory",
          intent: "inventory_transfers",
          safety: "safe",
          priority: "primary"
        })
      ]
    });
  }

  if (wasteSignalCount > 0 || highFoodCostItemCount > 0 || (recipeCoveragePercent > 0 && recipeCoveragePercent < 70)) {
    workflows.push({
      id: "workflow-inventory-margin-guard",
      domain: "inventory",
      title: "Giữ biên lợi nhuận món",
      trigger: `${wasteSignalCount} tín hiệu hao hụt · ${highFoodCostItemCount} món food cost cao.`,
      outcome: "Có danh sách món/nguyên liệu cần rà định mức, giá vốn hoặc topping trước khi chạy khuyến mãi.",
      priority: wasteSignalCount >= 3 || highFoodCostItemCount >= 3 ? "high" : "medium",
      confidence: wasteSignalCount > 0 || highFoodCostItemCount > 0 ? "high" : "medium",
      estimatedMinutes: 10,
      executionMode: "manual_only",
      evidence: [`wasteSignals=${wasteSignalCount}`, `highFoodCostItems=${highFoodCostItemCount}`, `recipeCoverage=${recipeCoveragePercent}`],
      steps: [
        workflowStep("review-food-cost", "Rà food cost", "Mở các món có tỷ lệ giá vốn cao.", "ready"),
        workflowStep("check-waste", "Đối chiếu hao hụt", "Xem ca/lý do phát sinh waste gần đây.", "queued"),
        workflowStep("adjust-menu", "Chốt thay đổi", "Chủ quán quyết định sửa định mức, topping hoặc giá bán.", "manual")
      ],
      actions: [
        workflowAction({
          id: "open-inventory-margin",
          type: "link",
          label: "Mở food cost",
          href: "/dashboard/inventory",
          intent: "inventory",
          safety: "safe",
          priority: "primary"
        })
      ]
    });
  }

  const orderCount = asNumber(summary?.orderCount);
  const paidRevenue = asNumber(summary?.paidRevenue);
  const promotionInsight = insights.filter((insight) => insight.kind === "promotion").sort((left, right) => insightSeverityScore(right) - insightSeverityScore(left))[0];
  const activePromotionCount = (snapshot.promotions ?? []).filter((promotion) => promotion.active && promotion.showOnCustomerMenu !== false).length;

  if (promotionInsight || (summary && orderCount <= 3 && paidRevenue < 300000)) {
    workflows.push({
      id: "workflow-marketing-quiet-hour-campaign",
      domain: "marketing",
      title: "Kích hoạt chiến dịch giờ thấp điểm",
      trigger: promotionInsight?.detail ?? `${orderCount} đơn, doanh thu ${formatVnd(paidRevenue)} trong 24h.`,
      outcome: "Có nháp mã ưu đãi hoặc nội dung Facebook/Zalo phù hợp, kèm điều kiện bảo vệ biên lợi nhuận.",
      priority: orderCount === 0 ? "high" : "medium",
      confidence: promotionInsight ? "high" : "medium",
      estimatedMinutes: 7,
      executionMode: "confirm_first",
      evidence: [`orders24h=${orderCount}`, `paidRevenue=${paidRevenue}`, `activePromotions=${activePromotionCount}`],
      steps: [
        workflowStep("choose-offer", "Chọn offer", "Ưu tiên combo hoặc min order thay vì giảm sâu toàn menu.", "ready"),
        workflowStep("draft-copy", "Soạn nội dung", "Tạo caption/push ngắn theo tệp khách phù hợp.", "needs_confirmation"),
        workflowStep("publish-owner", "Chủ quán duyệt", "Chỉ bật mã hoặc gửi thông báo sau khi chủ quán xác nhận.", "manual")
      ],
      actions: [
        workflowAction({
          id: "open-promotions-workflow",
          type: "link",
          label: "Mở khuyến mãi",
          href: "/dashboard/promotions",
          intent: "promotions",
          priority: "primary",
          safety: "safe"
        }),
        workflowAction({
          id: "draft-quiet-hour-post",
          type: "prompt",
          label: "Viết bài kéo khách",
          prompt: "Viết một caption Facebook/Zalo ngắn cho quán F&B Việt Nam để kéo khách giờ thấp điểm, có CTA rõ và không giảm giá quá sâu.",
          intent: "growth",
          safety: "confirm"
        })
      ]
    });
  }

  const staffingInsight = insights
    .filter((insight) => insight.kind === "staffing")
    .sort((left, right) => insightSeverityScore(right) - insightSeverityScore(left))[0];

  if (staffingInsight) {
    workflows.push({
      id: "workflow-staffing-coverage-review",
      domain: "staffing",
      title: "Rà ca trực và phân công nhân sự",
      trigger: staffingInsight.detail,
      outcome: "Có checklist xử lý ca thiếu người, yêu cầu chờ duyệt hoặc chi nhánh cần điều phối.",
      priority: staffingInsight.severity === "critical" || staffingInsight.severity === "warning" ? "high" : "medium",
      confidence: staffingInsight.confidence === "low" ? "medium" : "high",
      estimatedMinutes: 6,
      executionMode: "confirm_first",
      evidence: staffingInsight.evidence.slice(0, 5),
      steps: [
        workflowStep("open-staff", "Mở nhân sự", "Xem coverage, lượt muộn và yêu cầu đang chờ.", "ready"),
        workflowStep("choose-fix", "Chọn điều phối", "Duyệt yêu cầu hoặc nhắc nhân viên theo chi nhánh/ca.", "needs_confirmation"),
        workflowStep("confirm-change", "Xác nhận thay đổi", "Không sửa phân quyền hoặc ca trực nếu chưa có chủ quán xác nhận.", "manual")
      ],
      actions: [
        workflowAction({
          id: "open-staffing-workflow",
          type: "link",
          label: "Mở nhân sự",
          href: "/dashboard/staff",
          intent: "staff",
          priority: "primary",
          safety: "safe"
        })
      ]
    });
  }

  return workflows.sort(byPriority).slice(0, Math.max(1, Math.min(6, input.limit ?? 4)));
}
