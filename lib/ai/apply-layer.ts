import type { AiExecutionCenterDeck, AiExecutionItem } from "@/lib/ai/execution-center";

export type AiApplyPlanStatus = "ready" | "needs_approval" | "manual_only" | "blocked" | "completed";
export type AiApplyPlanRisk = "low" | "medium" | "high";
export type AiApplyPlanActionType = "open_page" | "server_action" | "api_call" | "manual_check";

export type AiApplyPlan = {
  id: string;
  itemId: string;
  databaseId?: string | null;
  title: string;
  status: AiApplyPlanStatus;
  risk: AiApplyPlanRisk;
  targetHref?: string | null;
  actionType: AiApplyPlanActionType;
  confirmationRequired: boolean;
  ownerCopy: string;
  preconditions: string[];
  steps: Array<{
    id: string;
    label: string;
    detail: string;
    done: boolean;
  }>;
  payloadContract: Array<{
    field: string;
    requirement: string;
  }>;
  rollback: string;
  blockers: string[];
};

export type AiApplyLayerDeck = {
  generatedAt: string;
  summary: {
    total: number;
    ready: number;
    needsApproval: number;
    manualOnly: number;
    blocked: number;
    highRisk: number;
    completed: number;
  };
  plans: AiApplyPlan[];
  guardrails: Array<{
    id: string;
    title: string;
    detail: string;
  }>;
};

function statusFor(item: AiExecutionItem): AiApplyPlanStatus {
  if (item.status === "completed") return "completed";
  if (item.status === "blocked") return "blocked";
  if (item.status === "manual") return "manual_only";
  if (item.status === "approved") return "ready";
  return "needs_approval";
}

function riskFor(item: AiExecutionItem): AiApplyPlanRisk {
  if (item.domain === "payment" || item.priority === "critical") return "high";
  if (item.domain === "menu" || item.domain === "growth" || item.domain === "inventory") return "medium";
  return "low";
}

function actionTypeFor(item: AiExecutionItem): AiApplyPlanActionType {
  if (item.status === "blocked" || item.status === "manual") return "manual_check";
  if (item.kind === "workflow") return "server_action";
  if (item.kind === "recommendation") return "server_action";
  return item.actionHref ? "open_page" : "manual_check";
}

function ownerCopy(item: AiExecutionItem) {
  if (item.status === "pending") return "Duyệt item này trước, sau đó mở màn hình xử lý để áp dụng.";
  if (item.status === "approved") return "Item đã được duyệt. Thực hiện các bước apply và đánh dấu hoàn tất khi xong.";
  if (item.status === "blocked") return "Không áp dụng cho tới khi blocker được gỡ.";
  if (item.status === "manual") return "Cần người quản lý kiểm tra và thao tác thủ công.";
  return "Item đã hoàn tất, giữ lại để audit.";
}

function payloadContract(item: AiExecutionItem) {
  if (item.domain === "menu") {
    return [
      { field: "menu_item_id/category_id", requirement: "Bắt buộc chọn món hoặc danh mục cụ thể trước khi lưu." },
      { field: "price/offer", requirement: "Nếu có đổi giá hoặc combo, chủ quán phải xác nhận." },
      { field: "image/copy", requirement: "Nội dung phải khớp món thật, không thêm topping không bán." }
    ];
  }
  if (item.domain === "growth") {
    return [
      { field: "campaign_channel", requirement: "Chọn kênh Facebook/Zalo/QR/Online trước khi publish." },
      { field: "offer", requirement: "Có điều kiện rõ ràng: thời gian, min order, phạm vi áp dụng." },
      { field: "approval", requirement: "Không tự publish; cần confirm-first." }
    ];
  }
  if (item.domain === "support") {
    return [
      { field: "scenario", requirement: "Xác định intent khách và kênh áp dụng." },
      { field: "handoff_rule", requirement: "Payment, khiếu nại, dị ứng nghiêm trọng phải chuyển người thật." },
      { field: "allowed_data", requirement: "Không dùng PII hoặc dữ liệu nội bộ trong câu trả lời public." }
    ];
  }
  if (item.domain === "payment") {
    return [
      { field: "order_id/bill_id", requirement: "Bắt buộc có mã đơn hoặc bill." },
      { field: "evidence", requirement: "Cần bằng chứng thanh toán từ hệ thống hoặc nhân viên." },
      { field: "refund", requirement: "Không tự hoàn tiền; chỉ tạo checklist xử lý." }
    ];
  }
  return [
    { field: "target", requirement: "Xác định đối tượng thao tác trước khi áp dụng." },
    { field: "approval", requirement: "Giữ confirm-first nếu ảnh hưởng doanh thu, khách hoặc dữ liệu." }
  ];
}

