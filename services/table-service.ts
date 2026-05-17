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
  branch_id?: string | null;
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
  activeBillCount: number;
  activeReservationCount: number;
  unpaidTotal: number;
  overdueCount: number;
  oldestOrderAt: string | null;
  nextServiceDueAt: string | null;
};

export type TableBranchOption = {
  id: string;
  name: string;
  address: string | null;
  is_primary: boolean;
};

function normalizeBranchId(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function isMissingTableBranchColumn(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "PGRST204" ||
    error.code === "42703" ||
    /Could not find.*branch_id|column .*branch_id.*does not exist|schema cache.*branch_id/i.test(error.message ?? "")
  );
}

async function resolveTableBranchId(supabase: any, restaurantId: string, branchId?: string | null) {
  const normalized = normalizeBranchId(branchId);
  if (!normalized) return null;

  const { data, error } = await supabase
    .from("store_branches")
    .select("id")
    .eq("id", normalized)
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .maybeSingle();

  throwIfSupabaseError(error);
  if (!data) throw new AppError("Chi nhánh của bàn không khả dụng.", 400);
  return normalized;
}

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

export async function listActiveTableBranches(restaurantId: string): Promise<TableBranchOption[]> {
  const supabase = (await createServerSupabaseClient()) as any;
  const { data, error } = await supabase
    .from("store_branches")
    .select("id,name,address,is_primary")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .order("name", { ascending: true });

  throwIfSupabaseError(error);
  return (data ?? []) as TableBranchOption[];
}

type TableOrderRow = {
  id: string;
  table_id: string | null;
  status: OrderStatus;
  total: number;
  created_at: string;
  service_due_at: string | null;
};

type TableBillRow = {
  id: string;
  table_id: string | null;
  status: "open" | "waiting_payment" | "waiting_confirm" | "paid" | "cancelled";
  total: number;
  reservation_id: string | null;
  created_at: string;
};

type ReservationLockOccupancyRow = {
  id: string;
  table_id: string | null;
  starts_at: string;
  ends_at: string;
  reservation?:
    | {
        id: string;
        status: string;
        seated_table_bill_id: string | null;
      }
    | Array<{
        id: string;
        status: string;
        seated_table_bill_id: string | null;
      }>
    | null;
};

const activeTableStatuses: OrderStatus[] = ["pending", "ordering", "completed", "waiting_payment", "waiting_confirm"];
const activeTableBillStatuses: TableBillRow["status"][] = ["open", "waiting_payment", "waiting_confirm"];

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

function getTableStatus(orders: TableOrderRow[], bills: TableBillRow[] = [], hasSeatedReservation = false): TableOperationalStatus {
  const now = Date.now();
  if (orders.some((order) => ["pending", "ordering"].includes(order.status) && order.service_due_at && new Date(order.service_due_at).getTime() < now)) {
    return "overdue";
  }
  if (orders.some((order) => order.status === "pending")) return "needs_confirm";
  if (bills.some((bill) => bill.status === "waiting_payment" || bill.status === "waiting_confirm")) return "awaiting_payment";
  if (orders.some((order) => order.status === "ordering")) return "serving";
  if (orders.some((order) => ["completed", "waiting_payment", "waiting_confirm"].includes(order.status))) return "awaiting_payment";
  if (bills.some((bill) => bill.status === "open")) return "serving";
  if (hasSeatedReservation) return "serving";
  return "available";
}

function firstReservationLockReservation(lock: ReservationLockOccupancyRow) {
  return Array.isArray(lock.reservation) ? lock.reservation[0] ?? null : lock.reservation ?? null;
}

