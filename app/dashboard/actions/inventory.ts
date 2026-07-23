"use server";

import { revalidatePath } from "next/cache";
import { invalidateDashboardWorkspaceCaches } from "@/lib/dashboard-workspace-cache";
import { AppError } from "@/lib/response";
import {
  inventoryAlertStatusSchema,
  inventoryCategorySchema,
  inventoryCountRowsSchema,
  inventoryCountSchema,
  inventoryImportRowsSchema,
  inventoryIngredientIdSchema,
  inventoryIngredientSchema,
  inventoryMovementSchema,
  inventoryPurchaseOrderIdSchema,
  inventoryPurchaseOrderReceiptRowsSchema,
  inventoryPurchaseOrderRowsSchema,
  inventoryPurchaseOrderSchema,
  inventoryRecipeLineIdSchema,
  inventoryRecipeLineSchema,
  inventorySupplierSchema,
  inventoryTransferRowsSchema,
  inventoryTransferSchema,
  inventoryTransferWorkflowSchema,
  updateInventoryIngredientSchema
} from "@/lib/validators";
import {
  applyInventoryCount,
  createInventoryCategory,
  createInventoryIngredient,
  createInventoryPurchaseOrder,
  createInventorySupplier,
  createInventoryTransfer,
  deactivateInventoryIngredient,
  deleteInventoryRecipeLine,
  invalidateInventorySnapshotCache,
  importInventoryIntakeRows,
  processInventoryTransfer,
  receiveInventoryPurchaseOrder,
  recordInventoryMovement,
  refreshInventoryAlerts,
  type InventoryCountLineInput,
  type InventoryPurchaseOrderReceiptLineInput,
  type InventoryTransferLineInput,
  updateInventoryAlertStatus,
  updateInventoryIngredient,
  upsertInventoryRecipeLine
} from "@/services/inventory-service";
import { requireOperationalAdminSession } from "./shared";

const inventoryIdempotencyKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;

function inventoryIdempotencyKeyFromForm(formData: FormData) {
  const value = formData.get("idempotencyKey");
  if (typeof value !== "string" || !inventoryIdempotencyKeyPattern.test(value)) {
    throw new AppError("Mã chống gửi trùng của nghiệp vụ kho không hợp lệ.", 422);
  }
  return value;
}

async function revalidateInventorySurfaces(restaurantId: string, options: { dashboard?: boolean } = {}) {
  invalidateInventorySnapshotCache(restaurantId);
  await invalidateDashboardWorkspaceCaches(restaurantId, ["inventory", "overview"]);
  revalidatePath("/dashboard/inventory");
  if (options.dashboard) revalidatePath("/dashboard");
}

export type InventoryImportActionState = {
  error?: string;
  success?: string;
  inserted?: number;
  updated?: number;
  movements?: number;
  skipped?: number;
};

export async function createInventoryCategoryAction(formData: FormData) {
  const session = await requireOperationalAdminSession("inventory_basic");
  const parsed = inventoryCategorySchema.parse({
    name: formData.get("name")
  });

  await createInventoryCategory(session.restaurantId, { ...parsed, actorUserId: session.userId });
  await revalidateInventorySurfaces(session.restaurantId);
}

export async function createInventorySupplierAction(formData: FormData) {
  const session = await requireOperationalAdminSession("inventory_procurement");
  const parsed = inventorySupplierSchema.parse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    defaultLeadDays: formData.get("defaultLeadDays") || undefined,
    isPreferred: formData.get("isPreferred") === "on"
  });

  await createInventorySupplier(session.restaurantId, { ...parsed, actorUserId: session.userId });
  await revalidateInventorySurfaces(session.restaurantId);
}

