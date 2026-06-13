import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { monthStartIso } from "@/services/billing/billing-utils";

export type MenuAiUsage = {
  used: number;
  limit: number | null; // null = không giới hạn
};

export type MenuAiUsageSummary = {
  image: MenuAiUsage;
  ocr: MenuAiUsage;
};

/* Đếm số lượt AI đã dùng trong tháng (theo ai_usage_logs status=success) cho các
 * tính năng menu, để UI hiển thị bộ đếm "đã dùng / hạn mức". Lỗi schema (bảng
 * chưa có) sẽ trả used=0 thay vì ném lỗi để không chặn trang menu. */
export async function getMenuAiUsageSummary({
  restaurantId,
  imageLimit,
  ocrLimit
}: {
  restaurantId: string;
  imageLimit: number | null;
  ocrLimit: number | null;
}): Promise<MenuAiUsageSummary> {
  const supabase = createAdminSupabaseClient() as ReturnType<typeof createAdminSupabaseClient>;
  const since = monthStartIso();

  async function countFeature(featureKey: string): Promise<number> {
    try {
      const { count, error } = await supabase
        .from("ai_usage_logs")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurantId)
        .eq("feature_key", featureKey)
        .eq("status", "success")
        .gte("created_at", since);
      if (error) return 0;
      return Number(count ?? 0);
    } catch {
      return 0;
    }
  }

  const [imageUsed, ocrUsed] = await Promise.all([
    countFeature("ai_image_generation"),
    countFeature("ai_menu_ocr")
  ]);

  return {
    image: { used: imageUsed, limit: imageLimit },
    ocr: { used: ocrUsed, limit: ocrLimit }
  };
}