export async function listTablesWithStatus(restaurantId: string): Promise<RestaurantTableWithStatus[]> {
  const supabase = (await createServerSupabaseClient()) as any;
  const [tablesResult, ordersResult, billsResult, reservationLocksResult] = await Promise.all([
    supabase.from("tables").select("*").eq("restaurant_id", restaurantId).order("name", { ascending: true }),
    supabase
      .from("orders")
      .select("id,table_id,status,total,created_at,service_due_at")
      .eq("restaurant_id", restaurantId)
      .in("status", activeTableStatuses)
      .order("created_at", { ascending: true }),
    supabase
      .from("table_bills")
      .select("id,table_id,status,total,reservation_id,created_at")
      .eq("restaurant_id", restaurantId)
      .in("status", activeTableBillStatuses)
      .order("created_at", { ascending: true }),
    supabase
      .from("reservation_table_locks")
      .select("id,table_id,starts_at,ends_at,reservation:reservations(id,status,seated_table_bill_id)")
      .eq("restaurant_id", restaurantId)
      .eq("status", "active")
  ]);

  throwIfSupabaseError(tablesResult.error);
  throwIfSupabaseError(ordersResult.error);
  throwIfSupabaseError(billsResult.error);
  throwIfSupabaseError(reservationLocksResult.error);

  const ordersByTable = new Map<string, TableOrderRow[]>();
  for (const order of (ordersResult.data ?? []) as TableOrderRow[]) {
    if (!order.table_id) continue;
    const list = ordersByTable.get(order.table_id) ?? [];
    list.push(order);
    ordersByTable.set(order.table_id, list);
  }

  const billsByTable = new Map<string, TableBillRow[]>();
  for (const bill of (billsResult.data ?? []) as TableBillRow[]) {
    if (!bill.table_id) continue;
    const list = billsByTable.get(bill.table_id) ?? [];
    list.push(bill);
    billsByTable.set(bill.table_id, list);
  }

  const seatedReservationsByTable = new Map<string, ReservationLockOccupancyRow[]>();
  for (const lock of (reservationLocksResult.data ?? []) as ReservationLockOccupancyRow[]) {
    if (!lock.table_id) continue;
    const reservation = firstReservationLockReservation(lock);
    if (reservation?.status !== "seated") continue;
    const list = seatedReservationsByTable.get(lock.table_id) ?? [];
    list.push(lock);
    seatedReservationsByTable.set(lock.table_id, list);
  }

  const now = Date.now();
  return ((tablesResult.data ?? []) as RestaurantTable[]).map((table) => {
    const tableOrders = ordersByTable.get(table.id) ?? [];
    const tableBills = billsByTable.get(table.id) ?? [];
    const tableReservationLocks = seatedReservationsByTable.get(table.id) ?? [];
    const dueDates = tableOrders
      .map((order) => order.service_due_at)
      .filter((value): value is string => Boolean(value))
      .sort();
    const billTotal = tableBills.reduce((sum, bill) => sum + bill.total, 0);
    const orderTotal = tableOrders.reduce((sum, order) => sum + order.total, 0);

    return {
      ...withQrToken(table),
      status: getTableStatus(tableOrders, tableBills, tableReservationLocks.length > 0),
      activeOrderCount: tableOrders.length,
      activeBillCount: tableBills.length,
      activeReservationCount: tableReservationLocks.length,
      unpaidTotal: tableBills.length > 0 ? billTotal : orderTotal,
      overdueCount: tableOrders.filter(
        (order) => ["pending", "ordering"].includes(order.status) && order.service_due_at && new Date(order.service_due_at).getTime() < now
      ).length,
      oldestOrderAt: tableOrders[0]?.created_at ?? tableBills[0]?.created_at ?? null,
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
    branchId?: string;
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
  const branchId = await resolveTableBranchId(supabase, restaurantId, input.branchId);
  const payload = {
    restaurant_id: restaurantId,
    branch_id: branchId,
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
  };
  const { data, error } = await supabase
    .from("tables")
    .insert(payload)
    .select()
    .single();

  if (error && isMissingTableBranchColumn(error)) {
    const { branch_id: _branchId, ...legacyPayload } = payload;
    void _branchId;
    const fallback = await supabase.from("tables").insert(legacyPayload).select().single();
    throwIfSupabaseError(fallback.error);
    return fallback.data as RestaurantTable;
  }

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
    branchId?: string;
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
  const branchId = await resolveTableBranchId(supabase, restaurantId, input.branchId);
  const payload = {
    name: input.name,
    branch_id: branchId,
    area: input.area || "Khu chính",
    capacity: input.capacity ?? 4,
    floor_label: input.floorLabel || "Tầng trệt",
    seating_zone: input.seatingZone ?? "indoor",
    table_kind: input.tableKind ?? "standard",
    reservation_priority: input.reservationPriority ?? 100,
    is_bookable: input.isBookable ?? true,
    is_hidden: input.isHidden ?? false,
    is_under_maintenance: input.isUnderMaintenance ?? false
  };
  const { data, error } = await supabase
    .from("tables")
    .update(payload)
    .eq("id", input.tableId)
    .eq("restaurant_id", restaurantId)
    .select()
    .single();

  if (error && isMissingTableBranchColumn(error)) {
    const { branch_id: _branchId, ...legacyPayload } = payload;
    void _branchId;
    const fallback = await supabase
      .from("tables")
      .update(legacyPayload)
      .eq("id", input.tableId)
      .eq("restaurant_id", restaurantId)
      .select()
      .single();
    throwIfSupabaseError(fallback.error);
    return fallback.data as RestaurantTable;
  }

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
