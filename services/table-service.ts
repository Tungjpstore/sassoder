import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/response";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { OrderStatus } from "@/types/domain";

export type RestaurantTable = {
  id: string;
  restaurant_id: string;
  name: string;
  area: string;
  capacity: number;
  qr_enabled: boolean;
  table_area_id?: string | null;
  floor_label?: string | null;
  seating_zone?: "indoor" | "outdoor" | "mixed";
  table_kind?: "standard" | "vip" | "bar" | "community";
  reservation_priority?: number;
  is_bookable?: boolean;
  is_hidden?: boolean;
  is_under_maintenance?: boolean;
  qr_token_version?: number;
  qr_token_enforced?: boolean;
  qr_token_rotated_at?: string | null;
  qr_token?: string;
};

export type TableOperationalStatus = "available" | "needs_confirm" | "serving" | "overdue" | "awaiting_payment";

export type RestaurantTableWithStatus = RestaurantTable & {
  status: TableOperationalStatus;
  activeOrderCount: number;
  unpaidTotal: number;
  overdueCount: number;
  oldestOrderAt: string | null;
  nextServiceDueAt: string | null;
};

export async function listTables(restaurantId: string) {
  const supabase = (await createServerSupabaseClient()) as any;
  const { data, error } = await supabase
    .from("tables")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("name", { ascending: true });

  throwIfSupabaseError(error);
  return (data ?? []) as RestaurantTable[];
}

type TableOrderRow = {
  id: string;
  table_id: string | null;
  status: OrderStatus;
  total: number;
  created_at: string;
  service_due_at: string | null;
};

const activeTableStatuses: OrderStatus[] = ["pending", "ordering", "completed", "waiting_payment", "waiting_confirm"];

function tableQrSecret() {
  return (
    process.env.TABLE_QR_ACCESS_SECRET?.trim() ||
    process.env.PLATFORM_ADMIN_SESSION_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "logivn-local-table-qr-access"
  );
}

export function buildTableQrAccessToken(table: Pick<RestaurantTable, "id" | "restaurant_id" | "qr_token_version">) {
  return createHmac("sha256", tableQrSecret())
    .update(`${table.restaurant_id}:${table.id}:${table.qr_token_version ?? 1}`)
    .digest("hex")
    .slice(0, 40);
}

