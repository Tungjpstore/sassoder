import type { AiAutomationWorkflowDomain } from "@/lib/ai/automation-workflows";

export type AiAutomationPlaybookDomain =
  | AiAutomationWorkflowDomain
  | "operations"
  | "customer"
  | "branch"
  | "support";

export type AiAutomationPlaybookStatus = "ready" | "watch" | "blocked";
export type AiAutomationPlaybookPriority = "critical" | "high" | "medium";
export type AiAutomationPlaybookLevel = "manual" | "confirm_first" | "ready_to_automate";

export type AiAutomationPlaybookTemplate = {
  id: string;
  domain: AiAutomationPlaybookDomain;
  title: string;
  trigger: string;
  outcome: string;
  priority: AiAutomationPlaybookPriority;
  cadence: "realtime" | "hourly" | "daily" | "weekly";
  level: AiAutomationPlaybookLevel;
  requiredSchemas: Array<"recommendations" | "automationRuns" | "restaurantMemories">;
  requiredCapabilities: Array<"provider" | "memory" | "workflow_runs" | "recommendations">;
  safetyMode: "manual_only" | "confirm_first";
  channels: string[];
  actions: Array<{
    id: string;
    label: string;
    href: string;
  }>;
};

export type AiAutomationPlaybook = AiAutomationPlaybookTemplate & {
  status: AiAutomationPlaybookStatus;
  readinessScore: number;
  blockers: string[];
  liveSignals: string[];
  linkedWorkflowCount: number;
  linkedRecommendationCount: number;
  nextAction: string;
};

export type AiAutomationPlaybookSummary = {
  total: number;
  ready: number;
  watch: number;
  blocked: number;
  confirmFirst: number;
  readyToAutomate: number;
  criticalOpen: number;
};

export type BuildAiAutomationPlaybooksInput = {
  providerConfigured: boolean;
  schemas: {
    recommendations: boolean;
    automationRuns: boolean;
    restaurantMemories: boolean;
  };
  workflows?: Array<{
    id: string;
    domain: AiAutomationWorkflowDomain;
    priority: AiAutomationPlaybookPriority;
    title: string;
  }>;
  recommendations?: Array<{
    id: string;
    type: string;
    priority: AiAutomationPlaybookPriority | "low";
    title: string;
  }>;
  memoryCount?: number;
};

