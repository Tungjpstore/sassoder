import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { AiToolContext, AiToolDefinition, AiToolResult } from "./executor";

export const customerTools = [
  {
    type: "function" as const,
    function: {
      name: "create_combo",
      description: "Tạo combo gợi ý từ menu dựa trên ngân sách và số người.",
      parameters: {
        type: "object",
        properties: {
          budget: {
            type: "number",
            description: "Số tiền tối đa cho combo (VND)"
          },
          peopleCount: {
            type: "number",
            description: "Số người ăn/uống",
            default: 1
          }
        },
        required: ["budget"]
      }
    }
  }
] satisfies AiToolDefinition[];

type ComboMenuItem = {
  id: string;
  name: string;
  price: number;
  category_id: string | null;
  image_url: string | null;
  category: { name: string } | { name: string }[] | null;
};

function categoryName(category: ComboMenuItem["category"]) {
  return Array.isArray(category) ? category[0]?.name ?? null : category?.name ?? null;
}

export async function create_combo(args: Record<string, unknown>, context: AiToolContext): Promise<AiToolResult> {
  const supabase = createAdminSupabaseClient();
  const budget = Math.max(Number(args.budget ?? 0), 0);
  const peopleCount = Math.min(Math.max(Number(args.peopleCount ?? 1), 1), 12);

  if (budget <= 0) {
    return { status: "failed", message: "Cần ngân sách hợp lệ để tạo combo." };
  }

  const { data: menuItems, error } = await supabase
    .from("menu_items")
    .select("id, name, price, category_id, image_url, category:menu_categories(name)")
    .eq("restaurant_id", context.restaurantId)
    .eq("is_available", true);

  if (error || !menuItems || menuItems.length === 0) {
    return { status: "error", message: "Không thể lấy menu để tạo combo." };
  }

  let currentTotal = 0;
  const comboItems: Array<{
    id: string;
    name: string;
    price: number;
    categoryId: string | null;
    categoryName: string | null;
    image: string | null;
  }> = [];
  const sortedMenu = (menuItems as unknown as ComboMenuItem[])
    .map((item) => ({
      ...item,
      categoryName: categoryName(item.category)
    }))
    .sort((a, b) => Number(a.price || 0) - Number(b.price || 0));

  for (const item of sortedMenu) {
    const itemPrice = Number(item.price || 0);
    if (itemPrice > 0 && currentTotal + itemPrice <= budget) {
      comboItems.push({
        id: item.id,
        name: item.name,
        price: itemPrice,
        categoryId: item.category_id,
        categoryName: item.categoryName,
        image: item.image_url
      });
      currentTotal += itemPrice;
    }
    if (comboItems.length >= peopleCount * 3) break;
  }

  if (comboItems.length === 0) {
    return { status: "failed", message: `Ngân sách ${budget.toLocaleString("vi-VN")}đ quá thấp, chưa tìm được món phù hợp.` };
  }

  return {
    status: "success",
    comboName: `Combo gợi ý cho ${peopleCount} người`,
    totalPrice: currentTotal,
    items: comboItems,
    message: `Đã tạo combo ${comboItems.length} món, tổng ${currentTotal.toLocaleString("vi-VN")}đ trong ngân sách ${budget.toLocaleString("vi-VN")}đ.`
  };
}