function preconditions(item: AiExecutionItem) {
  const base = ["Người thao tác có quyền admin.", "Dữ liệu trong màn hình đích được kiểm tra lại trước khi lưu."];
  if (item.status === "pending") return ["Item phải được duyệt trong AI Execution Center.", ...base];
  if (item.status === "blocked") return [...item.blockers, ...base];
  return base;
}

function stepsFor(item: AiExecutionItem) {
  return [
    {
      id: "review",
      label: "Rà đề xuất",
      detail: item.detail,
      done: item.status === "approved" || item.status === "completed"
    },
    {
      id: "confirm",
      label: "Xác nhận phạm vi",
      detail: item.safetyMode === "confirm_first" ? "Xác nhận tác động trước khi áp dụng." : "Kiểm tra thủ công theo policy.",
      done: item.status === "approved" || item.status === "completed"
    },
    {
      id: "apply",
      label: "Áp dụng tại màn hình đích",
      detail: item.action,
      done: item.status === "completed"
    }
  ];
}

function rollbackFor(item: AiExecutionItem) {
  if (item.domain === "menu") return "Tắt món/combo hoặc khôi phục giá cũ trong Menu món.";
  if (item.domain === "growth") return "Tắt promotion/campaign và ghi chú lý do trong báo cáo ca.";
  if (item.domain === "support") return "Tắt kịch bản trả lời tự động và chuyển sang handoff.";
  if (item.domain === "payment") return "Giữ trạng thái manual, ghi audit và chuyển quản lý xác minh.";
  return "Đánh dấu item chưa hoàn tất và quay lại màn hình vận hành liên quan.";
}

export function buildAiApplyPlan(item: AiExecutionItem): AiApplyPlan {
  return {
    id: `apply:${item.id}`,
    itemId: item.id,
    databaseId: item.databaseId,
    title: item.title,
    status: statusFor(item),
    risk: riskFor(item),
    targetHref: item.actionHref,
    actionType: actionTypeFor(item),
    confirmationRequired: item.safetyMode !== "safe_open",
    ownerCopy: ownerCopy(item),
    preconditions: preconditions(item),
    steps: stepsFor(item),
    payloadContract: payloadContract(item),
    rollback: rollbackFor(item),
    blockers: item.blockers
  };
}

export function buildAiApplyLayerDeck(executionDeck: AiExecutionCenterDeck): AiApplyLayerDeck {
  const plans = executionDeck.items.map(buildAiApplyPlan);
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      total: plans.length,
      ready: plans.filter((plan) => plan.status === "ready").length,
      needsApproval: plans.filter((plan) => plan.status === "needs_approval").length,
      manualOnly: plans.filter((plan) => plan.status === "manual_only").length,
      blocked: plans.filter((plan) => plan.status === "blocked").length,
      highRisk: plans.filter((plan) => plan.risk === "high").length,
      completed: plans.filter((plan) => plan.status === "completed").length
    },
    plans,
    guardrails: [
      {
        id: "confirm-first",
        title: "Không auto-apply hành động nhạy cảm",
        detail: "Giá, thanh toán, campaign, support khách và menu public luôn cần xác nhận."
      },
      {
        id: "payload-contract",
        title: "Mọi apply đều có contract",
        detail: "Trước khi lưu phải biết field nào cần có, ai xác nhận và cách rollback."
      },
      {
        id: "audit-complete",
        title: "Hoàn tất có chủ đích",
        detail: "Sau khi xử lý, đánh dấu resolved/completed để giữ hàng đợi sạch và audit được."
      }
    ]
  };
}