export async function createInventoryPurchaseOrderAction(formData: FormData) {
  const session = await requireOperationalAdminSession("inventory_procurement");
  const parsed = inventoryPurchaseOrderSchema.parse({
    supplierId: formData.get("supplierId"),
    locationId: formData.get("locationId"),
    ingredientId: formData.get("ingredientId"),
    orderQuantity: formData.get("orderQuantity"),
    orderUnit: formData.get("orderUnit"),
    unitCost: formData.get("unitCost"),
    expectedDeliveryAt: formData.get("expectedDeliveryAt"),
    expirationDate: formData.get("expirationDate"),
    batchCode: formData.get("batchCode"),
    note: formData.get("note")
  });
  const parsedRows = inventoryPurchaseOrderRowsSchema.parse({
    rows: formData.get("rowsJson")
  });
  const lines =
    parsedRows.rows.length > 0
      ? parsedRows.rows.map((line) => ({
          ingredientId: line.ingredientId,
          orderQuantity: line.orderQuantity,
          orderUnit: line.orderUnit || undefined,
          unitCost: line.unitCost,
          expirationDate: line.expirationDate || undefined,
          batchCode: line.batchCode || undefined,
          note: line.note || undefined
        }))
      : parsed.ingredientId && typeof parsed.orderQuantity === "number" && typeof parsed.unitCost === "number"
        ? [
            {
              ingredientId: parsed.ingredientId,
              orderQuantity: parsed.orderQuantity,
              orderUnit: parsed.orderUnit || undefined,
              unitCost: parsed.unitCost,
              expirationDate: parsed.expirationDate || undefined,
              batchCode: parsed.batchCode || undefined,
              note: parsed.note || undefined
            }
          ]
        : [];

  if (lines.length === 0) {
    throw new AppError("Chưa có dòng đặt hàng hợp lệ.", 400);
  }

  await createInventoryPurchaseOrder(session.restaurantId, {
    supplierId: parsed.supplierId || null,
    locationId: parsed.locationId || null,
    expectedDeliveryAt: parsed.expectedDeliveryAt || null,
    note: parsed.note || undefined,
    actorUserId: session.userId,
    lines
  });
  await revalidateInventorySurfaces(session.restaurantId, { dashboard: true });
}

export async function receiveInventoryPurchaseOrderAction(formData: FormData) {
  const session = await requireOperationalAdminSession("inventory_procurement");
  const idempotencyKey = inventoryIdempotencyKeyFromForm(formData);
  const parsed = inventoryPurchaseOrderIdSchema.parse({
    purchaseOrderId: formData.get("purchaseOrderId")
  });
  const parsedRows = inventoryPurchaseOrderReceiptRowsSchema.parse({
    rows: formData.get("rowsJson")
  });
  const lines: InventoryPurchaseOrderReceiptLineInput[] | undefined =
    parsedRows.rows.length > 0
      ? parsedRows.rows.map((line) => ({
          purchaseOrderLineId: line.purchaseOrderLineId,
          receivedQuantity: line.receivedQuantity,
          unitCost: typeof line.unitCost === "number" ? line.unitCost : undefined,
          expirationDate: line.expirationDate || undefined,
          batchCode: line.batchCode || undefined,
          note: line.note || undefined
        }))
      : undefined;

  await receiveInventoryPurchaseOrder(session.restaurantId, {
    purchaseOrderId: parsed.purchaseOrderId,
    actorUserId: session.userId,
    idempotencyKey,
    lines
  });
  await revalidateInventorySurfaces(session.restaurantId, { dashboard: true });
}

export async function refreshInventoryAlertsAction(_formData?: FormData) {
  const session = await requireOperationalAdminSession("inventory_alerts");
  await refreshInventoryAlerts(session.restaurantId);
  await revalidateInventorySurfaces(session.restaurantId, { dashboard: true });
}

export async function applyInventoryCountAction(formData: FormData) {
  const session = await requireOperationalAdminSession("inventory_warehouse_advanced");
  const idempotencyKey = inventoryIdempotencyKeyFromForm(formData);
  const parsed = inventoryCountSchema.parse({
    title: formData.get("title"),
    locationId: formData.get("locationId"),
    ingredientId: formData.get("ingredientId"),
    countedQuantity: formData.get("countedQuantity"),
    note: formData.get("note")
  });
  const parsedRows = inventoryCountRowsSchema.parse({
    rows: formData.get("rowsJson")
  });
  const lines: InventoryCountLineInput[] =
    parsedRows.rows.length > 0
      ? parsedRows.rows.flatMap((line) =>
          line.ingredientId && typeof line.countedQuantity === "number"
            ? [
                {
                  ingredientId: line.ingredientId,
                  countedQuantity: line.countedQuantity,
                  locationId: line.locationId || parsed.locationId || null,
                  note: line.note || undefined
                }
              ]
            : []
        )
      : parsed.ingredientId && typeof parsed.countedQuantity === "number"
        ? [
            {
              ingredientId: parsed.ingredientId,
              countedQuantity: parsed.countedQuantity,
              locationId: parsed.locationId || null,
              note: parsed.note || undefined
            }
          ]
        : [];

  if (lines.length === 0) {
    throw new AppError("Chưa có dòng kiểm kê hợp lệ.", 400);
  }

  await applyInventoryCount(session.restaurantId, {
    title: parsed.title || undefined,
    locationId: parsed.locationId || null,
    note: parsed.note || undefined,
    actorUserId: session.userId,
    idempotencyKey,
    lines
  });
  await revalidateInventorySurfaces(session.restaurantId, { dashboard: true });
}

