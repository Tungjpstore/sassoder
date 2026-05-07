import type { AiAgentAction } from "@/types/ai-agent";

export const ownerCopilotToolCatalog = [
  {
    name: "navigate_dashboard",
    description: "Mở đúng màn trong dashboard theo nghiệp vụ chủ quán đang xử lý."
  },
  {
    name: "analyze_dashboard_area",
    description: "Gọi AI backend đọc dữ liệu thật của quán theo intent rồi trả lời ngắn kèm action queue."
  },
  {
    name: "generate_setup_plan",
    description: "Tạo kế hoạch setup quán 30 phút hoặc audit readiness."
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
