import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { AiToolContext, AiToolDefinition, AiToolResult } from "./executor";

export const paymentTools = [
  {
    type: "function" as const,
    function: {
      name: "detect_payment_issue",
      description: "Phát hiện giao dịch lỗi, giao dịch chờ đối soát hoặc thanh toán chưa hoàn tất.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  }
] satisfies AiToolDefinition[];

export async function detect_payment_issue(_args: Record<string, unknown>, context: AiToolContext): Promise<AiToolResult> {
  const supabase = createAdminSupabaseClient();

  let query = supabase
    .from("orders")
    .select("id, total, status, payment_status, payment_method, created_at")
    .eq("restaurant_id", context.restaurantId)
    .in("payment_status", ["failed", "waiting_confirm", "unpaid"]);
  if (context.branchId) query = query.eq("branch_id", context.branchId);

  const { data: orders, error } = await query
    .order("created_at", { ascending: false })
    .limit(10);

  if (error || !orders) {
    return { status: "error", message: "Không thể kiểm tra giao dịch." };
  }

  const issues = orders.map((order) => ({
    orderId: order.id.slice(0, 8).toUpperCase(),
    status: order.payment_status,
    amount: order.total,
    method: order.payment_method,
    createdAt: order.created_at,
    issueType: order.payment_status === "failed" ? "transaction_failed" : "verification_needed"
  }));

  return {
    status: "success",
    issuesCount: issues.length,
    issues,
    message:
      issues.length > 0
        ? `Phát hiện ${issues.length} giao dịch cần chú ý.`
        : "Không phát hiện vấn đề thanh toán nào gần đây."
  };
}
