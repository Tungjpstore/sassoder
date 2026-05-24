import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { createPublicTenantAdminClient } from "@/services/public-tenant-admin-boundary";
import { invalidateRestaurantDashboardCache } from "@/services/restaurant-service";
import { assertFeatureEntitlement } from "@/services/subscription-service";
import { getPublicTable } from "@/services/table-service";
import { assertPublicTenantActive } from "@/services/tenant-status-guard";
import type { ServiceRequestDto, ServiceRequestStatus } from "@/types/domain";

type RawServiceRequest = {
  id: string;
  restaurant_id: string;
  table_id: string | null;
  customer_session_id: string | null;
  type: "CALL_STAFF";
  status: ServiceRequestStatus;
  message: string | null;
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  table: { name: string } | { name: string }[] | null;
};

function firstOrNull<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function mapServiceRequest(row: RawServiceRequest): ServiceRequestDto {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    tableId: row.table_id,
    tableName: firstOrNull(row.table)?.name ?? null,
    customerSessionId: row.customer_session_id,
    type: row.type,
    status: row.status,
    message: row.message,
    createdAt: row.created_at,
    acknowledgedAt: row.acknowledged_at,
    resolvedAt: row.resolved_at
  };
}

const serviceRequestSelect =
  "id,restaurant_id,table_id,customer_session_id,type,status,message,created_at,acknowledged_at,resolved_at,table:tables(name)";

export async function createCustomerServiceRequest(input: {
  restaurantSlug: string;
  tableId: string;
  tableAccessToken?: string;
  customerSessionId?: string;
  message?: string;
}) {
  const supabase = createPublicTenantAdminClient("service_request_create");
  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("id,allow_legacy_qr,platform_status,deleted_at")
    .eq("slug", input.restaurantSlug)
    .single();

  throwIfSupabaseError(restaurantError);
  if (!restaurant) throw new AppError("Không tìm thấy quán", 404);
  assertPublicTenantActive(restaurant);
  await assertFeatureEntitlement(restaurant.id, "staff_call");

  const table = await getPublicTable(restaurant.id, input.tableId, input.tableAccessToken, {
    allowLegacyQr: restaurant.allow_legacy_qr
  });
  if (!table) throw new AppError("Không tìm thấy bàn hoặc mã QR đã hết hiệu lực. Vui lòng quét lại mã tại bàn.", 403);

  if (input.customerSessionId) {
    const since = new Date(Date.now() - 90_000).toISOString();
    const { data: recent, error: recentError } = await supabase
      .from("service_requests")
      .select(serviceRequestSelect)
      .eq("restaurant_id", restaurant.id)
      .eq("table_id", table.id)
      .eq("customer_session_id", input.customerSessionId)
      .in("status", ["open", "acknowledged"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    throwIfSupabaseError(recentError);
    if (recent) return mapServiceRequest(recent as unknown as RawServiceRequest);
  }

  const { data, error } = await supabase
    .from("service_requests")
    .insert({
      restaurant_id: restaurant.id,
      table_id: table.id,
      customer_session_id: input.customerSessionId || null,
      message: input.message?.trim() || null
    })
    .select(serviceRequestSelect)
    .single();

  throwIfSupabaseError(error);
  if (!data) throw new AppError("Không gửi được yêu cầu gọi nhân viên", 400);
  invalidateRestaurantDashboardCache(restaurant.id);
  return mapServiceRequest(data as unknown as RawServiceRequest);
}

export async function listOpenServiceRequests(restaurantId: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("service_requests")
    .select(serviceRequestSelect)
    .eq("restaurant_id", restaurantId)
    .in("status", ["open", "acknowledged"])
    .order("created_at", { ascending: false })
    .limit(50);

  throwIfSupabaseError(error);
  return (data ?? []).map((row) => mapServiceRequest(row as unknown as RawServiceRequest));
}

export async function resolveServiceRequest(restaurantId: string, requestId: string) {
  const supabase = createAdminSupabaseClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("service_requests")
    .update({ status: "resolved", acknowledged_at: now, resolved_at: now })
    .eq("id", requestId)
    .eq("restaurant_id", restaurantId)
    .select(serviceRequestSelect)
    .single();

  throwIfSupabaseError(error);
  if (!data) throw new AppError("Không tìm thấy yêu cầu hỗ trợ", 404);
  invalidateRestaurantDashboardCache(restaurantId);
  return mapServiceRequest(data as unknown as RawServiceRequest);
}