export async function createInventoryTransferAction(formData: FormData) {
  const session = await requireOperationalAdminSession("inventory_warehouse_advanced");
  const idempotencyKey = inventoryIdempotencyKeyFromForm(formData);
  const parsed = inventoryTransferSchema.parse({
    fromLocationId: formData.get("fromLocationId"),
    toLocationId: formData.get("toLocationId"),
    ingredientId: formData.get("ingredientId"),
    quantity: formData.get("quantity"),
    unit: formData.get("unit"),
    note: formData.get("note")
  });
  const parsedRows = inventoryTransferRowsSchema.parse({
    rows: formData.get("rowsJson")
  });
  const lines: InventoryTransferLineInput[] =
    parsedRows.rows.length > 0
      ? parsedRows.rows.flatMap((line) =>
          line.ingredientId && typeof line.quantity === "number"
            ? [
                {
                  ingredientId: line.ingredientId,
                  quantity: line.quantity,
                  unit: line.unit || undefined,
                  batchId: line.batchId || null,
                  note: line.note || undefined
                }
              ]
            : []
        )
      : parsed.ingredientId && typeof parsed.quantity === "number"
        ? [
            {
              ingredientId: parsed.ingredientId,
              quantity: parsed.quantity,
              unit: parsed.unit || undefined,
              note: parsed.note || undefined
            }
          ]
        : [];

  if (lines.length === 0) {
    throw new AppError("Chưa có dòng điều chuyển hợp lệ.", 400);
  }

  await createInventoryTransfer(session.restaurantId, {
    fromLocationId: parsed.fromLocationId,
    toLocationId: parsed.toLocationId,
    note: parsed.note || undefined,
    actorUserId: session.userId,
    idempotencyKey,
    lines
  });
  await revalidateInventorySurfaces(session.restaurantId, { dashboard: true });
}

export async function processInventoryTransferAction(formData: FormData) {
  const session = await requireOperationalAdminSession("inventory_warehouse_advanced");
  const idempotencyKey = inventoryIdempotencyKeyFromForm(formData);
  const parsed = inventoryTransferWorkflowSchema.parse({
    transferId: formData.get("transferId"),
    action: formData.get("action"),
    note: formData.get("note"),
    lines: formData.get("linesJson") || undefined
  });

  await processInventoryTransfer(session.restaurantId, {
    transferId: parsed.transferId,
    action: parsed.action,
    note: parsed.note || undefined,
    lines: parsed.lines?.map((line) => ({
      lineId: line.lineId,
      receivedQuantity: line.receivedQuantity,
      note: line.note || undefined
    })),
    actorUserId: session.userId,
    idempotencyKey
  });
  await revalidateInventorySurfaces(session.restaurantId, { dashboard: true });
}

export async function updateInventoryAlertStatusAction(formData: FormData) {
  const session = await requireOperationalAdminSession("inventory_alerts");
  const parsed = inventoryAlertStatusSchema.parse({
    alertId: formData.get("alertId"),
    status: formData.get("status")
  });

  await updateInventoryAlertStatus(session.restaurantId, {
    alertId: parsed.alertId,
    status: parsed.status,
    actorUserId: session.userId
  });
  await revalidateInventorySurfaces(session.restaurantId, { dashboard: true });
}

export async function createInventoryIngredientAction(formData: FormData) {
  const session = await requireOperationalAdminSession("inventory_basic");
  const parsed = inventoryIngredientSchema.parse({
    categoryId: formData.get("categoryId"),
    name: formData.get("name"),
    unit: formData.get("unit"),
    onHandQuantity: formData.get("onHandQuantity"),
    minimumQuantity: formData.get("minimumQuantity"),
    referenceUnitCost: formData.get("referenceUnitCost"),
    storageArea: formData.get("storageArea"),
    shelfCode: formData.get("shelfCode"),
    storageNote: formData.get("storageNote"),
    reorderLeadDays: formData.get("reorderLeadDays") || undefined
  });

  await createInventoryIngredient(session.restaurantId, {
    categoryId: parsed.categoryId || null,
    name: parsed.name,
    unit: parsed.unit,
    onHandQuantity: parsed.onHandQuantity,
    minimumQuantity: parsed.minimumQuantity,
    referenceUnitCost: parsed.referenceUnitCost,
    storageArea: parsed.storageArea || undefined,
    shelfCode: parsed.shelfCode || undefined,
    storageNote: parsed.storageNote || undefined,
    reorderLeadDays: parsed.reorderLeadDays,
    actorUserId: session.userId
  });
  await revalidateInventorySurfaces(session.restaurantId);
}

