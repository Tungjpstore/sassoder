import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { AiToolContext, AiToolDefinition, AiToolResult } from "./executor";

export const menuTools = [
  {
    type: "function" as const,
    function: {
      name: "search_menu",
      description: "Tìm món trong menu theo tên và danh mục.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Từ khóa tìm món"
          },
          category: {
            type: "string",
            description: "Tên danh mục cần lọc"
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "find_best_seller",
      description: "Tìm top món bán chạy từ các đơn đã thanh toán hoặc hoàn tất.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Số món cần lấy, tối đa 10",
            default: 5
          }
        },
        required: []
      }
    }
  }
] satisfies AiToolDefinition[];

type MenuSearchRow = {
  id: string;
  name: string;
  price: number;
  category_id: string | null;
  image_url: string | null;
  is_available: boolean;
  category: { name: string } | { name: string }[] | null;
};

type OrderWithItemsRow = {
  items?: Array<{
    quantity: number | null;
    menuItem?: { id: string; name: string; price: number | null } | { id: string; name: string; price: number | null }[] | null;
  }> | null;
};

function firstCategoryName(category: MenuSearchRow["category"]) {
  return Array.isArray(category) ? category[0]?.name ?? null : category?.name ?? null;
}

export async function search_menu(args: Record<string, unknown>, context: AiToolContext): Promise<AiToolResult> {
  const supabase = createAdminSupabaseClient();
  const rawQuery = typeof args.query === "string" ? args.query.trim() : "";
  const category = typeof args.category === "string" ? args.category.trim().toLowerCase() : "";

  if (rawQuery.length < 2) {
    return { status: "failed", message: "Cần ít nhất 2 ký tự để tìm món." };
  }

  const { data: items, error } = await supabase
    .from("menu_items")
    .select("id, name, price, category_id, image_url, is_available, category:menu_categories(name)")
    .eq("restaurant_id", context.restaurantId)
    .ilike("name", `%${rawQuery.slice(0, 80)}%`)
    .limit(20);

  if (error || !items) {
    return { status: "error", message: "Không thể tìm kiếm menu." };
  }

  let results = (items as unknown as MenuSearchRow[]).map((item) => ({
    id: item.id,
    name: item.name,
    price: item.price,
    categoryId: item.category_id,
    image: item.image_url,
    isAvailable: item.is_available,
    categoryName: firstCategoryName(item.category)
  }));

  if (category) {
    results = results.filter((result) => result.categoryName?.toLowerCase().includes(category));
  }

  return {
    status: "success",
    results: results.slice(0, 10),
    message: `Tìm thấy ${results.length} món phù hợp với "${rawQuery}".`
  };
}

export async function find_best_seller(args: Record<string, unknown>, context: AiToolContext): Promise<AiToolResult> {
  const supabase = createAdminSupabaseClient();
  const limit = Math.min(Math.max(Number(args.limit ?? 5), 1), 10);

  let query = supabase
    .from("orders")
    .select("items:order_items(quantity,menuItem:menu_items(id,name,price))")
    .eq("restaurant_id", context.restaurantId)
    .in("status", ["paid", "completed"]);
  if (context.branchId) query = query.eq("branch_id", context.branchId);

  const { data: orders, error } = await query
    .order("created_at", { ascending: false })
    .limit(500);

  if (error || !orders) {
    return { status: "error", message: "Không thể thống kê món bán chạy." };
  }

  const salesCount: Record<string, { name: string; count: number; revenue: number }> = {};

  (orders as unknown as OrderWithItemsRow[]).forEach((order) => {
    order.items?.forEach((item) => {
      const menuItem = Array.isArray(item.menuItem) ? item.menuItem[0] : item.menuItem;
      if (!menuItem?.id) return;
      const quantity = Number(item.quantity || 1);

      if (!salesCount[menuItem.id]) {
        salesCount[menuItem.id] = { name: menuItem.name, count: 0, revenue: 0 };
      }

      salesCount[menuItem.id].count += quantity;
      salesCount[menuItem.id].revenue += quantity * Number(menuItem.price || 0);
    });
  });

  const bestSellers = Object.entries(salesCount)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, limit)
    .map(([id, item], index) => ({ id, rank: index + 1, name: item.name, totalSold: item.count, revenue: item.revenue }));

  return {
    status: "success",
    bestSellers,
    message: bestSellers.length ? `Top ${bestSellers.length} món bán chạy đã sẵn sàng.` : "Chưa có dữ liệu món bán chạy từ đơn đã thanh toán."
  };
}
