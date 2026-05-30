import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { throwIfSupabaseError } from "@/lib/supabase/errors";

type TelegramActionResourceType = "order" | "reservation" | "service_request" | "staff_request" | "menu_item";

type TelegramActionResourceBranchInput = {
  restaurantId: string;
  resourceId: string;
  resourceType: TelegramActionResourceType;
};

export async function getTelegramActionResourceBranchId(input: TelegramActionResourceBranchInput) {
  const supabase = createAdminSupabaseClient() as any;

  if (input.resourceType === "order") {
    const { data, error } = await supabase
      .from("orders")
      .select("branch_id")
      .eq("id", input.resourceId)
      .eq("restaurant_id", input.restaurantId)
      .maybeSingle();
    throwIfSupabaseError(error);
    return data?.branch_id ?? null;
  }

  if (input.resourceType === "service_request") {
    const { data, error } = await supabase
      .from("service_requests")
      .select("table:tables(branch_id)")
      .eq("id", input.resourceId)
      .eq("restaurant_id", input.restaurantId)
      .maybeSingle();
    throwIfSupabaseError(error);
    return nestedBranchId(data?.table);
  }

  if (input.resourceType === "reservation") {
    const { data, error } = await supabase
      .from("reservation_table_locks")
      .select("table:tables(branch_id)")
      .eq("reservation_id", input.resourceId)
      .eq("restaurant_id", input.restaurantId)
      .eq("status", "active")
      .limit(1);
    throwIfSupabaseError(error);
    return nestedBranchId(data?.[0]?.table);
  }

  if (input.resourceType === "staff_request") {
    const { data, error } = await supabase
      .from("attendance_approval_requests")
      .select("branch_id")
      .eq("id", input.resourceId)
      .eq("restaurant_id", input.restaurantId)
      .maybeSingle();
    throwIfSupabaseError(error);
    return data?.branch_id ?? null;
  }

  return null;
}

function nestedBranchId(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const branchId = (row as { branch_id?: unknown }).branch_id;
  return typeof branchId === "string" && branchId.trim() ? branchId.trim() : null;
}
