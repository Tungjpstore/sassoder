"use server";

import { revalidatePath } from "next/cache";
import { invalidateDashboardWorkspaceCaches } from "@/lib/dashboard-workspace-cache";
import { tableIdSchema, tableQrStatusSchema, tableSchema, updateTableSchema } from "@/lib/validators";
import { invalidateRestaurantDashboardCache } from "@/services/restaurant-service";
import { createTable, deleteTable, rotateTableQrToken, updateTable, updateTableQrStatus } from "@/services/table-service";
import { assertRestaurantResourceLimit } from "@/services/subscription-service";
import { requireOperationalAdminSession } from "./shared";

async function revalidateTableSurfaces(restaurantId: string, options: { settings?: boolean } = {}) {
  invalidateRestaurantDashboardCache(restaurantId);
  await invalidateDashboardWorkspaceCaches(restaurantId, ["tables", "reservations", "overview"]);
  revalidatePath("/dashboard/tables");
  revalidatePath("/dashboard/reservations");
  if (options.settings) revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
}

export async function createTableAction(formData: FormData) {
  const session = await requireOperationalAdminSession("table_qr");
  const parsed = tableSchema.parse({
    name: formData.get("name"),
    branchId: formData.get("branchId"),
    area: formData.get("area"),
    capacity: formData.get("capacity"),
    floorLabel: formData.get("floorLabel"),
    seatingZone: formData.get("seatingZone"),
    tableKind: formData.get("tableKind"),
    reservationPriority: formData.get("reservationPriority"),
    isBookable: formData.has("isBookable") ? formData.get("isBookable") === "true" : true,
    isHidden: formData.get("isHidden") === "true",
    isUnderMaintenance: formData.get("isUnderMaintenance") === "true"
  });
  await assertRestaurantResourceLimit({
    restaurantId: session.restaurantId,
    featureKey: "table_qr",
    table: "tables",
    label: "bàn"
  });
  await createTable(session.restaurantId, session.restaurant.slug, parsed);
  await revalidateTableSurfaces(session.restaurantId);
}

export async function updateTableAction(formData: FormData) {
  const session = await requireOperationalAdminSession("table_qr");
  const parsed = updateTableSchema.parse({
    tableId: formData.get("tableId"),
    name: formData.get("name"),
    branchId: formData.get("branchId"),
    area: formData.get("area"),
    capacity: formData.get("capacity"),
    floorLabel: formData.get("floorLabel"),
    seatingZone: formData.get("seatingZone"),
    tableKind: formData.get("tableKind"),
    reservationPriority: formData.get("reservationPriority"),
    isBookable: formData.get("isBookable") === "true",
    isHidden: formData.get("isHidden") === "true",
    isUnderMaintenance: formData.get("isUnderMaintenance") === "true"
  });
  await updateTable(session.restaurantId, parsed);
  await revalidateTableSurfaces(session.restaurantId, { settings: true });
}

export async function toggleTableQrAction(formData: FormData) {
  const session = await requireOperationalAdminSession("table_qr");
  const parsed = tableQrStatusSchema.parse({
    tableId: formData.get("tableId"),
    qrEnabled: formData.get("qrEnabled") === "true"
  });
  await updateTableQrStatus(session.restaurantId, parsed);
  await revalidateTableSurfaces(session.restaurantId, { settings: true });
}

export async function rotateTableQrAction(formData: FormData) {
  const session = await requireOperationalAdminSession("table_qr");
  const parsed = tableIdSchema.parse({
    tableId: formData.get("tableId")
  });
  await rotateTableQrToken(session.restaurantId, parsed.tableId);
  await revalidateTableSurfaces(session.restaurantId, { settings: true });
}

export async function deleteTableAction(formData: FormData) {
  const session = await requireOperationalAdminSession("table_qr");
  const parsed = tableIdSchema.parse({
    tableId: formData.get("tableId")
  });
  await deleteTable(session.restaurantId, parsed.tableId);
  await revalidateTableSurfaces(session.restaurantId, { settings: true });
}
