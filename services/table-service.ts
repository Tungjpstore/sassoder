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
  const supabase = await createServerSupabaseClient();
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
  const supabase = await createServerSupabaseClient();
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
      ...table,
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

export async function getPublicTable(restaurantId: string, tableId: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("tables")
    .select("*")
    .eq("id", tableId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  throwIfSupabaseError(error);
  return data as RestaurantTable | null;
}

export async function createTable(
  restaurantId: string,
  _restaurantSlug: string,
  input: {
    name: string;
    area?: string;
    capacity?: number;
  }
) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("tables")
    .insert({
      restaurant_id: restaurantId,
      name: input.name,
      area: input.area || "Khu chính",
      capacity: input.capacity ?? 4
    })
    .select()
    .single();

  throwIfSupabaseError(error);
  return data as RestaurantTable;
}

export async function updateTable(
  restaurantId: string,
  input: {
    tableId: string;
    name: string;
    area?: string;
    capacity?: number;
  }
) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("tables")
    .update({
      name: input.name,
      area: input.area || "Khu chính",
      capacity: input.capacity ?? 4
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