function safeEqualToken(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function withQrToken<T extends RestaurantTable>(table: T): T {
  return {
    ...table,
    qr_token: buildTableQrAccessToken(table)
  };
}

export function isValidTableQrAccess(table: RestaurantTable, token?: string | null) {
  if (!table.qr_token_enforced) return true;
  if (!token || !/^[a-f0-9]{40}$/i.test(token)) return false;
  return safeEqualToken(token.toLowerCase(), buildTableQrAccessToken(table));
}

export function assertTableQrAccess(table: RestaurantTable, token?: string | null) {
  if (!table.qr_enabled) {
    throw new AppError("QR của bàn này đang tắt. Vui lòng gọi nhân viên để được hỗ trợ.", 403);
  }

  if (!isValidTableQrAccess(table, token)) {
    throw new AppError("Mã QR của bàn này đã được làm mới. Vui lòng quét lại mã QR tại bàn.", 403);
  }
}

function getTableStatus(orders: TableOrderRow[]): TableOperationalStatus {
  const now = Date.now();
  if (orders.some((order) => ["pending", "ordering"].includes(order.status) && order.service_due_at && new Date(order.service_due_at).getTime() < now)) {
    return "overdue";
  }
  if (orders.some((order) => order.status === "pending")) return "needs_confirm";
  if (orders.some((order) => order.status === "ordering")) return "serving";
  if (orders.some((order) => ["completed", "waiting_payment", "waiting_confirm"].includes(order.status))) return "awaiting_payment";
  return "available";
}

export async function listTablesWithStatus(restaurantId: string): Promise<RestaurantTableWithStatus[]> {
  const supabase = (await createServerSupabaseClient()) as any;
  const [tablesResult, ordersResult] = await Promise.all([
    supabase.from("tables").select("*").eq("restaurant_id", restaurantId).order("name", { ascending: true }),
    supabase
      .from("orders")
      .select("id,table_id,status,total,created_at,service_due_at")
      .eq("restaurant_id", restaurantId)
      .in("status", activeTableStatuses)
      .order("created_at", { ascending: true })
  ]);

  throwIfSupabaseError(tablesResult.error);
  throwIfSupabaseError(ordersResult.error);

  const ordersByTable = new Map<string, TableOrderRow[]>();
  for (const order of (ordersResult.data ?? []) as TableOrderRow[]) {
    if (!order.table_id) continue;
    const list = ordersByTable.get(order.table_id) ?? [];
    list.push(order);
    ordersByTable.set(order.table_id, list);
  }

  const now = Date.now();
  return ((tablesResult.data ?? []) as RestaurantTable[]).map((table) => {
    const tableOrders = ordersByTable.get(table.id) ?? [];
    const dueDates = tableOrders
      .map((order) => order.service_due_at)
      .filter((value): value is string => Boolean(value))
      .sort();

    return {
      ...withQrToken(table),
      status: getTableStatus(tableOrders),
      activeOrderCount: tableOrders.length,
      unpaidTotal: tableOrders.reduce((sum, order) => sum + order.total, 0),
      overdueCount: tableOrders.filter(
        (order) => ["pending", "ordering"].includes(order.status) && order.service_due_at && new Date(order.service_due_at).getTime() < now
      ).length,
      oldestOrderAt: tableOrders[0]?.created_at ?? null,
      nextServiceDueAt: dueDates[0] ?? null
    };
  });
}

export async function getPublicTable(restaurantId: string, tableId: string, accessToken?: string | null) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("tables")
    .select("*")
    .eq("id", tableId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  throwIfSupabaseError(error);
  const table = data as RestaurantTable | null;
  if (!table) return null;
  try {
    assertTableQrAccess(table, accessToken);
  } catch {
    return null;
  }
  return withQrToken(table);
}

export async function createTable(
  restaurantId: string,
  _restaurantSlug: string,
  input: {
    name: string;
    area?: string;
    capacity?: number;
    floorLabel?: string;
    seatingZone?: "indoor" | "outdoor" | "mixed";
    tableKind?: "standard" | "vip" | "bar" | "community";
    reservationPriority?: number;
    isBookable?: boolean;
    isHidden?: boolean;
    isUnderMaintenance?: boolean;
  }
) {
  const supabase = (await createServerSupabaseClient()) as any;
  const { data, error } = await supabase
    .from("tables")
    .insert({
      restaurant_id: restaurantId,
      name: input.name,
      area: input.area || "Khu chính",
      capacity: input.capacity ?? 4,
      floor_label: input.floorLabel || "Tầng trệt",
      seating_zone: input.seatingZone ?? "indoor",
      table_kind: input.tableKind ?? "standard",
      reservation_priority: input.reservationPriority ?? 100,
      is_bookable: input.isBookable ?? true,
      is_hidden: input.isHidden ?? false,
      is_under_maintenance: input.isUnderMaintenance ?? false
    })
    .select()
    .single();

  throwIfSupabaseError(error);
  return data as RestaurantTable;
}

export async function rotateTableQrToken(restaurantId: string, tableId: string) {
  const supabase = createAdminSupabaseClient() as any;
  const { data: current, error: currentError } = await supabase
    .from("tables")
    .select("*")
    .eq("id", tableId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  throwIfSupabaseError(currentError);
  if (!current) throw new AppError("Không tìm thấy bàn cần xoay mã QR", 404);

  const { data: updated, error: updateError } = await supabase
    .from("tables")
    .update({
      qr_token_version: Number(current.qr_token_version ?? 1) + 1,
      qr_token_enforced: true,
      qr_token_rotated_at: new Date().toISOString()
    })
    .eq("id", tableId)
    .eq("restaurant_id", restaurantId)
    .select()
    .single();

  throwIfSupabaseError(updateError);
  return withQrToken(updated as RestaurantTable);
}

export async function updateTable(
  restaurantId: string,
  input: {
    tableId: string;
    name: string;
    area?: string;
    capacity?: number;
    floorLabel?: string;
    seatingZone?: "indoor" | "outdoor" | "mixed";
    tableKind?: "standard" | "vip" | "bar" | "community";
    reservationPriority?: number;
    isBookable?: boolean;
    isHidden?: boolean;
    isUnderMaintenance?: boolean;
  }
) {
  const supabase = (await createServerSupabaseClient()) as any;
  const { data, error } = await supabase
    .from("tables")
    .update({
      name: input.name,
      area: input.area || "Khu chính",
      capacity: input.capacity ?? 4,
      floor_label: input.floorLabel || "Tầng trệt",
      seating_zone: input.seatingZone ?? "indoor",
      table_kind: input.tableKind ?? "standard",
      reservation_priority: input.reservationPriority ?? 100,
      is_bookable: input.isBookable ?? true,
      is_hidden: input.isHidden ?? false,
      is_under_maintenance: input.isUnderMaintenance ?? false
    })
    .eq("id", input.tableId)
    .eq("restaurant_id", restaurantId)
    .select()
    .single();

  throwIfSupabaseError(error);
  return data as RestaurantTable;
}

export async function updateTableQrStatus(
  restaurantId: string,
  input: {
    tableId: string;
    qrEnabled: boolean;
  }
) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("tables")
    .update({ qr_enabled: input.qrEnabled })
    .eq("id", input.tableId)
    .eq("restaurant_id", restaurantId)
    .select()
    .single();

  throwIfSupabaseError(error);
  return data as RestaurantTable;
}

export async function deleteTable(restaurantId: string, tableId: string) {
  const supabase = await createServerSupabaseClient();
  const { count, error: activeOrderError } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .eq("table_id", tableId)
    .in("status", activeTableStatuses);

  throwIfSupabaseError(activeOrderError);

  if ((count ?? 0) > 0) {
    throw new AppError("Bàn đang có đơn hoặc hóa đơn mở. Hãy hoàn tất đơn trước khi xoá bàn.");
  }

  const { error } = await supabase
    .from("tables")
    .delete()
    .eq("id", tableId)
    .eq("restaurant_id", restaurantId);

  throwIfSupabaseError(error);
}
