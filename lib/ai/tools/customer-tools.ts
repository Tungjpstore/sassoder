import type { AiAgentAction } from "@/types/ai-agent";

export const customerCopilotToolCatalog = [
  {
    name: "ask_customer_waiter",
    description: "Đọc menu thật, giỏ hàng và trạng thái đơn để trả gợi ý món hoặc bước tiếp theo."
  },
  {
    name: "open_customer_cart",
    description: "Mở giỏ hàng để khách kiểm tra món, ghi chú hoặc thanh toán."
  },
  {
    name: "call_staff_from_table",
    description: "Gọi nhân viên hỗ trợ tại bàn khi khách yêu cầu."
  },
  {
    name: "mark_customer_paid",
    description: "Đánh dấu khách đã chuyển khoản để quán vào bước xác nhận thủ công."
  },
  {
    name: "add_item_to_cart",
    description: "Thêm một món ăn hoặc đồ uống từ thực đơn vào giỏ hàng của khách hàng."
  },
  {
    name: "remove_item_from_cart",
    description: "Xóa hoặc giảm số lượng của một món ăn hoặc đồ uống trong giỏ hàng."
  },
  {
    name: "clear_cart",
    description: "Xóa toàn bộ các món trong giỏ hàng hiện tại."
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