export async function updateInventoryIngredientAction(formData: FormData) {
  const session = await requireOperationalAdminSession("inventory_basic");
  const parsed = updateInventoryIngredientSchema.parse({
    ingredientId: formData.get("ingredientId"),
    categoryId: formData.get("categoryId"),
    name: formData.get("name"),
    unit: formData.get("unit"),
    onHandQuantity: formData.get("onHandQuantity") || 0,
    minimumQuantity: formData.get("minimumQuantity"),
    referenceUnitCost: formData.get("referenceUnitCost"),
    storageArea: formData.get("storageArea"),
    shelfCode: formData.get("shelfCode"),
    storageNote: formData.get("storageNote"),
    reorderLeadDays: formData.get("reorderLeadDays") || undefined
  });

  await updateInventoryIngredient(session.restaurantId, {
    ingredientId: parsed.ingredientId,
    categoryId: parsed.categoryId || null,
    name: parsed.name,
    unit: parsed.unit,
    minimumQuantity: parsed.minimumQuantity,
    referenceUnitCost: parsed.referenceUnitCost,
    storageArea: parsed.storageArea || undefined,
    shelfCode: parsed.shelfCode || undefined,
    storageNote: parsed.storageNote || undefined,
    reorderLeadDays: parsed.reorderLeadDays,
    onHandQuantity: parsed.onHandQuantity,
    actorUserId: session.userId
  });
  await revalidateInventorySurfaces(session.restaurantId, { dashboard: true });
}

export async function deactivateInventoryIngredientAction(formData: FormData) {
  const session = await requireOperationalAdminSession("inventory_basic");
  const parsed = inventoryIngredientIdSchema.parse({
    ingredientId: formData.get("ingredientId")
  });

  await deactivateInventoryIngredient(session.restaurantId, parsed.ingredientId, session.userId);
  await revalidateInventorySurfaces(session.restaurantId, { dashboard: true });
}

export async function recordInventoryMovementAction(formData: FormData) {
  const session = await requireOperationalAdminSession("inventory_basic");
  const parsed = inventoryMovementSchema.parse({
    ingredientId: formData.get("ingredientId"),
    movementType: formData.get("movementType"),
    quantity: formData.get("quantity"),
    unitCost: formData.get("unitCost") || undefined,
    locationId: formData.get("locationId") || undefined,
    batchId: formData.get("batchId") || undefined,
    stockBalanceId: formData.get("stockBalanceId") || undefined,
    reason: formData.get("reason")
  });

  await recordInventoryMovement(session.restaurantId, {
    ingredientId: parsed.ingredientId,
    movementType: parsed.movementType,
    quantity: parsed.quantity,
    unitCost: parsed.unitCost,
    reason: parsed.reason,
    locationId: parsed.locationId || null,
    batchId: parsed.batchId || null,
    sourceType: parsed.movementType === "expired" ? "expiry" : parsed.movementType === "supplier_return" ? "supplier" : "manual",
    metadata: {
      recordedFrom: "inventory_dashboard",
      stockBalanceId: parsed.stockBalanceId || null
    },
    actorUserId: session.userId
  });
  await revalidateInventorySurfaces(session.restaurantId, { dashboard: true });
}

export async function importInventoryIntakeAction(
  _prevState: InventoryImportActionState | undefined,
  formData: FormData
): Promise<InventoryImportActionState> {
  const session = await requireOperationalAdminSession("inventory_procurement");
  const parsed = inventoryImportRowsSchema.safeParse({
    rows: formData.get("rowsJson")
  });

  if (!parsed.success || parsed.data.rows.length === 0) {
    return { error: "Chưa có dòng nhập kho hợp lệ để xử lý." };
  }

  const result = await importInventoryIntakeRows(session.restaurantId, {
    rows: parsed.data.rows.map((row) => ({
      ...row,
      categoryName: row.categoryName || undefined
    })),
    actorUserId: session.userId
  });

  await revalidateInventorySurfaces(session.restaurantId, { dashboard: true });

  return {
    ...result,
    success: `Đã xử lý ${result.inserted + result.updated} nguyên liệu, ghi ${result.movements} phiếu nhập kho.`
  };
}

export async function upsertInventoryRecipeLineAction(formData: FormData) {
  const session = await requireOperationalAdminSession("inventory_premium");
  const parsed = inventoryRecipeLineSchema.parse({
    menuItemId: formData.get("menuItemId"),
    ingredientId: formData.get("ingredientId"),
    quantityPerItem: formData.get("quantityPerItem"),
    wastePercent: formData.get("wastePercent") || undefined
  });

  await upsertInventoryRecipeLine(session.restaurantId, { ...parsed, actorUserId: session.userId });
  await revalidateInventorySurfaces(session.restaurantId);
}

export async function deleteInventoryRecipeLineAction(formData: FormData) {
  const session = await requireOperationalAdminSession("inventory_premium");
  const parsed = inventoryRecipeLineIdSchema.parse({
    recipeLineId: formData.get("recipeLineId")
  });

  await deleteInventoryRecipeLine(session.restaurantId, parsed.recipeLineId, session.userId);
  await revalidateInventorySurfaces(session.restaurantId);
}
