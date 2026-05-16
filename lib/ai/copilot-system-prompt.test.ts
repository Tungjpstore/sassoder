import assert from "node:assert/strict";
import test from "node:test";
import { buildCopilotSystemInstructions } from "@/lib/ai/prompts/copilot-system";

test("dashboard Copilot prompt forces navigation and operational commands into tools", () => {
  const instructions = buildCopilotSystemInstructions("dashboard");

  assert.match(instructions, /Mỗi tin nhắn mới của người dùng là một lượt hội thoại mới/);
  assert.match(instructions, /mở\/vào\/xem\/chạy\/xử lý\/tạo\/quét\/thêm\/lưu/);
  assert.match(instructions, /Contract thương mại/);
  assert.match(instructions, /trả lời trực tiếp câu hỏi trước/);
  assert.match(instructions, /1 hành động chính/);
  assert.match(instructions, /Không khoe nền tảng/);
  assert.match(instructions, /card\/action gần nhất/);
  assert.match(instructions, /Không mở đầu bằng nút\/action/);
  assert.match(instructions, /navigate_dashboard/);
  assert.match(instructions, /Không trả lời bằng text thường/);
  assert.match(instructions, /tóm tắt tình hình trước/);
  assert.match(instructions, /analyze_dashboard_area hoặc answer_owner_request/);
  assert.match(instructions, /Không trả prose đơn lẻ/);
});

test("customer Copilot prompt still routes free-form customer questions into customer tools", () => {
  const instructions = buildCopilotSystemInstructions("customer");

  assert.match(instructions, /answer_customer_request/);
  assert.match(instructions, /continue_customer_ordering/);
  assert.match(instructions, /ask_customer_waiter/);
  assert.match(instructions, /Mỗi tin nhắn mới của người dùng là một lượt hội thoại mới/);
});