const playbookTemplates: AiAutomationPlaybookTemplate[] = [
  {
    id: "playbook-low-stock-purchase",
    domain: "inventory",
    title: "Tự động hóa nhập hàng tồn thấp",
    trigger: "Nguyên liệu dưới ngưỡng, món bán chạy có nguy cơ thiếu hoặc PO nháp cần gom dòng mua.",
    outcome: "Chủ quán có checklist nhập hàng, PO nháp và cảnh báo trước giờ cao điểm.",
    priority: "critical",
    cadence: "hourly",
    level: "confirm_first",
    requiredSchemas: ["automationRuns", "recommendations"],
    requiredCapabilities: ["provider", "workflow_runs", "recommendations"],
    safetyMode: "confirm_first",
    channels: ["Dashboard", "AI Ops", "Inventory"],
    actions: [{ id: "open-inventory", label: "Mở kho hàng", href: "/dashboard/inventory" }]
  },
  {
    id: "playbook-quiet-hour-growth",
    domain: "marketing",
    title: "Chiến dịch kéo khách giờ thấp điểm",
    trigger: "Doanh thu hoặc lượng đơn thấp hơn nhịp thường ngày, đặc biệt trước khung chiều/tối.",
    outcome: "AI soạn offer, caption và kênh gửi phù hợp nhưng vẫn giữ biên lợi nhuận.",
    priority: "high",
    cadence: "hourly",
    level: "confirm_first",
    requiredSchemas: ["automationRuns", "recommendations", "restaurantMemories"],
    requiredCapabilities: ["provider", "workflow_runs", "recommendations", "memory"],
    safetyMode: "confirm_first",
    channels: ["Dashboard", "Promotions", "Zalo/Facebook future"],
    actions: [{ id: "open-promotions", label: "Mở khuyến mãi", href: "/dashboard/promotions" }]
  },
  {
    id: "playbook-staffing-pressure",
    domain: "staffing",
    title: "Rà thiếu nhân sự theo ca",
    trigger: "Giờ cao điểm, order backlog, check-in muộn hoặc chi nhánh thiếu coverage.",
    outcome: "AI đề xuất điều ca, nhắc nhân viên hoặc danh sách việc cần chủ quán duyệt.",
    priority: "high",
    cadence: "realtime",
    level: "confirm_first",
    requiredSchemas: ["automationRuns", "recommendations"],
    requiredCapabilities: ["provider", "workflow_runs", "recommendations"],
    safetyMode: "confirm_first",
    channels: ["Dashboard", "Staff"],
    actions: [{ id: "open-staff", label: "Mở nhân viên", href: "/dashboard/staff" }]
  },
  {
    id: "playbook-service-delay",
    domain: "operations",
    title: "Phát hiện phục vụ chậm bất thường",
    trigger: "Bàn hoặc đơn vượt SLA so với loại hình phục vụ, bếp hoặc thanh toán.",
    outcome: "AI chỉ ra điểm nghẽn và mở đúng màn hình xử lý thay vì báo cáo lan man.",
    priority: "critical",
    cadence: "realtime",
    level: "ready_to_automate",
    requiredSchemas: ["recommendations"],
    requiredCapabilities: ["provider", "recommendations"],
    safetyMode: "manual_only",
    channels: ["Dashboard", "Orders", "Kitchen"],
    actions: [{ id: "open-orders", label: "Mở đơn hàng", href: "/dashboard/orders" }]
  },
  {
    id: "playbook-menu-upsell",
    domain: "customer",
    title: "Gợi ý upsell và combo theo hành vi khách",
    trigger: "Món bán chạy, topping reorder cao hoặc nhóm khách có pattern gọi món lặp lại.",
    outcome: "Nhân viên và menu online có gợi ý combo/topping rõ ràng, dễ bấm, không làm phiền khách.",
    priority: "medium",
    cadence: "daily",
    level: "confirm_first",
    requiredSchemas: ["recommendations", "restaurantMemories"],
    requiredCapabilities: ["provider", "recommendations", "memory"],
    safetyMode: "confirm_first",
    channels: ["Menu", "QR ordering", "Online ordering"],
    actions: [{ id: "open-menu", label: "Mở menu", href: "/dashboard/menu" }]
  },
  {
    id: "playbook-payment-risk",
    domain: "operations",
    title: "Theo dõi thanh toán treo và VietQR",
    trigger: "Đơn QR prepaid, bill chờ xác nhận hoặc trạng thái thanh toán lệch với tiến trình bếp.",
    outcome: "AI đưa danh sách đơn cần xác nhận hoặc hoàn tiền, có bằng chứng trạng thái.",
    priority: "critical",
    cadence: "realtime",
    level: "ready_to_automate",
    requiredSchemas: ["recommendations"],
    requiredCapabilities: ["provider", "recommendations"],
    safetyMode: "manual_only",
    channels: ["Payments", "Orders"],
    actions: [{ id: "open-payments", label: "Mở thanh toán", href: "/dashboard/payments" }]
  },
  {
    id: "playbook-branch-health",
    domain: "branch",
    title: "So sánh sức khỏe chi nhánh",
    trigger: "Một chi nhánh yếu hơn về doanh thu, attribution, giao hàng, kho hoặc nhân sự.",
    outcome: "Chủ chuỗi biết chi nhánh nào cần xử lý trước và vì sao.",
    priority: "high",
    cadence: "daily",
    level: "manual",
    requiredSchemas: ["recommendations", "automationRuns"],
    requiredCapabilities: ["provider", "recommendations", "workflow_runs"],
    safetyMode: "manual_only",
    channels: ["AI Ops", "Analytics"],
    actions: [{ id: "open-ai-ops", label: "Mở tổng quan", href: "/dashboard" }]
  },
  {
    id: "playbook-customer-support-faq",
    domain: "support",
    title: "Hỗ trợ khách hỏi menu, giờ mở cửa và đặt bàn",
    trigger: "Khách hỏi thông tin lặp lại qua website, QR, Messenger/Zalo future.",
    outcome: "AI trả lời ngắn, đúng dữ liệu nhà hàng và chuyển người thật khi vượt phạm vi.",
    priority: "medium",
    cadence: "weekly",
    level: "manual",
    requiredSchemas: ["restaurantMemories"],
    requiredCapabilities: ["provider", "memory"],
    safetyMode: "manual_only",
    channels: ["Website", "QR", "Messenger/Zalo future"],
    actions: [{ id: "open-settings-ai", label: "Mở cài đặt AI", href: "/dashboard/settings?section=ai" }]
  }
];

function schemaLabel(schema: AiAutomationPlaybookTemplate["requiredSchemas"][number]) {
  if (schema === "automationRuns") return "workflow runs schema";
  if (schema === "restaurantMemories") return "restaurant memory schema";
  return "recommendation schema";
}

function capabilityReady(capability: AiAutomationPlaybookTemplate["requiredCapabilities"][number], input: BuildAiAutomationPlaybooksInput) {
  if (capability === "provider") return input.providerConfigured;
  if (capability === "memory") return input.schemas.restaurantMemories && (input.memoryCount ?? 0) > 0;
  if (capability === "workflow_runs") return input.schemas.automationRuns;
  return input.schemas.recommendations;
}

