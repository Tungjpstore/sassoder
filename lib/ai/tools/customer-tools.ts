import type { AiAgentAction } from "@/types/ai-agent";

export const customerCopilotToolCatalog = [
  {
    name: "search_menu",
    description: "Tìm món trong menu thật theo khẩu vị, ngân sách hoặc từ khóa khách hỏi."
  },
  {
    name: "add_recommended_item_to_cart",
    description: "Đưa món được gợi ý vào giỏ hàng qua action UI, không tự gửi đơn."
  },
  {
    name: "open_customer_flow",
    description: "Mở đúng vùng menu, giỏ, đơn, thanh toán, gọi nhân viên hoặc đặt bàn."
  },
  {
    name: "create_combo",
    description: "Tạo combo gợi ý từ menu thật và ngân sách khách đưa ra."
  }
] as const;

export function summarizeCustomerActions(actions: AiAgentAction[] | undefined) {
  return (actions ?? []).slice(0, 4).map((action) => ({
    id: action.id,
    label: action.label,
    target: action.uiTarget ?? action.href ?? action.intent,
    priority: action.priority,
    safety: action.safety,
    body: action.body
  }));
}
