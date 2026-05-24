export type HourlySalesPoint = {
  label: string;
  revenue: number;
  orderCount: number;
};

export type AiSalesForecast = {
  generatedAt: string;
  observedRevenue: number;
  observedOrders: number;
  projectedRevenue: number;
  projectedOrders: number;
  averageTicket: number;
  confidence: "high" | "medium" | "low";
  trend: "ahead" | "normal" | "behind";
  summary: string;
  actions: string[];
};

function asNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function hourFromLabel(label: string) {
  const hour = Number(label.slice(0, 2));
  return Number.isFinite(hour) ? hour : null;
}

function formatVnd(value: number) {
  return `${Math.max(0, Math.round(value)).toLocaleString("vi-VN")}đ`;
}

export function buildAiSalesForecast(input: {
  hourlyRevenueToday: HourlySalesPoint[];
  targetRevenue?: number | null;
  now?: Date;
}): AiSalesForecast {
  const now = input.now ?? new Date();
  const currentHour = now.getHours();
  const observedPoints = input.hourlyRevenueToday.filter((point) => {
    const hour = hourFromLabel(point.label);
    return hour !== null && hour <= currentHour;
  });
  const schedulePoints = input.hourlyRevenueToday.length ? input.hourlyRevenueToday : observedPoints;
  const observedRevenue = observedPoints.reduce((sum, point) => sum + asNumber(point.revenue), 0);
  const observedOrders = observedPoints.reduce((sum, point) => sum + asNumber(point.orderCount), 0);
  const observedSlots = Math.max(1, observedPoints.filter((point) => asNumber(point.revenue) > 0 || asNumber(point.orderCount) > 0).length || observedPoints.length);
  const remainingSlots = Math.max(0, schedulePoints.length - observedPoints.length);
  const revenuePerSlot = observedRevenue / observedSlots;
  const ordersPerSlot = observedOrders / observedSlots;
  const projectedRevenue = Math.round(observedRevenue + revenuePerSlot * remainingSlots);
  const projectedOrders = Math.round(observedOrders + ordersPerSlot * remainingSlots);
  const targetRevenue = asNumber(input.targetRevenue);
  const averageTicket = observedOrders > 0 ? Math.round(observedRevenue / observedOrders) : 0;
  const targetRatio = targetRevenue > 0 ? projectedRevenue / targetRevenue : 1;
  const trend = targetRevenue > 0 && targetRatio < 0.85 ? "behind" : targetRevenue > 0 && targetRatio > 1.08 ? "ahead" : "normal";
  const confidence = observedOrders >= 20 ? "high" : observedOrders >= 6 ? "medium" : "low";
  const actions =
    trend === "behind"
      ? ["Đẩy combo hoặc ưu đãi khung thấp điểm.", "Kiểm tra món bán chạy còn đủ hàng.", "Nhắc nhân viên upsell topping/size trong ca tới."]
      : trend === "ahead"
        ? ["Giữ staffing giờ cao điểm.", "Kiểm tra tồn nguyên liệu bán chạy.", "Hạn chế giảm giá sâu khi nhu cầu đang tốt."]
        : ["Theo dõi thêm sau mỗi ca.", "Ưu tiên xác nhận thanh toán treo.", "Giữ combo nhẹ cho khung vắng khách."];

  return {
    generatedAt: now.toISOString(),
    observedRevenue,
    observedOrders,
    projectedRevenue,
    projectedOrders,
    averageTicket,
    confidence,
    trend,
    summary:
      targetRevenue > 0
        ? `Dự báo cuối ngày ${formatVnd(projectedRevenue)} (${Math.round(targetRatio * 100)}% mục tiêu).`
        : `Dự báo cuối ngày ${formatVnd(projectedRevenue)} từ ${observedOrders} đơn đã ghi nhận.`,
    actions
  };
}
