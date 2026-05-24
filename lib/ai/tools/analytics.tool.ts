import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { AiToolContext, AiToolDefinition, AiToolResult } from "./executor";

export const analyticsTools = [
  {
    type: "function" as const,
    function: {
      name: "generate_campaign",
      description: "Gợi ý chiến dịch khuyến mãi dựa trên mục tiêu kinh doanh và khuyến mãi đang chạy.",
      parameters: {
        type: "object",
        properties: {
          goal: {
            type: "string",
            enum: ["increase_revenue", "clear_inventory", "acquire_new_customers"],
            description: "Mục tiêu của chiến dịch"
          }
        },
        required: ["goal"]
      }
    }
  }
] satisfies AiToolDefinition[];

export async function generate_campaign(args: Record<string, unknown>, context: AiToolContext): Promise<AiToolResult> {
  const supabase = createAdminSupabaseClient();
  const goal = typeof args.goal === "string" ? args.goal : "increase_revenue";

  const { data: currentPromos } = await supabase
    .from("promotions")
    .select("name, discount_type, discount_value")
    .eq("restaurant_id", context.restaurantId)
    .eq("is_active", true);

  const existingDiscounts = currentPromos?.map((promotion) => promotion.discount_value) || [];
  let suggestedCampaign: Record<string, unknown>;

  if (goal === "increase_revenue") {
    const value = existingDiscounts.includes(15) ? 20 : 15;
    suggestedCampaign = {
      title: `Giảm ${value}% cho đơn hàng trên 300k`,
      discountType: "percentage",
      discountValue: value,
      minOrderAmount: 300000,
      targetAudience: "Tất cả khách hàng",
      estimatedImpact: "Tăng giá trị trung bình mỗi đơn"
    };
  } else if (goal === "acquire_new_customers") {
    suggestedCampaign = {
      title: "Ưu đãi khách mới",
      discountType: "fixed",
      discountValue: 20000,
      targetAudience: "Khách hàng mua lần đầu",
      estimatedImpact: "Tăng chuyển đổi khách mới trong tuần"
    };
  } else {
    suggestedCampaign = {
      title: "Giờ vàng xả tồn",
      discountType: "percentage",
      discountValue: 20,
      targetAudience: "Khách mua mang đi hoặc giao hàng",
      estimatedImpact: "Đẩy món tồn vào khung giờ thấp điểm"
    };
  }

  return {
    status: "success",
    suggestedCampaign,
    activePromotionsCount: currentPromos?.length || 0,
    message: `Đã tạo gợi ý chiến dịch cho mục tiêu ${goal}, đối chiếu với ${currentPromos?.length || 0} khuyến mãi đang chạy.`
  };
}
