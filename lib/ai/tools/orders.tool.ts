import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { AiToolContext, AiToolDefinition, AiToolResult } from "./executor";

export const orderTools = [
  {
    type: "function" as const,
    function: {
      name: "summarize_sales",
      description: "Tóm tắt doanh thu và số lượng đơn hàng theo thời gian cho chủ quán.",
      parameters: {
        type: "object",
        properties: {
          timeRange: {
            type: "string",
            enum: ["today", "yesterday", "this_week", "this_month"],
            description: "Khoảng thời gian cần báo cáo"
          }
        },
        required: ["timeRange"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "analyze_peak_hour",
      description: "Phân tích giờ cao điểm của quán dựa trên lịch sử order 30 ngày gần nhất.",
      parameters: {
        type: "object",
        properties: {
          dayOfWeek: {
            type: "string",
            description: "Ngày trong tuần, mặc định là all.",
            default: "all"
          }
        },
        required: []
      }
    }
  }
] satisfies AiToolDefinition[];

function getDateRange(timeRange: string) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (timeRange === "yesterday") {
    start.setDate(now.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    end.setDate(now.getDate() - 1);
    end.setHours(23, 59, 59, 999);
  } else if (timeRange === "this_week") {
    const day = now.getDay() || 7;
    start.setDate(now.getDate() - day + 1);
    start.setHours(0, 0, 0, 0);
  } else if (timeRange === "this_month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setHours(0, 0, 0, 0);
  }

  return { start: start.toISOString(), end: end.toISOString() };
}

export async function summarize_sales(args: Record<string, unknown>, context: AiToolContext): Promise<AiToolResult> {
  const supabase = createAdminSupabaseClient();
  const timeRange = typeof args.timeRange === "string" ? args.timeRange : "today";
  const { start, end } = getDateRange(timeRange);

  const { data: orders, error } = await supabase
    .from("orders")
    .select("total, status, payment_status")
    .eq("restaurant_id", context.restaurantId)
    .gte("created_at", start)
    .lte("created_at", end);

  if (error) {
    return { status: "error", message: "Không thể lấy dữ liệu đơn hàng." };
  }

  const validOrders = orders || [];
  const totalOrders = validOrders.length;
  const paidOrders = validOrders.filter((order) => order.status === "completed" || order.payment_status === "paid" || order.status === "paid");
  const totalRevenue = paidOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);

  return {
    status: "success",
    timeRange,
    totalOrders,
    paidOrders: paidOrders.length,
    totalRevenue,
    message: `Thống kê ${timeRange}: ${totalOrders} đơn, ${paidOrders.length} đơn đã thanh toán, doanh thu ${totalRevenue.toLocaleString("vi-VN")}đ.`
  };
}

export async function analyze_peak_hour(_args: Record<string, unknown>, context: AiToolContext): Promise<AiToolResult> {
  const supabase = createAdminSupabaseClient();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: orders, error } = await supabase
    .from("orders")
    .select("created_at")
    .eq("restaurant_id", context.restaurantId)
    .gte("created_at", thirtyDaysAgo.toISOString());

  if (error || !orders || orders.length === 0) {
    return { status: "error", message: "Chưa có đủ dữ liệu để phân tích giờ cao điểm." };
  }

  const hourCounts: Record<number, number> = {};

  orders.forEach((order) => {
    if (!order.created_at) return;
    const hour = new Date(order.created_at).getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  });

  let peakHour = 0;
  let maxOrders = 0;

  Object.entries(hourCounts).forEach(([hour, count]) => {
    if (count > maxOrders) {
      maxOrders = count;
      peakHour = Number(hour);
    }
  });

  const avgOrdersPerDay = Math.max(1, Math.round(maxOrders / 30));

  return {
    status: "success",
    peakHour: `${peakHour}:00 - ${peakHour + 1}:00`,
    avgOrdersPerDay,
    message: `Giờ cao điểm là ${peakHour}:00 - ${peakHour + 1}:00, trung bình khoảng ${avgOrdersPerDay} đơn/ngày trong 30 ngày gần nhất.`
  };
}
