import type { PostgrestError } from "@supabase/supabase-js";
import { AppError } from "@/lib/response";

export function throwIfSupabaseError(error: PostgrestError | null, fallback = "Không thực hiện được truy vấn dữ liệu") {
  if (error) {
    throw new AppError(error.message || fallback, 400);
  }
}
