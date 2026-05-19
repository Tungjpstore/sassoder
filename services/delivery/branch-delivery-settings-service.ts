import { AppError } from "@/lib/response";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { listStoreBranchesForManagement } from "@/services/branch-service";
import type { Database } from "@/types/supabase";

type StoreBranchRow = Database["public"]["Tables"]["store_branches"]["Row"];

export type BranchDeliverySettings = Pick<
  StoreBranchRow,
  | "id"
  | "name"
  | "address"
  | "is_primary"
  | "is_active"
  | "delivery_radius_km"
  | "free_delivery_radius_km"
  | "delivery_base_fee"
  | "delivery_fee_per_km"
  | "pickup_eta_minutes"
  | "delivery_eta_minutes"
  | "accepting_delivery"
  | "delivery_paused"
  | "temporarily_closed"
  | "delivery_opening_time"
  | "delivery_closing_time"
  | "delivery_availability_note"
>;

const branchDeliverySelect =
  "id,name,address,is_primary,is_active,delivery_radius_km,free_delivery_radius_km,delivery_base_fee,delivery_fee_per_km,pickup_eta_minutes,delivery_eta_minutes,accepting_delivery,delivery_paused,temporarily_closed,delivery_opening_time,delivery_closing_time,delivery_availability_note";

export async function listDeliveryBranchSettings(restaurantId: string): Promise<BranchDeliverySettings[]> {
  return listStoreBranchesForManagement(restaurantId) as Promise<BranchDeliverySettings[]>;
}

export async function updateDeliveryBranchAvailability(
  restaurantId: string,
  input: {
    branchId: string;
    acceptingDelivery: boolean;
    deliveryPaused: boolean;
    temporarilyClosed: boolean;
    deliveryOpeningTime?: string | null;
    deliveryClosingTime?: string | null;
    deliveryAvailabilityNote?: string | null;
  }
) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("store_branches")
    .update({
      accepting_delivery: input.acceptingDelivery,
      delivery_paused: input.deliveryPaused,
      temporarily_closed: input.temporarilyClosed,
      delivery_opening_time: input.deliveryOpeningTime || null,
      delivery_closing_time: input.deliveryClosingTime || null,
      delivery_availability_note: input.deliveryAvailabilityNote?.trim() || null
    })
    .eq("id", input.branchId)
    .eq("restaurant_id", restaurantId)
    .select(branchDeliverySelect)
    .maybeSingle();

  throwIfSupabaseError(error);
  if (!data) throw new AppError("Không tìm thấy chi nhánh để cập nhật giao hàng.", 404);
  return data as BranchDeliverySettings;
}