function capabilityBlocker(capability: AiAutomationPlaybookTemplate["requiredCapabilities"][number]) {
  if (capability === "provider") return "Chưa có provider AI configured.";
  if (capability === "memory") return "Chưa có memory nhà hàng đủ dùng cho ngữ cảnh.";
  if (capability === "workflow_runs") return "Chưa bật lưu lifecycle workflow.";
  return "Chưa bật lưu recommendation lifecycle.";
}

function matchingWorkflowCount(template: AiAutomationPlaybookTemplate, workflows: NonNullable<BuildAiAutomationPlaybooksInput["workflows"]>) {
  if (template.domain === "operations" || template.domain === "customer" || template.domain === "branch" || template.domain === "support") {
    return 0;
  }
  return workflows.filter((workflow) => workflow.domain === template.domain).length;
}

function matchingRecommendationCount(template: AiAutomationPlaybookTemplate, recommendations: NonNullable<BuildAiAutomationPlaybooksInput["recommendations"]>) {
  const domainsByType: Record<string, AiAutomationPlaybookDomain> = {
    inventory: "inventory",
    promotion: "marketing",
    combo: "customer",
    upsell: "customer",
    customer_retention: "customer",
    staffing: "staffing",
    payment: "operations",
    menu: "customer",
    pricing: "customer"
  };
  return recommendations.filter((recommendation) => domainsByType[recommendation.type] === template.domain).length;
}

function playbookStatus(blockers: string[], linkedWorkflowCount: number, linkedRecommendationCount: number): AiAutomationPlaybookStatus {
  if (blockers.length) return "blocked";
  if (linkedWorkflowCount > 0 || linkedRecommendationCount > 0) return "ready";
  return "watch";
}

function nextActionFor(status: AiAutomationPlaybookStatus, template: AiAutomationPlaybookTemplate, blockers: string[]) {
  if (status === "blocked") return blockers[0] ?? "Hoàn tất cấu hình trước khi bật playbook.";
  if (status === "ready") return template.safetyMode === "confirm_first" ? "Duyệt workflow hoặc recommendation đang mở." : "Theo dõi và xử lý từ màn vận hành liên quan.";
  return "Giữ playbook ở chế độ theo dõi cho tới khi có tín hiệu đủ mạnh.";
}

export function buildAiAutomationPlaybooks(input: BuildAiAutomationPlaybooksInput) {
  const workflows = input.workflows ?? [];
  const recommendations = input.recommendations ?? [];

  const playbooks = playbookTemplates.map<AiAutomationPlaybook>((template) => {
    const schemaBlockers = template.requiredSchemas
      .filter((schema) => !input.schemas[schema])
      .map((schema) => `Thiếu ${schemaLabel(schema)}.`);
    const capabilityBlockers = template.requiredCapabilities
      .filter((capability) => !capabilityReady(capability, input))
      .map(capabilityBlocker);
    const blockers = Array.from(new Set([...schemaBlockers, ...capabilityBlockers]));
    const linkedWorkflowCount = matchingWorkflowCount(template, workflows);
    const linkedRecommendationCount = matchingRecommendationCount(template, recommendations);
    const readyChecks = template.requiredSchemas.length + template.requiredCapabilities.length - blockers.length;
    const totalChecks = template.requiredSchemas.length + template.requiredCapabilities.length;
    const signalBonus = linkedWorkflowCount > 0 || linkedRecommendationCount > 0 ? 15 : 0;
    const readinessScore = Math.max(0, Math.min(100, Math.round((readyChecks / Math.max(1, totalChecks)) * 85 + signalBonus)));
    const status = playbookStatus(blockers, linkedWorkflowCount, linkedRecommendationCount);
    const liveSignals = [
      linkedWorkflowCount ? `${linkedWorkflowCount} workflow đang mở` : "",
      linkedRecommendationCount ? `${linkedRecommendationCount} recommendation liên quan` : "",
      input.memoryCount ? `${input.memoryCount} memory khả dụng` : ""
    ].filter(Boolean);

    return {
      ...template,
      status,
      readinessScore,
      blockers,
      liveSignals,
      linkedWorkflowCount,
      linkedRecommendationCount,
      nextAction: nextActionFor(status, template, blockers)
    };
  });

  const summary: AiAutomationPlaybookSummary = {
    total: playbooks.length,
    ready: playbooks.filter((playbook) => playbook.status === "ready").length,
    watch: playbooks.filter((playbook) => playbook.status === "watch").length,
    blocked: playbooks.filter((playbook) => playbook.status === "blocked").length,
    confirmFirst: playbooks.filter((playbook) => playbook.level === "confirm_first").length,
    readyToAutomate: playbooks.filter((playbook) => playbook.level === "ready_to_automate").length,
    criticalOpen: playbooks.filter((playbook) => playbook.priority === "critical" && playbook.status === "ready").length
  };

  return {
    generatedAt: new Date().toISOString(),
    summary,
    playbooks
  };
}
