import type { AiAgentAction } from "@/types/ai-agent";

export const ownerCopilotToolCatalog = [
  {
    name: "navigate_dashboard",
    description: "Mở đúng màn trong dashboard khi chủ quán yêu cầu điều hướng rõ ràng."
  },
  {
    name: "analyze_dashboard_area",
    description: "Đọc dữ liệu thật của quán theo intent, trả tóm tắt tình hình trước rồi kèm bước xử lý rõ ràng."
  },
  {
    name: "generate_store_setup_plan",
    description: "Tạo kế hoạch setup quán 30 phút, audit readiness hoặc lộ trình tăng trưởng."
  },
  {
    name: "generate_branding_draft",
    description: "Tạo slogan, mô tả, brand voice và prompt hình/logo an toàn."
  }
] as const;

export function normalizeAiActions(actions: AiAgentAction[] | undefined) {
  return (actions ?? []).slice(0, 5).map((action) => ({
    id: action.id,
    label: action.label,
    type: action.type,
    href: action.href,
    endpoint: action.endpoint,
    intent: action.intent,
    priority: action.priority,
    safety: action.safety,
    description: action.description
  }));
}
